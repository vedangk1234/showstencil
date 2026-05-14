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
import { logError } from '@/lib/logger'

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
    return NextResponse.json(
      { error: 'Account not found. Please sign out and sign in again.' },
      { status: 400 },
    )
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
    return NextResponse.json(
      { error: 'YouTube is not connected. Please sign out and sign in again to reconnect.' },
      { status: 400 },
    )
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
    return NextResponse.json({ error: 'Sync failed unexpectedly' }, { status: 500 })
  }

  if (!result.success) {
    console.error(`[sync] Failed for user ${userId} (${result.httpStatus}): ${result.error}`)
    void logError({
      userId,
      route: 'api/sync',
      error: result.error ?? 'Sync returned success=false',
      details: { youtube_channel_id: youtubeChannelId, has_token: hasToken, http_status: result.httpStatus },
    })
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
