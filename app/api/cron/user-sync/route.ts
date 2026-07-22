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
 * maxDuration is set to 60s in vercel.json (Vercel Hobby ceiling). To stay under it:
 *   - Load at most BATCH_LIMIT users per invocation (most-recently-active first).
 *   - Process in CONCURRENCY-sized chunks, checking a soft TIME_BUDGET_MS deadline
 *     before each chunk; users past the deadline are counted as `skipped`, not killed.
 * Raising the ceiling (300s+) requires Vercel Pro + Fluid Compute; then BATCH_LIMIT
 * and TIME_BUDGET_MS can be increased. True fan-out across many users is future work.
 */

import { NextResponse } from 'next/server'
import { assertCron } from '@/lib/cron-auth'
import { createServiceClient } from '@/lib/supabase'
import { syncUserChannel } from '@/lib/sync-logic'
import { logError, logSyncAttempt } from '@/lib/logger'

// Bounded-batch tuning (see header). Sized for the 60s maxDuration.
const BATCH_LIMIT = 25 // max users loaded per invocation
const CONCURRENCY = 5 // users synced in parallel per chunk
const TIME_BUDGET_MS = 45_000 // stop starting new chunks past this; leaves headroom for the response + token cleanup
const SKIP_CLEANUP = '__skip_cleanup__' // sentinel: intentional deadline skip of stale-token cleanup, not an error

export async function GET(request: Request) {
  const startMs = Date.now()

  // ── Auth check ─────────────────────────────────────────────────────────────
  const denied = assertCron(request)
  if (denied) return denied

  const supabase = createServiceClient()
  console.log('[cron/user-sync] Starting daily user analytics sync')

  // Users active within the last 30 days. NULL last_active_at is treated as
  // inactive (won't pass the .gte filter) — this is intended. Tokens are only
  // stored/used for active users per YouTube ToS III.E.4.
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()

  // ── Load eligible users (bounded batch, most-recently-active first) ─────────
  const { data: users, error } = await supabase
    .from('users')
    .select('id')
    .eq('onboarding_completed', true)
    .not('youtube_access_token', 'is', null)
    .gte('last_active_at', thirtyDaysAgo)
    .order('last_active_at', { ascending: false })
    .limit(BATCH_LIMIT)

  if (error) {
    console.error('[cron/user-sync] Failed to load users:', error.message)
    void logError({
      route: 'cron/user-sync',
      error: error.message,
    })
    return NextResponse.json({ error: 'Failed to load users' }, { status: 500 })
  }

  const userList = users ?? []
  console.log(`[cron/user-sync] Loaded ${userList.length} users (batch limit ${BATCH_LIMIT})`)

  // ── Sync in bounded-concurrency chunks with a soft deadline ─────────────────
  let succeeded = 0
  let failed = 0
  let skipped = 0

  for (let i = 0; i < userList.length; i += CONCURRENCY) {
    if (Date.now() - startMs > TIME_BUDGET_MS) {
      skipped = userList.length - i
      console.warn(
        `[cron/user-sync] Time budget reached after ${i} users — skipping remaining ${skipped}`,
      )
      break
    }

    const chunk = userList.slice(i, i + CONCURRENCY)
    const results = await Promise.allSettled(
      chunk.map(async (user) => {
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

    succeeded += results.filter((r) => r.status === 'fulfilled' && r.value.success).length
    failed += results.filter(
      (r) => r.status === 'rejected' || (r.status === 'fulfilled' && !r.value.success),
    ).length
  }

  // ── Revoke + delete tokens for dormant users ───────────────────────────────
  // Users inactive > 30 days who still hold a YouTube token: revoke Google
  // access and null out the stored tokens (YouTube ToS III.E.4). Self-contained
  // and failure-tolerant — never blocks or breaks the sync above.
  let staleTokensCleared = 0
  const cleanupDeadlineHit = Date.now() - startMs > TIME_BUDGET_MS
  try {
    if (cleanupDeadlineHit) {
      // Intentional skip — not an error. Cleanup is idempotent and runs again tomorrow.
      throw new Error(SKIP_CLEANUP)
    }
    const { data: dormantUsers, error: dormantError } = await supabase
      .from('users')
      .select('id, youtube_access_token')
      .lt('last_active_at', thirtyDaysAgo)
      .not('youtube_access_token', 'is', null)
      .limit(BATCH_LIMIT)

    if (dormantError) {
      void logError({
        route: 'cron/user-sync',
        error: `Failed to load dormant users: ${dormantError.message}`,
        severity: 'warn',
      })
    } else {
      for (const dormant of dormantUsers ?? []) {
        // Revoke Google access — one failure must not stop the loop.
        try {
          await fetch(
            `https://oauth2.googleapis.com/revoke?token=${dormant.youtube_access_token}`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            },
          )
        } catch (revokeErr) {
          void logError({
            userId: dormant.id,
            route: 'cron/user-sync',
            error: revokeErr instanceof Error ? revokeErr.message : String(revokeErr),
            details: { step: 'token_revoke' },
            severity: 'warn',
          })
        }

        // Clear stored tokens regardless of revoke outcome.
        const { error: clearError } = await supabase
          .from('users')
          .update({
            youtube_access_token: null,
            youtube_refresh_token: null,
            token_expires_at: null,
          })
          .eq('id', dormant.id)

        if (clearError) {
          void logError({
            userId: dormant.id,
            route: 'cron/user-sync',
            error: `Failed to clear tokens: ${clearError.message}`,
            severity: 'warn',
          })
        } else {
          staleTokensCleared++
        }
      }
    }
    console.log(`[cron/user-sync] Stale tokens revoked/cleared: ${staleTokensCleared}`)
  } catch (err) {
    // SKIP_CLEANUP is an intentional deadline skip, not a failure — don't log it as an error.
    if (!(err instanceof Error && err.message === SKIP_CLEANUP)) {
      void logError({
        route: 'cron/user-sync',
        error: err instanceof Error ? err.message : String(err),
        details: { step: 'stale_token_cleanup', error_stack: err instanceof Error ? err.stack : undefined },
        severity: 'warn',
      })
    }
  }

  const elapsed = Date.now() - startMs
  const processedCount = userList.length - skipped
  console.log(
    `[cron/user-sync] Completed in ${elapsed}ms — processed: ${processedCount}, succeeded: ${succeeded}, failed: ${failed}, skipped: ${skipped}`,
  )

  // Summary row in sync_logs so a partial/deadline-truncated run is visible in the DB.
  void logSyncAttempt({
    status: 200,
    durationMs: elapsed,
    videosSynced: succeeded,
    message: `[cron/user-sync] loaded=${userList.length} processed=${processedCount} succeeded=${succeeded} failed=${failed} skipped=${skipped} stale_tokens_cleared=${staleTokensCleared}`,
  })

  return NextResponse.json({
    processed: processedCount,
    loaded: userList.length,
    succeeded,
    failed,
    skipped,
    stale_tokens_cleared: staleTokensCleared,
    elapsed_ms: elapsed,
  })
}
