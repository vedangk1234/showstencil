import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { findDominatorsForUser } from '@/lib/dominator-finder'

// Runs daily at 4 AM UTC — assigns a Dominator competitor for users who don't have one yet.
// Once assigned, the dominator is never replaced by this cron — their data is updated daily
// by /api/cron/refresh-data like any other competitor.
export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createServiceClient()

  const { data: users } = await supabase
    .from('users')
    .select('id, niche_id, sub_niche, sub_niche_keywords, subscription_plan')
    .eq('onboarding_completed', true)
    .not('youtube_access_token', 'is', null)
    .in('subscription_status', ['on_trial', 'active', 'past_due'])

  if (!users || users.length === 0) {
    return NextResponse.json({ processed: 0, message: 'No eligible users' })
  }

  let processed = 0
  let succeeded = 0
  let skipped = 0
  let failed = 0

  for (const user of users) {
    processed++
    try {
      if (!user.niche_id) continue

      // Skip-if-exists: if this user already has an active dominator, don't replace it.
      // The dominator's data is refreshed daily by refresh-data cron.
      const { data: existingDominator } = await supabase
        .from('competitors')
        .select('id')
        .eq('user_id', user.id)
        .eq('is_dominator', true)
        .eq('is_active', true)
        .maybeSingle()

      if (existingDominator) {
        console.log(`[cron/dominator-refresh] User ${user.id} already has a dominator — skipping`)
        skipped++
        continue
      }

      const dominatorCount = user.subscription_plan === 'pro' ? 2 : 1

      const userSubNiche =
        user.sub_niche
          ? {
              sub_niche: user.sub_niche,
              keywords: (user.sub_niche_keywords as string[]) || [],
              confidence: 0.8,
            }
          : null

      const dominators = await findDominatorsForUser(
        user.niche_id,
        userSubNiche,
        dominatorCount,
      )

      if (dominators.length === 0) {
        succeeded++
        continue
      }

      // Insert new dominators (no deactivation of existing — there are none)
      for (const dom of dominators) {
        await supabase.from('competitors').upsert(
          {
            user_id: user.id,
            youtube_channel_id: dom.channelId,
            channel_name: dom.channelName,
            channel_thumbnail: dom.thumbnail ?? null,
            subscriber_count: dom.subscriberCount,
            total_views: dom.totalViews,
            tier: 3,
            is_auto_detected: true,
            is_searched: false,
            is_active: true,
            is_dominator: true,
            sub_niche: dom.sub_niche ?? null,
            sub_niche_keywords: dom.sub_niche_keywords ?? [],
            last_synced_at: new Date().toISOString(),
          },
          { onConflict: 'user_id,youtube_channel_id' },
        )

        // Record in dominator_history
        await supabase
          .from('dominator_history')
          .update({ is_current: false, replaced_at: new Date().toISOString() })
          .eq('user_id', user.id)
          .eq('is_current', true)

        await supabase.from('dominator_history').insert({
          user_id: user.id,
          channel_id: dom.channelId,
          channel_name: dom.channelName,
          detected_at: new Date().toISOString(),
          is_current: true,
        })
      }

      succeeded++
    } catch (err) {
      console.error(`[cron/dominator-refresh] Failed for user ${user.id}:`, err)
      failed++
    }

    await new Promise((r) => setTimeout(r, 500))
  }

  return NextResponse.json({ processed, succeeded, skipped, failed })
}
