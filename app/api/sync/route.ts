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
  let overview: Awaited<ReturnType<typeof getChannelOverview>> = null
  let videoPerformance: Awaited<ReturnType<typeof getVideoPerformance>> = []
  let demographics: Awaited<ReturnType<typeof getAudienceDemographics>> = null
  let trafficSources: Awaited<ReturnType<typeof getTrafficSources>> = []
  let dailyAnalytics: Awaited<ReturnType<typeof getDailyAnalytics>> = []

  try {
    ;[overview, videoPerformance, demographics, trafficSources, dailyAnalytics] =
      await Promise.all([
        getChannelOverview(accessToken),
        getVideoPerformance(accessToken, 20),
        getAudienceDemographics(accessToken),
        getTrafficSources(accessToken),
        getDailyAnalytics(accessToken, 30),
      ])
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error(`[sync] YouTube Analytics error for user ${userId}:`, message)
    if (message === 'TOKEN_EXPIRED') {
      return NextResponse.json(
        { error: 'YouTube token expired — please reconnect your account' },
        { status: 401 },
      )
    }
    return NextResponse.json(
      { error: `YouTube API error: ${message}` },
      { status: 502 },
    )
  }

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
    try {
      const videoIds = videoPerformance.map((v) => v.videoId)
      const videoDetails = await getVideoDetails(videoIds)
      videosSynced = await saveVideoData(userId, videoPerformance, videoDetails)
    } catch (err) {
      console.error(`[sync] Video save error for user ${userId}:`, err)
    }
  }

  // Trigger sub-niche detection after first sync (only if not yet detected)
  // Fire-and-forget — never block the sync response on this
  if (videosSynced > 0) {
    const freshUser = await getUser(userId)
    if (!freshUser?.sub_niche) {
      const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
      fetch(`${appUrl}/api/users/detect-sub-niche`, {
        method: 'POST',
        headers: {
          'x-cron-user-id': userId,
          'x-cron-secret': process.env.CRON_SECRET ?? '',
        },
      }).catch((err) => console.error('[sync] Sub-niche detection trigger failed:', err))
    }
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
