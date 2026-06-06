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
import { logError } from '@/lib/logger'
import {
  getChannelOverview,
  getVideoPerformance,
  getAudienceDemographics,
  getTrafficSources,
  getDailyAnalytics,
} from '@/lib/youtube-analytics'
import { getVideoDetails, getChannelStats } from '@/lib/youtube-data'

export interface SyncResult {
  success: boolean
  channelSnapshot: boolean
  videosSynced: number
  error?: string
  httpStatus?: 400 | 401 | 502
  // Populated when a snapshot was written with partial/null data — never blocks success.
  snapshotNullFields?: string[]
}

async function refreshAccessToken(
  userId: string,
  refreshToken: string,
  context: { token_expires_at: string | null },
): Promise<string | null> {
  let httpStatus: number | null = null
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
    httpStatus = res.status
    const data = (await res.json().catch(() => ({}))) as {
      access_token?: string
      expires_in?: number
      error?: string
      error_description?: string
    }
    if (!res.ok || !data.access_token) {
      const errorBody = data.error_description ?? data.error ?? 'unknown'
      console.error(`[sync] Token refresh failed: ${errorBody}`)
      void logError({
        userId,
        route: 'lib/sync-logic/refreshAccessToken',
        error: `Token refresh HTTP ${httpStatus}: ${errorBody}`,
        details: {
          token_expires_at: context.token_expires_at,
          has_refresh_token: true,
          http_status: httpStatus,
          refresh_error: String(errorBody).slice(0, 500),
        },
        severity: 'error',
      })
      return null
    }
    const expiresAt = new Date(Date.now() + (data.expires_in ?? 3600) * 1000).toISOString()
    const supabase = createServiceClient()
    await supabase
      .from('users')
      .update({ youtube_access_token: data.access_token, token_expires_at: expiresAt, updated_at: new Date().toISOString() })
      .eq('id', userId)
    console.log(`[sync] Token refreshed for user ${userId}, expires ${expiresAt}`)
    void logError({
      userId,
      route: 'lib/sync-logic/refreshAccessToken',
      error: 'Token refresh succeeded',
      details: {
        previous_token_expires_at: context.token_expires_at,
        new_token_expires_at: expiresAt,
        http_status: httpStatus,
      },
      severity: 'info',
    })
    return data.access_token
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[sync] refreshAccessToken error:', err)
    void logError({
      userId,
      route: 'lib/sync-logic/refreshAccessToken',
      error: `Token refresh threw: ${message}`,
      details: {
        token_expires_at: context.token_expires_at,
        has_refresh_token: true,
        http_status: httpStatus,
        error_stack: err instanceof Error ? err.stack : undefined,
      },
      severity: 'error',
    })
    return null
  }
}

export async function syncUserChannel(userId: string): Promise<SyncResult> {
  try {
    return await _syncUserChannelBody(userId)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    const stack = err instanceof Error ? err.stack : undefined
    console.error(`[sync] Unhandled exception in syncUserChannel for user ${userId}:`, err)
    void logError({
      userId,
      route: 'lib/sync-logic/syncUserChannel',
      error: `Unhandled exception in syncUserChannel: ${message}`,
      details: { error_stack: stack },
      severity: 'error',
    })
    return {
      success: false,
      channelSnapshot: false,
      videosSynced: 0,
      error: `Sync failed unexpectedly: ${message}`,
      httpStatus: 502,
    }
  }
}

async function _syncUserChannelBody(userId: string): Promise<SyncResult> {
  // ── 1. Load user from DB ───────────────────────────────────────────────────
  const user = await getUser(userId)

  if (user === null) {
    console.error(`[sync] User ${userId} not found in DB — JWT userId may be stale`)
  } else if (!user.youtube_access_token) {
    console.warn(`[sync] User ${userId} has no YouTube access token — OAuth may not have completed. youtube_channel_id=${user.youtube_channel_id ?? 'null'}`)
  }

  if (!user?.youtube_access_token) {
    void logError({
      userId,
      route: 'lib/sync-logic',
      error: user === null ? 'User not found in DB' : 'No YouTube access token',
      details: {
        youtube_channel_id: user?.youtube_channel_id ?? null,
        has_refresh_token: !!user?.youtube_refresh_token,
        token_expires_at: user?.token_expires_at ?? null,
      },
      severity: 'warn',
    })
    return {
      success: false,
      channelSnapshot: false,
      videosSynced: 0,
      error: 'No YouTube access token — please reconnect your account',
      httpStatus: 400,
    }
  }

  let accessToken = user.youtube_access_token

  // ── 1b. Proactively refresh if token is expired or within 5 minutes of expiry ─
  // auth.ts refreshes the JWT token on browser requests (with a 5-min buffer),
  // but cron runs at 3am with no active session — the DB token can be stale.
  // Refreshing here before any API calls avoids burning 5 quota units on failures.
  const tokenExpiresAt = user.token_expires_at ? new Date(user.token_expires_at) : null
  const tokenNeedsRefresh = tokenExpiresAt !== null && tokenExpiresAt <= new Date(Date.now() + 300_000)

  if (tokenNeedsRefresh) {
    if (!user.youtube_refresh_token) {
      console.error(`[sync] Token expired for user ${userId} but no refresh token stored — user must reconnect`)
      void logError({
        userId,
        route: 'lib/sync-logic',
        error: 'Token expired and no refresh token stored',
        details: {
          token_expires_at: user.token_expires_at,
          youtube_channel_id: user.youtube_channel_id ?? null,
        },
        severity: 'warn',
      })
      return {
        success: false,
        channelSnapshot: false,
        videosSynced: 0,
        error: 'YouTube token expired — please sign out and sign back in to reconnect your account',
        httpStatus: 401,
      }
    }
    console.log(`[sync] Token expired/expiring at ${tokenExpiresAt.toISOString()} — proactively refreshing for user ${userId}`)
    const refreshed = await refreshAccessToken(userId, user.youtube_refresh_token, {
      token_expires_at: user.token_expires_at ?? null,
    })
    if (!refreshed) {
      void logError({
        userId,
        route: 'lib/sync-logic',
        error: 'Proactive token refresh failed',
        details: { token_expires_at: user.token_expires_at },
        severity: 'warn',
      })
      return {
        success: false,
        channelSnapshot: false,
        videosSynced: 0,
        error: 'YouTube token refresh failed — please sign out and sign back in to reconnect your account',
        httpStatus: 401,
      }
    }
    accessToken = refreshed
    console.log(`[sync] Token proactively refreshed for user ${userId}`)
  }

  console.log(`[sync] Starting full sync for user ${userId}`)

  // ── 2. Parallel analytics calls (with one token-refresh retry) ─────────────
  // Each call is wrapped so we know which of the 5 reports failed if an error
  // propagates. Errors are re-thrown to preserve Promise.all's reject behavior.
  const runAnalytics = (token: string) => {
    const wrap = async <T>(name: 'overview' | 'videos' | 'demographics' | 'traffic' | 'daily', fn: () => Promise<T>): Promise<T> => {
      try {
        return await fn()
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        void logError({
          userId,
          route: 'lib/sync-logic',
          error: `Analytics report "${name}" threw: ${message}`,
          details: { report: name, channel_id: user.youtube_channel_id ?? null },
          severity: message === 'TOKEN_EXPIRED' ? 'warn' : 'error',
        })
        throw err
      }
    }
    return Promise.all([
      wrap('overview', () => getChannelOverview(token)),
      wrap('videos', () => getVideoPerformance(token, 20)),
      wrap('demographics', () => getAudienceDemographics(token)),
      wrap('traffic', () => getTrafficSources(token)),
      wrap('daily', () => getDailyAnalytics(token, 30)),
    ])
  }

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
      const newToken = await refreshAccessToken(userId, user.youtube_refresh_token, {
        token_expires_at: user.token_expires_at ?? null,
      })
      if (!newToken) {
        void logError({
          userId,
          route: 'lib/sync-logic',
          error: 'YouTube token expired and refresh failed',
          details: { youtube_channel_id: user.youtube_channel_id ?? null },
        })
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
        void logError({
          userId,
          route: 'lib/sync-logic',
          error: `YouTube API error after token refresh: ${retryMsg}`,
          details: { error_stack: retryErr instanceof Error ? retryErr.stack : undefined },
        })
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
      void logError({
        userId,
        route: 'lib/sync-logic',
        error: `YouTube Analytics API error: ${message}`,
        details: { error_stack: err instanceof Error ? err.stack : undefined },
        severity: message === 'TOKEN_EXPIRED' ? 'warn' : 'error',
      })
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
  // subscriber_count comes from the public YouTube Data API (getChannelStats),
  // not the Analytics API — Analytics only returns subscriber deltas (gained/lost).
  let channelSnapshot = false
  const snapshotNullFields: string[] = []
  if (overview) {
    let subscriberCount: number | null = null
    if (user.youtube_channel_id) {
      const channelStats = await getChannelStats(user.youtube_channel_id)
      subscriberCount = channelStats?.subscriberCount ?? null
      if (subscriberCount !== null) {
        console.log(`[sync] Fetched subscriber_count=${subscriberCount} from Data API for user ${userId}`)
      } else {
        console.warn(`[sync] getChannelStats returned null for channel ${user.youtube_channel_id} — subscriber_count will fall back to existing snapshot value`)
      }
    }

    // Pre-write nullness check: log a loud signal if the snapshot will be partial.
    // Does NOT block the write — we still want whatever data we have.
    if (subscriberCount == null) snapshotNullFields.push('subscriber_count')
    if (overview.totalViews == null || overview.totalViews === 0) snapshotNullFields.push('total_views')
    if (overview.avgViewDurationSeconds == null || overview.avgViewDurationSeconds === 0) snapshotNullFields.push('avg_view_duration_seconds')
    if (overview.totalWatchTimeMinutes == null || overview.totalWatchTimeMinutes === 0) snapshotNullFields.push('total_watch_time')

    if (snapshotNullFields.length > 0) {
      void logError({
        userId,
        route: 'lib/sync-logic',
        error: 'Sync producing partial/null snapshot data',
        details: {
          nullFields: snapshotNullFields,
          channel_id: user.youtube_channel_id ?? null,
          has_videos_data: videoPerformance.length > 0,
          has_demographics_data: !!demographics,
          has_traffic_data: trafficSources.length > 0,
          has_daily_data: dailyAnalytics.length > 0,
        },
        severity: 'warn',
      })
    }

    try {
      channelSnapshot = await saveChannelSnapshot(userId, overview, {
        demographics,
        trafficSources,
        subscriberCount,
      })
      if (!channelSnapshot) {
        void logError({
          userId,
          route: 'lib/sync-logic',
          error: 'saveChannelSnapshot returned false — write was skipped or failed',
          details: {
            channel_id: user.youtube_channel_id ?? null,
            had_overview: true,
            subscriber_count_present: subscriberCount != null,
            total_views: overview.totalViews,
          },
          severity: 'error',
        })
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      void logError({
        userId,
        route: 'lib/sync-logic/saveChannelSnapshot',
        error: `saveChannelSnapshot threw: ${message}`,
        details: {
          channel_id: user.youtube_channel_id ?? null,
          error_stack: err instanceof Error ? err.stack : undefined,
        },
        severity: 'error',
      })
    }
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
      void logError({
        userId,
        route: 'lib/sync-logic',
        error: err instanceof Error ? err.message : String(err),
        details: { error_stack: err instanceof Error ? err.stack : undefined },
        severity: 'warn',
      })
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

    const tierCounts: Record<1 | 2 | 3, number> = { 1: 0, 2: 0, 3: 0 }
    for (const r of existingAutoRows ?? []) {
      const t = r.tier as 1 | 2 | 3
      if (t === 1 || t === 2 || t === 3) tierCounts[t]++
    }
    // Targets: 2 Tier 1, 2 Tier 2, 1 Dominator. Fire detection if any tier is below target.
    const missingTier = tierCounts[1] < 2 || tierCounts[2] < 2 || tierCounts[3] < 1

    if (missingTier) {
      console.log(
        `[sync] Competitor slots below target (T1:${tierCounts[1]}/2 T2:${tierCounts[2]}/2 Dom:${tierCounts[3]}/1) — running detection for user ${userId}`,
      )

      const { data: latestSnapshot } = await supabase
        .from('channel_snapshots')
        .select('subscriber_count')
        .eq('user_id', userId)
        .not('subscriber_count', 'is', null)
        .order('snapshot_date', { ascending: false })
        .limit(1)
        .maybeSingle()

      const userSubscriberCount = latestSnapshot?.subscriber_count
      if (userSubscriberCount == null) {
        console.warn(`[sync] No subscriber count for user ${userId} — skipping auto-detection until a snapshot exists`)
      } else {
        await detectAndAssignCompetitors(userId, user.niche_id ?? null, userSubscriberCount)
        console.log(`[sync] Competitor auto-detection completed for user ${userId}`)
      }
    }
  } catch (err) {
    console.error(`[sync] Competitor auto-detection failed for user ${userId}:`, err)
    void logError({
      userId,
      route: 'lib/sync-logic',
      error: err instanceof Error ? err.message : String(err),
      details: { error_stack: err instanceof Error ? err.stack : undefined },
      severity: 'warn',
    })
  }

  return { success: true, channelSnapshot, videosSynced, snapshotNullFields: snapshotNullFields.length > 0 ? snapshotNullFields : undefined }
}
