import { auth, signOut } from '@/auth'
import { createServiceClient } from '@/lib/supabase'
import { NextResponse } from 'next/server'
import { cancelSubscription } from '@/lib/paypal'

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
    .select('paypal_subscription_id, subscription_status')
    .eq('id', userId)
    .single()

  // Cancel PayPal subscription if active
  if (
    user &&
    user.paypal_subscription_id &&
    (user.subscription_status === 'active' || user.subscription_status === 'on_trial')
  ) {
    try {
      await cancelSubscription(user.paypal_subscription_id)
    } catch (err) {
      console.error('[account/delete] PayPal cancel error:', err)
      // Continue with deletion even if cancel fails
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

    // Delete the user row last
    await supabase.from('users').delete().eq('id', userId)
  } catch (err) {
    console.error('[account/delete] DB deletion error:', err)
    return NextResponse.json({ error: 'Failed to delete account data. Please try again.' }, { status: 500 })
  }

  // Sign out
  await signOut({ redirect: false })

  return NextResponse.json({ success: true })
}
