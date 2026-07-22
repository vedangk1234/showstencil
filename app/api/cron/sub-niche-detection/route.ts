import { NextResponse } from 'next/server'
import { assertCron } from '@/lib/cron-auth'
import { createServiceClient } from '@/lib/supabase'
import { detectSubNiche } from '@/lib/sub-niche-detector'
import { logError } from '@/lib/logger'

// Runs daily at 5 AM UTC — detects/refreshes sub-niche for users missing it
export async function GET(request: Request) {
  const denied = assertCron(request)
  if (denied) return denied

  const supabase = createServiceClient()

  // Only users without a sub_niche or with stale detection (> 30 days)
  const thirtyDaysAgo = new Date()
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

  const { data: users, error: usersErr } = await supabase
    .from('users')
    .select('id')
    .eq('onboarding_completed', true)
    .not('youtube_access_token', 'is', null)
    .or(
      `sub_niche.is.null,sub_niche_detected_at.lt.${thirtyDaysAgo.toISOString()}`,
    )
    .limit(50) // Process up to 50 per run to avoid timeouts

  if (usersErr) {
    void logError({
      route: 'api/cron/sub-niche-detection',
      error: 'Failed to load eligible users',
      details: { supabaseError: usersErr.message },
      severity: 'error',
    })
    return NextResponse.json({ error: 'Failed to load users' }, { status: 500 })
  }

  if (!users || users.length === 0) {
    return NextResponse.json({ processed: 0, message: 'All users have fresh sub-niche data' })
  }

  let processed = 0
  let succeeded = 0
  let failed = 0

  for (const { id: userId } of users) {
    processed++
    try {
      // Get recent video titles for this user
      const { data: videos } = await supabase
        .from('videos')
        .select('title')
        .eq('user_id', userId)
        .not('title', 'is', null)
        .order('published_at', { ascending: false })
        .limit(20)

      if (!videos || videos.length < 3) {
        succeeded++
        continue
      }

      const result = await detectSubNiche(
        videos.map((v) => ({ title: v.title as string })),
      )

      if (result.confidence < 0.3) {
        succeeded++
        continue
      }

      await supabase
        .from('users')
        .update({
          sub_niche: result.sub_niche,
          sub_niche_keywords: result.keywords,
          sub_niche_confidence: result.confidence,
          sub_niche_detected_at: new Date().toISOString(),
        })
        .eq('id', userId)

      succeeded++
    } catch (err) {
      console.error(`[cron/sub-niche-detection] Failed for user ${userId}:`, err)
      void logError({
        userId,
        route: 'api/cron/sub-niche-detection',
        error: err instanceof Error ? err.message : String(err),
        details: { stack: err instanceof Error ? err.stack : undefined },
        severity: 'warn',
      })
      failed++
    }

    // 1s delay between Claude calls to avoid rate limits
    await new Promise((r) => setTimeout(r, 1000))
  }

  return NextResponse.json({ processed, succeeded, failed })
}
