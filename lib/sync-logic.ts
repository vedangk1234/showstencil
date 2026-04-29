/**
 * lib/sync-logic.ts
 * Core sync logic for refreshing a user's YouTube Analytics data.
 *
 * Called by:
 *   - app/api/sync/route.ts     (browser / SyncProvider triggered)
 *   - app/api/cron/user-sync/route.ts (daily 3am UTC cron)
 *   - scripts/test-sync.ts      (local dev testing)
 */

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

export interface SyncResult {
  success: boolean
  channelSnapshot: boolean
  videosSynced: number
  error?: string
  httpStatus?: 400 | 401 | 502
}

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

export async function syncUserChannel(userId: string): Promise<SyncResult> {
  // ── 1. Load user from DB ───────────────────────────────────────────────────
  const user = await getUser(userId)

  if (!user?.youtube_access_token) {
    return {
      success: false,
      channelSnapshot: false,
      videosSynced: 0,
      error: 'No YouTube access token — please reconnect your account',
      httpStatus: 400,
    }
  }

  let accessToken = user.youtube_access_token
  console.log(`[sync] Starting full sync for user ${userId}`)

  // ── 2. Parallel analytics calls (with one token-refresh retry) ─────────────
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
        return {
          success: false,
          channelSnapshot: false,
          videosSynced: 0,
          error: 'YouTube token expired and refresh failed — please reconnect your account',
          httpStatus: 401,
        }
      }
      accessToken = newToken
      try {
        ;[overview, videoPerformance, demographics, trafficSources, dailyAnalytics] =
          await runAnalytics(accessToken)
      } catch (retryErr) {
        const retryMsg = retryErr instanceof Error ? retryErr.message : String(retryErr)
        console.error(`[sync] Retry failed for user ${userId}:`, retryMsg)
        return {
          success: false,
          channelSnapshot: false,
          videosSynced: 0,
          error: `YouTube API error after token refresh: ${retryMsg}`,
          httpStatus: 502,
        }
      }
    } else {
      console.error(`[sync] YouTube Analytics error for user ${userId}:`, message)
      return {
        success: false,
        channelSnapshot: false,
        videosSynced: 0,
        error: `YouTube API error: ${message}`,
        httpStatus: message === 'TOKEN_EXPIRED' ? 401 : 502,
      }
    }
  }

  // Log what we got back (helps debug quota issues in Vercel logs)
  console.log(`[sync] Analytics fetched — overview: ${!!overview}, videos: ${videoPerformance.length}, demographics: ${!!demographics}, traffic: ${trafficSources.length}, daily: ${dailyAnalytics.length} days`)

  // ── 3. Save channel snapshot ───────────────────────────────────────────────
  let channelSnapshot = false
  if (overview) {
    channelSnapshot = await saveChannelSnapshot(userId, overview)
  }

  // ── 4. Fetch public video details + save video data ────────────────────────
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

  // ── 5. Fire-and-forget sub-niche detection ─────────────────────────────────
  // Trigger only when videos exist and sub-niche has not yet been detected.
  // Never blocks the sync response.
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

  // ── 6. Auto-detect competitors if any tier slot is empty ───────────────────
  // Handles both first-time onboarding and recovery after inactive channels are
  // removed. Never blocks or crashes the sync response.
  try {
    const supabase = createServiceClient()
    const { data: existingAutoRows } = await supabase
      .from('competitors')
      .select('tier')
      .eq('user_id', userId)
      .eq('is_auto_detected', true)
      .eq('is_active', true)

    const assignedTiers = new Set((existingAutoRows ?? []).map((r: { tier: number | null }) => r.tier))
    const missingTier = !assignedTiers.has(1) || !assignedTiers.has(2) || !assignedTiers.has(3)

    if (missingTier) {
      console.log(
        `[sync] Missing competitor tiers ${[1, 2, 3].filter((t) => !assignedTiers.has(t)).join(',')} — running detection for user ${userId}`,
      )

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

  return { success: true, channelSnapshot, videosSynced }
}
