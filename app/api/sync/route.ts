/**
 * app/api/sync/route.ts
 * POST /api/sync — triggers a full analytics data refresh for the authenticated user.
 * Auth: NextAuth user session only (called from the browser / SyncProvider).
 *
 * All sync logic lives in lib/sync-logic.ts so it can also be called directly
 * by the daily cron (app/api/cron/user-sync/route.ts) without an HTTP round-trip.
 */

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import * as Sentry from '@sentry/nextjs'
import { createServiceClient } from '@/lib/supabase'
import { syncUserChannel } from '@/lib/sync-logic'
import { logError, logSyncAttempt } from '@/lib/logger'

const SYNC_COOLDOWN_MS = 5 * 60 * 1000 // 5 minutes — each sync burns 5 YouTube Analytics quota units

export async function POST(req: NextRequest) {
  const start = Date.now()

  const ip = req.headers.get('x-forwarded-for')
  const country = req.headers.get('x-vercel-ip-country')
  const city = req.headers.get('x-vercel-ip-city')
  const userAgent = req.headers.get('user-agent')

  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const userId = session.user.id
  const email = session.user.email ?? null

  // Rate limit: YouTube Analytics API quota is project-level (200 units/day shared across all users).
  // Each sync costs 5 units. Prevent rapid re-syncing from burning the day's quota.
  const supabase = createServiceClient()

  const [{ data: recentSnapshots }, { data: userRow }] = await Promise.all([
    supabase
      .from('channel_snapshots')
      .select('created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(1),
    supabase
      .from('users')
      .select('youtube_channel_id, youtube_access_token, youtube_refresh_token, token_expires_at')
      .eq('id', userId)
      .maybeSingle(),
  ])

  const youtubeChannelId = userRow?.youtube_channel_id ?? null
  const hasToken = !!userRow?.youtube_access_token
  const tokenExpiresAt = userRow?.token_expires_at ?? null
  const tokenIsExpired = tokenExpiresAt ? new Date(tokenExpiresAt) < new Date() : false

  // ── Pre-flight: validate user state before attempting sync ─────────────────
  // Each case returns a specific error so the dashboard can show the right message.

  if (!userRow) {
    void logError({
      userId,
      route: 'api/sync/preflight',
      error: 'User row not found in Supabase — JWT userId may be stale or DB unreachable',
      details: { userId },
      severity: 'error',
    })
    const msg = 'Account not found. Please sign out and sign in again.'
    void logSyncAttempt({ userId, email, status: 400, message: msg, durationMs: Date.now() - start, ip, country, city, userAgent, channelId: null })
    return NextResponse.json({ error: msg }, { status: 400 })
  }

  if (!userRow.youtube_access_token) {
    void logError({
      userId,
      route: 'api/sync/preflight',
      error: 'No YouTube access token found in DB — OAuth callback may not have saved tokens',
      details: {
        youtube_channel_id: youtubeChannelId,
        has_refresh_token: !!userRow.youtube_refresh_token,
        token_expires_at: tokenExpiresAt,
      },
      severity: 'error',
    })
    const msg = 'YouTube is not connected. Please sign out and sign in again to reconnect.'
    void logSyncAttempt({ userId, email, status: 400, message: msg, durationMs: Date.now() - start, ip, country, city, userAgent, channelId: youtubeChannelId })
    return NextResponse.json({ error: msg }, { status: 400 })
  }

  // Log key state on every sync attempt — visible in Vercel logs even when sync succeeds.
  console.log(
    `[sync/preflight] user=${userId} channel=${youtubeChannelId ?? 'null'} ` +
    `token_expired=${tokenIsExpired} token_expires_at=${tokenExpiresAt ?? 'null'} ` +
    `has_refresh=${!!userRow.youtube_refresh_token}`,
  )

  if (tokenIsExpired) {
    console.warn(`[sync/preflight] Token is expired for user ${userId} — sync-logic will attempt refresh`)
  }

  const latestSnapshot = recentSnapshots?.[0]
  if (latestSnapshot?.created_at) {
    const msSinceLastSync = Date.now() - new Date(latestSnapshot.created_at).getTime()
    if (msSinceLastSync < SYNC_COOLDOWN_MS) {
      const retryAfterSec = Math.ceil((SYNC_COOLDOWN_MS - msSinceLastSync) / 1000)
      const msg = 'Your channel was synced recently. Refreshing your dashboard...'
      void logSyncAttempt({ userId, email, status: 429, message: msg, durationMs: Date.now() - start, ip, country, city, userAgent, channelId: youtubeChannelId })
      return NextResponse.json(
        { error: msg },
        { status: 429, headers: { 'Retry-After': String(retryAfterSec) } },
      )
    }
  }

  let result: Awaited<ReturnType<typeof syncUserChannel>>
  try {
    result = await syncUserChannel(userId)
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error)
    const stack = error instanceof Error ? error.stack : undefined
    Sentry.captureException(error, {
      tags: { route: 'sync' },
      user: { id: userId },
    })
    console.error('[sync]', error)
    void logError({
      userId,
      route: 'api/sync',
      error: message,
      details: { youtube_channel_id: youtubeChannelId, has_token: hasToken, error_stack: stack },
    })
    void logSyncAttempt({ userId, email, status: 500, message, durationMs: Date.now() - start, ip, country, city, userAgent, channelId: youtubeChannelId })
    return NextResponse.json({ error: 'Sync failed unexpectedly' }, { status: 500 })
  }

  if (!result.success) {
    const failureDurationMs = Date.now() - start
    console.error(`[sync] Failed for user ${userId} (${result.httpStatus}): ${result.error}`)
    void logError({
      userId,
      route: 'api/sync',
      error: result.error ?? 'Sync returned success=false',
      details: {
        youtube_channel_id: youtubeChannelId,
        has_token: hasToken,
        http_status: result.httpStatus,
        duration_ms: failureDurationMs,
        failure_message: result.error ?? null,
      },
    })
    void logSyncAttempt({ userId, email, status: result.httpStatus ?? 500, message: result.error ?? 'Sync returned success=false', durationMs: failureDurationMs, ip, country, city, userAgent, channelId: youtubeChannelId })
    return NextResponse.json({ error: result.error }, { status: result.httpStatus ?? 500 })
  }

  const elapsed = Date.now() - start
  console.log(`[sync] Completed for user ${userId} in ${elapsed}ms — snapshot: ${result.channelSnapshot}, videos: ${result.videosSynced}`)

  // Sync reported success but the snapshot it wrote had null fields. This catches
  // the "the row is garbage but we said it worked" failure mode — without this,
  // partial syncs are completely invisible after the fact.
  if (result.snapshotNullFields && result.snapshotNullFields.length > 0) {
    void logError({
      userId,
      route: 'api/sync',
      error: 'Sync reported success but snapshot has nulls',
      details: {
        nullFields: result.snapshotNullFields,
        youtube_channel_id: youtubeChannelId,
        duration_ms: elapsed,
        videos_synced: result.videosSynced ?? 0,
        channel_snapshot_written: result.channelSnapshot,
      },
      severity: 'warn',
    })
  }

  void logSyncAttempt({ userId, email, status: 200, message: `Synced ${result.videosSynced} videos in ${elapsed}ms`, durationMs: elapsed, ip, country, city, userAgent, channelId: youtubeChannelId, videosSynced: result.videosSynced ?? null })

  return NextResponse.json({
    success: true,
    syncedAt: new Date().toISOString(),
    channelSnapshot: result.channelSnapshot,
    videosSynced: result.videosSynced,
    message: `Synced ${result.videosSynced} videos in ${elapsed}ms`,
  })
}
