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
import { createServiceClient } from '@/lib/supabase'
import { detectAndAssignCompetitors } from '@/lib/niche-engine'
import {
  getChannelOverview,
  getVideoPerformance,
  getAudienceDemographics,
  getTrafficSources,
  getDailyAnalytics,
} from '@/lib/youtube-analytics'
import { getVideoDetails } from '@/lib/youtube-data'

async function refreshAccessToken(userId: string, refreshToken: string): Promise<string | null> {
  try {
    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: process.env.GOOGLE_CLIENT_ID!,
        client_secret: process.env.GOOGLE_CLIENT_SECRET!,
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
      }),
    })
    const data = (await res.json()) as { access_token?: string; expires_in?: number; error?: string }
    if (!res.ok || !data.access_token) {
      console.error(`[sync] Token refresh failed: ${data.error}`)
      return null
    }
    const expiresAt = new Date(Date.now() + (data.expires_in ?? 3600) * 1000).toISOString()
    const supabase = createServiceClient()
    await supabase
      .from('users')
      .update({ youtube_access_token: data.access_token, token_expires_at: expiresAt, updated_at: new Date().toISOString() })
      .eq('id', userId)
    console.log(`[sync] Token refreshed for user ${userId}, expires ${expiresAt}`)
    return data.access_token
  } catch (err) {
    console.error('[sync] refreshAccessToken error:', err)
    return null
  }
}

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

  let accessToken = user.youtube_access_token
  console.log(`[sync] Starting full sync for user ${userId}`)

  // ── 3. Parallel analytics calls (with one token-refresh retry) ─────────────
  const runAnalytics = (token: string) =>
    Promise.all([
      getChannelOverview(token),
      getVideoPerformance(token, 20),
      getAudienceDemographics(token),
      getTrafficSources(token),
      getDailyAnalytics(token, 30),
    ])

  let overview: Awaited<ReturnType<typeof getChannelOverview>> = null
  let videoPerformance: Awaited<ReturnType<typeof getVideoPerformance>> = []
  let demographics: Awaited<ReturnType<typeof getAudienceDemographics>> = null
  let trafficSources: Awaited<ReturnType<typeof getTrafficSources>> = []
  let dailyAnalytics: Awaited<ReturnType<typeof getDailyAnalytics>> = []

  try {
    ;[overview, videoPerformance, demographics, trafficSources, dailyAnalytics] =
      await runAnalytics(accessToken)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    if (message === 'TOKEN_EXPIRED' && user.youtube_refresh_token) {
      console.log(`[sync] Token expired for user ${userId} — attempting refresh`)
      const newToken = await refreshAccessToken(userId, user.youtube_refresh_token)
      if (!newToken) {
        return NextResponse.json(
          { error: 'YouTube token expired and refresh failed — please reconnect your account' },
          { status: 401 },
        )
      }
      accessToken = newToken
      try {
        ;[overview, videoPerformance, demographics, trafficSources, dailyAnalytics] =
          await runAnalytics(accessToken)
      } catch (retryErr) {
        const retryMsg = retryErr instanceof Error ? retryErr.message : String(retryErr)
        console.error(`[sync] Retry failed for user ${userId}:`, retryMsg)
        return NextResponse.json({ error: `YouTube API error after token refresh: ${retryMsg}` }, { status: 502 })
      }
    } else {
      console.error(`[sync] YouTube Analytics error for user ${userId}:`, message)
      return NextResponse.json(
        { error: `YouTube API error: ${message}` },
        { status: message === 'TOKEN_EXPIRED' ? 401 : 502 },
      )
    }
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

  // ── 6. Auto-detect competitors if none assigned yet ─────────────────────────
  // Runs once per user lifetime (condition: 0 active auto-detected competitors).
  // Never blocks or crashes the sync response — wrapped in its own try/catch.
  try {
    const supabase = createServiceClient()
    const { count: existingAutoCount } = await supabase
      .from('competitors')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('is_auto_detected', true)
      .eq('is_active', true)

    if (existingAutoCount === 0) {
      console.log(`[sync] No auto-detected competitors — running detection for user ${userId}`)

      const { data: latestSnapshot } = await supabase
        .from('channel_snapshots')
        .select('subscriber_count')
        .eq('user_id', userId)
        .not('subscriber_count', 'is', null)
        .order('snapshot_date', { ascending: false })
        .limit(1)
        .maybeSingle()

      const userSubscriberCount = latestSnapshot?.subscriber_count ?? 45000

      await detectAndAssignCompetitors(userId, user.niche_id ?? null, userSubscriberCount)
      console.log(`[sync] Competitor auto-detection completed for user ${userId}`)
    }
  } catch (err) {
    console.error(`[sync] Competitor auto-detection failed for user ${userId}:`, err)
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
