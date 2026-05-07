/**
 * app/api/sync/route.ts
 * POST /api/sync — triggers a full analytics data refresh for the authenticated user.
 * Auth: NextAuth user session only (called from the browser / SyncProvider).
 *
 * All sync logic lives in lib/sync-logic.ts so it can also be called directly
 * by the daily cron (app/api/cron/user-sync/route.ts) without an HTTP round-trip.
 */

import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import * as Sentry from '@sentry/nextjs'
import { createServiceClient } from '@/lib/supabase'
import { syncUserChannel } from '@/lib/sync-logic'

const SYNC_COOLDOWN_MS = 5 * 60 * 1000 // 5 minutes — each sync burns 5 YouTube Analytics quota units

export async function POST() {
  const start = Date.now()

  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const userId = session.user.id

  // Rate limit: YouTube Analytics API quota is project-level (200 units/day shared across all users).
  // Each sync costs 5 units. Prevent rapid re-syncing from burning the day's quota.
  const supabase = createServiceClient()
  const { data: recentSnapshots } = await supabase
    .from('channel_snapshots')
    .select('created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(1)

  const latestSnapshot = recentSnapshots?.[0]
  if (latestSnapshot?.created_at) {
    const msSinceLastSync = Date.now() - new Date(latestSnapshot.created_at).getTime()
    if (msSinceLastSync < SYNC_COOLDOWN_MS) {
      const retryAfterSec = Math.ceil((SYNC_COOLDOWN_MS - msSinceLastSync) / 1000)
      return NextResponse.json(
        { error: `Sync completed recently. Please wait ${Math.ceil(retryAfterSec / 60)} minute(s) before syncing again.` },
        { status: 429, headers: { 'Retry-After': String(retryAfterSec) } },
      )
    }
  }

  let result: Awaited<ReturnType<typeof syncUserChannel>>
  try {
    result = await syncUserChannel(userId)
  } catch (error: unknown) {
    Sentry.captureException(error, {
      tags: { route: 'sync' },
      user: { id: userId },
    })
    console.error('[sync]', error)
    return NextResponse.json({ error: 'Sync failed unexpectedly' }, { status: 500 })
  }

  if (!result.success) {
    return NextResponse.json({ error: result.error }, { status: result.httpStatus ?? 500 })
  }

  const elapsed = Date.now() - start
  console.log(`[sync] Completed for user ${userId} in ${elapsed}ms — snapshot: ${result.channelSnapshot}, videos: ${result.videosSynced}`)

  return NextResponse.json({
    success: true,
    syncedAt: new Date().toISOString(),
    channelSnapshot: result.channelSnapshot,
    videosSynced: result.videosSynced,
    message: `Synced ${result.videosSynced} videos in ${elapsed}ms`,
  })
}
