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
import { syncUserChannel } from '@/lib/sync-logic'

export async function POST() {
  const start = Date.now()

  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const userId = session.user.id
  const result = await syncUserChannel(userId)

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
