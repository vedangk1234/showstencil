import { auth, signOut } from '@/auth'
import { createServiceClient } from '@/lib/supabase'
import { NextResponse } from 'next/server'
import { cancelSubscription, getSubscriptionDetails } from '@/lib/paypal'
import { logError } from '@/lib/logger'

export async function POST() {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const userId = session.user.id

  const supabase = createServiceClient()

  // Get user to check subscription status
  const { data: user } = await supabase
    .from('users')
    .select('paypal_subscription_id, subscription_status, youtube_access_token')
    .eq('id', userId)
    .single()

  // Cancel the PayPal subscription for ANY subscription that isn't already dead.
  // Checking the LOCAL status only (the old behaviour) left a past_due/suspended sub
  // live on PayPal — it could be un-suspended and keep charging a deleted account.
  // We confirm the real remote status and cancel unless it's already cancelled/expired.
  if (user && user.paypal_subscription_id) {
    try {
      const remote = await getSubscriptionDetails(user.paypal_subscription_id)
      const deadStatuses = ['CANCELLED', 'EXPIRED']
      if (!deadStatuses.includes(remote.status)) {
        await cancelSubscription(user.paypal_subscription_id)
      }
    } catch (err) {
      console.error('[account/delete] PayPal cancel error:', err)
      // Best-effort: if PayPal is unreachable, try a blind cancel, then continue.
      try {
        await cancelSubscription(user.paypal_subscription_id)
      } catch {
        // Continue with deletion even if cancel fails.
      }
      void logError({
        userId,
        route: 'api/account/delete',
        error: err instanceof Error ? err.message : String(err),
        details: { step: 'paypal_cancel' },
        severity: 'warn',
      })
    }
  }

  // Revoke Google/YouTube access before deleting the user row so access is
  // fully cut (YouTube ToS III.E.4). Non-fatal — deletion proceeds regardless.
  if (user && user.youtube_access_token) {
    try {
      await fetch(
        `https://oauth2.googleapis.com/revoke?token=${user.youtube_access_token}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        },
      )
    } catch (err) {
      console.error('[account/delete] YouTube token revoke error:', err)
      void logError({
        userId,
        route: 'api/account/delete',
        error: err instanceof Error ? err.message : String(err),
        details: { step: 'token_revoke' },
        severity: 'warn',
      })
    }
  }

  // Delete all user data in FK-safe order
  try {
    await supabase.from('thumbnail_jobs').delete().eq('user_id', userId)
    await supabase.from('ideas').delete().eq('user_id', userId)
    await supabase.from('digests').delete().eq('user_id', userId)
    await supabase.from('trends').delete().eq('user_id', userId)
    await supabase.from('gap_scores').delete().eq('user_id', userId)

    // Delete competitor children first
    const { data: competitorRows } = await supabase
      .from('competitors')
      .select('id')
      .eq('user_id', userId)

    if (competitorRows && competitorRows.length > 0) {
      const competitorIds = competitorRows.map(c => c.id)
      await supabase.from('competitor_videos').delete().in('competitor_id', competitorIds)
      await supabase.from('competitor_snapshots').delete().in('competitor_id', competitorIds)
    }

    await supabase.from('competitors').delete().eq('user_id', userId)
    await supabase.from('channel_snapshots').delete().eq('user_id', userId)
    await supabase.from('videos').delete().eq('user_id', userId)
    await supabase.from('user_settings').delete().eq('user_id', userId)
    await supabase.from('user_search_history').delete().eq('user_id', userId)
    await supabase.from('dominator_history').delete().eq('user_id', userId)

    // GDPR erasure: sync_logs (email, ip, city, user_agent) and error_logs
    // (user_id + possibly-PII messages) use ON DELETE SET NULL, so the user-row
    // delete would NOT remove them. Delete them explicitly before the user row.
    await supabase.from('sync_logs').delete().eq('user_id', userId)
    await supabase.from('error_logs').delete().eq('user_id', userId)

    // Delete the user row last
    await supabase.from('users').delete().eq('id', userId)
  } catch (err) {
    console.error('[account/delete] DB deletion error:', err)
    void logError({
      userId,
      route: 'api/account/delete',
      error: err instanceof Error ? err.message : String(err),
      details: { error_stack: err instanceof Error ? err.stack : undefined },
    })
    return NextResponse.json({ error: 'Failed to delete account data. Please try again.' }, { status: 500 })
  }

  // Sign out
  await signOut({ redirect: false })

  return NextResponse.json({ success: true })
}
