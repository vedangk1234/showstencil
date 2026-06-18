/**
 * app/api/cron/user-sync/route.ts
 * GET /api/cron/user-sync
 *
 * Runs every day at 3:00 AM UTC (schedule: "0 3 * * *").
 * Refreshes each active user's own YouTube Analytics data by calling
 * syncUserChannel() from lib/sync-logic.ts directly — no self-HTTP call.
 *
 * Security: requires Authorization: Bearer <CRON_SECRET> header.
 *
 * Performance budget: ~3-5s per user (5 parallel YouTube Analytics calls).
 * At ~2 users we approach the 10s Vercel Hobby function timeout.
 * Beyond 2 users, upgrade to Vercel Pro (60s timeout) or batch users across
 * multiple cron invocations.
 */

import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { syncUserChannel } from '@/lib/sync-logic'
import { logError } from '@/lib/logger'

export async function GET(request: Request) {
  const startMs = Date.now()

  // ── Auth check ─────────────────────────────────────────────────────────────
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createServiceClient()
  console.log('[cron/user-sync] Starting daily user analytics sync')

  // ── Load eligible users ────────────────────────────────────────────────────
  const { data: users, error } = await supabase
    .from('users')
    .select('id')
    .eq('onboarding_completed', true)
    .not('youtube_access_token', 'is', null)

  if (error) {
    console.error('[cron/user-sync] Failed to load users:', error.message)
    void logError({
      route: 'cron/user-sync',
      error: error.message,
    })
    return NextResponse.json({ error: 'Failed to load users' }, { status: 500 })
  }

  const userList = users ?? []
  console.log(`[cron/user-sync] Found ${userList.length} users to sync`)

  // ── Sync all users in parallel ─────────────────────────────────────────────
  const results = await Promise.allSettled(
    userList.map(async (user) => {
      try {
        const result = await syncUserChannel(user.id)
        if (result.success) {
          console.log(
            `[cron/user-sync] User ${user.id}: snapshot=${result.channelSnapshot}, videos=${result.videosSynced}`,
          )
        } else {
          console.error(`[cron/user-sync] User ${user.id}: failed — ${result.error}`)
          void logError({
            userId: user.id,
            route: 'cron/user-sync',
            error: result.error ?? 'syncUserChannel returned success=false',
            severity: 'warn',
          })
        }
        return result
      } catch (err) {
        console.error(`[cron/user-sync] User ${user.id}: unexpected error —`, err)
        void logError({
          userId: user.id,
          route: 'cron/user-sync',
          error: err instanceof Error ? err.message : String(err),
          details: { error_stack: err instanceof Error ? err.stack : undefined },
        })
        throw err
      }
    }),
  )

  const succeeded = results.filter(
    (r) => r.status === 'fulfilled' && r.value.success,
  ).length
  const failed = results.filter(
    (r) => r.status === 'rejected' || (r.status === 'fulfilled' && !r.value.success),
  ).length

  const elapsed = Date.now() - startMs
  console.log(
    `[cron/user-sync] Completed in ${elapsed}ms — succeeded: ${succeeded}, failed: ${failed}`,
  )

  return NextResponse.json({
    processed: userList.length,
    succeeded,
    failed,
    elapsed_ms: elapsed,
  })
}
