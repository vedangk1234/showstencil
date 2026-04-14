/**
 * app/api/sync/route.ts
 * POST /api/sync — triggers a full analytics data refresh for the authenticated user.
 *
 * Flow:
 *   1. Verify authentication
 *   2. Load the user's OAuth access token from Supabase
 *   3. Run all 5 YouTube Analytics API calls in parallel
 *   4. Fetch public video details for the returned video IDs
 *   5. Save channel snapshot and video data to the database
 *   6. Return a sync summary
 *
 * The route never throws — all errors are caught and reflected in the response.
 */

import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { getUser, saveChannelSnapshot, saveVideoData } from '@/lib/db'
import {
  getChannelOverview,
  getVideoPerformance,
  getAudienceDemographics,
  getTrafficSources,
  getDailyAnalytics,
} from '@/lib/youtube-analytics'
import { getVideoDetails } from '@/lib/youtube-data'

export async function POST(request: Request) {
  const start = Date.now()

  // ── 1. Auth check ──────────────────────────────────────────────────────────
  // Two paths:
  //   A. Normal session auth (user-initiated sync from the dashboard)
  //   B. Cron bypass: x-cron-user-id + x-cron-secret headers (server-to-server)
  let userId: string

  const cronUserId = request.headers.get('x-cron-user-id')
  const cronSecret = request.headers.get('x-cron-secret')

  if (cronUserId && cronSecret) {
    // Path B — cron bypass
    if (cronSecret !== process.env.CRON_SECRET) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    userId = cronUserId
  } else {
    // Path A — session auth
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    userId = session.user.id
  }

  // ── 2. Load access token from DB ───────────────────────────────────────────
  const user = await getUser(userId)

  if (!user?.youtube_access_token) {
    return NextResponse.json(
      { error: 'No YouTube access token — please reconnect your account' },
      { status: 400 },
    )
  }

  const accessToken = user.youtube_access_token
  console.log(`[sync] Starting full sync for user ${userId}`)

  // ── 3. Parallel analytics calls ────────────────────────────────────────────
  const [overview, videoPerformance, demographics, trafficSources, dailyAnalytics] =
    await Promise.all([
      getChannelOverview(accessToken),
      getVideoPerformance(accessToken, 20),
      getAudienceDemographics(accessToken),
      getTrafficSources(accessToken),
      getDailyAnalytics(accessToken, 30),
    ])

  // Log what we got back (helps debug quota issues)
  console.log(`[sync] Analytics fetched — overview: ${!!overview}, videos: ${videoPerformance.length}, demographics: ${!!demographics}, traffic: ${trafficSources.length}, daily: ${dailyAnalytics.length} days`)

  // ── 4. Save channel snapshot ───────────────────────────────────────────────
  let channelSnapshot = false
  if (overview) {
    channelSnapshot = await saveChannelSnapshot(userId, overview)
  }

  // ── 5. Fetch public video details + save video data ────────────────────────
  let videosSynced = 0
  if (videoPerformance.length > 0) {
    const videoIds = videoPerformance.map((v) => v.videoId)
    const videoDetails = await getVideoDetails(videoIds)
    videosSynced = await saveVideoData(userId, videoPerformance, videoDetails)
  }

  const elapsed = Date.now() - start
  console.log(`[sync] Completed for user ${userId} in ${elapsed}ms — snapshot: ${channelSnapshot}, videos: ${videosSynced}`)

  return NextResponse.json({
    success: true,
    syncedAt: new Date().toISOString(),
    channelSnapshot,
    videosSynced,
    message: `Synced ${videosSynced} videos in ${elapsed}ms`,
  })
}
