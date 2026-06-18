/**
 * scripts/health-check.ts
 * Production invariant checker — read-only SQL against Supabase.
 *
 * Run: npx tsx --env-file=.env.local scripts/health-check.ts
 *
 * Exit codes:
 *   0 — all invariants pass
 *   1 — any CRITICAL invariant violated
 *   2 — only HIGH or WARN invariants violated
 *
 * The script is read-only and safe to run against production at any time.
 * Schedule wiring (Vercel cron / GitHub Action) is intentionally not included
 * here — wire it separately when you're ready.
 */

import { createServiceClient } from '../lib/supabase'

type Severity = 'CRITICAL' | 'HIGH' | 'WARN' | 'INFO'

interface InvariantResult {
  id: number
  name: string
  severity: Severity
  status: 'PASS' | 'FAIL' | 'DEFERRED' | 'INFO'
  violationCount: number
  sample: unknown[]
  note?: string
}

const supabase = createServiceClient()

// Sample row count surfaced in the report for each violation.
const SAMPLE_LIMIT = 50

// ───────────────────────────────────────────────────────────────────────────────
// Invariants
// ───────────────────────────────────────────────────────────────────────────────

async function checkUsersWithVideosMissingNiche(): Promise<InvariantResult> {
  // Users with at least one row in `videos` but niche_id is NULL.
  // Created more than 7 days ago — the manual-selection flow (Day 48+) intentionally
  // leaves niche_id NULL for up to 7 days while the user sits in the picker UI after
  // a low-confidence sync. Firing inside that window would produce false positives.
  // The 7-day picker drop-off itself is covered by invariant #11.
  // Test users (@showstencil-test.invalid) excluded.
  const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()

  const { data: candidates, error } = await supabase
    .from('users')
    .select('id, email, created_at')
    .is('niche_id', null)
    .lt('created_at', cutoff)
    .not('email', 'ilike', '%@showstencil-test.invalid')
    .limit(500)

  if (error) {
    return errInvariant(1, 'users_with_videos_missing_niche', 'CRITICAL', error.message)
  }

  const violations: { id: string; email: string; video_count: number }[] = []
  for (const u of candidates ?? []) {
    const { count } = await supabase
      .from('videos')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', u.id)
    if ((count ?? 0) > 0) {
      violations.push({ id: u.id, email: u.email, video_count: count ?? 0 })
      if (violations.length >= SAMPLE_LIMIT) break
    }
  }

  return {
    id: 1,
    name: 'users_with_videos_missing_niche',
    severity: 'CRITICAL',
    status: violations.length === 0 ? 'PASS' : 'FAIL',
    violationCount: violations.length,
    sample: violations.slice(0, 5),
  }
}

async function checkConnectedUsersMissingSnapshots(): Promise<InvariantResult> {
  // Users with youtube_channel_id set, created >24h ago, but zero channel_snapshots.
  // Means the daily sync cron never wrote a snapshot for them.
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()

  const { data: candidates, error } = await supabase
    .from('users')
    .select('id, email, created_at, youtube_channel_id')
    .not('youtube_channel_id', 'is', null)
    .lt('created_at', cutoff)
    .not('email', 'ilike', '%@showstencil-test.invalid')
    .limit(500)

  if (error) {
    return errInvariant(2, 'connected_users_missing_snapshots', 'CRITICAL', error.message)
  }

  const violations: { id: string; email: string; created_at: string }[] = []
  for (const u of candidates ?? []) {
    const { count } = await supabase
      .from('channel_snapshots')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', u.id)
    if ((count ?? 0) === 0) {
      violations.push({ id: u.id, email: u.email, created_at: u.created_at })
      if (violations.length >= SAMPLE_LIMIT) break
    }
  }

  return {
    id: 2,
    name: 'connected_users_missing_snapshots',
    severity: 'CRITICAL',
    status: violations.length === 0 ? 'PASS' : 'FAIL',
    violationCount: violations.length,
    sample: violations.slice(0, 5),
  }
}

async function checkRecentSnapshotsMissingSubscriberCount(): Promise<InvariantResult> {
  // channel_snapshots rows from last 24h with subscriber_count IS NULL.
  // Indicates the public Data API call failed during sync — dashboard will be empty.
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()

  const { data, error, count } = await supabase
    .from('channel_snapshots')
    .select('id, user_id, snapshot_date, created_at', { count: 'exact' })
    .gt('created_at', cutoff)
    .is('subscriber_count', null)
    .limit(SAMPLE_LIMIT)

  if (error) {
    return errInvariant(3, 'recent_snapshots_missing_subscriber_count', 'CRITICAL', error.message)
  }

  return {
    id: 3,
    name: 'recent_snapshots_missing_subscriber_count',
    severity: 'CRITICAL',
    status: (count ?? 0) === 0 ? 'PASS' : 'FAIL',
    violationCount: count ?? 0,
    sample: (data ?? []).slice(0, 5),
  }
}

async function checkSync5xxLast24h(): Promise<InvariantResult> {
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()

  const { data, error, count } = await supabase
    .from('sync_logs')
    .select('created_at, user_id, status, message', { count: 'exact' })
    .gt('created_at', cutoff)
    .gte('status', 500)
    .order('created_at', { ascending: false })
    .limit(SAMPLE_LIMIT)

  if (error) {
    return errInvariant(4, 'sync_5xx_last_24h', 'HIGH', error.message)
  }

  return {
    id: 4,
    name: 'sync_5xx_last_24h',
    severity: 'HIGH',
    status: (count ?? 0) === 0 ? 'PASS' : 'FAIL',
    violationCount: count ?? 0,
    sample: (data ?? []).slice(0, 5),
  }
}

async function checkErrorLogsHistogram(): Promise<InvariantResult> {
  // Informational only — surface top noisy routes for triage. No pass/fail.
  // A high count on one route is a signal to investigate, not a verdict.
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()

  const { data, error } = await supabase
    .from('error_logs')
    .select('route')
    .eq('severity', 'error')
    .gt('created_at', cutoff)
    .limit(5000)

  if (error) {
    return errInvariant(5, 'error_logs_severity_error_last_24h', 'INFO', error.message)
  }

  const histogram: Record<string, number> = {}
  for (const row of data ?? []) {
    const route = row.route ?? '(unknown)'
    histogram[route] = (histogram[route] ?? 0) + 1
  }
  const top = Object.entries(histogram)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 20)
    .map(([route, count]) => ({ route, count }))

  return {
    id: 5,
    name: 'error_logs_severity_error_last_24h',
    severity: 'INFO',
    status: 'INFO',
    violationCount: data?.length ?? 0,
    sample: top,
    note: 'Informational histogram — top 20 routes by error count. No pass/fail.',
  }
}

async function checkActiveCompetitorsMissingVideos(): Promise<InvariantResult> {
  // Active competitors created >48h ago with zero rows in competitor_videos.
  // The auto-detect-then-sync handoff failed — InsightsTab will show "Gathering data".
  const cutoff = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString()

  const { data: candidates, error } = await supabase
    .from('competitors')
    .select('id, user_id, channel_name, created_at')
    .eq('is_active', true)
    .lt('created_at', cutoff)
    .limit(500)

  if (error) {
    return errInvariant(6, 'active_competitors_missing_videos', 'WARN', error.message)
  }

  const violations: { id: string; user_id: string; channel_name: string }[] = []
  for (const c of candidates ?? []) {
    const { count } = await supabase
      .from('competitor_videos')
      .select('id', { count: 'exact', head: true })
      .eq('competitor_id', c.id)
    if ((count ?? 0) === 0) {
      violations.push({ id: c.id, user_id: c.user_id, channel_name: c.channel_name })
      if (violations.length >= SAMPLE_LIMIT) break
    }
  }

  return {
    id: 6,
    name: 'active_competitors_missing_videos',
    severity: 'WARN',
    status: violations.length === 0 ? 'PASS' : 'FAIL',
    violationCount: violations.length,
    sample: violations.slice(0, 5),
  }
}

async function checkPaidUsersWithExpiredPeriod(): Promise<InvariantResult> {
  // Paid + active, but current_period_end is in the past or null. Webhook drift.
  const now = new Date().toISOString()

  const { data, error, count } = await supabase
    .from('users')
    .select('id, email, subscription_plan, subscription_status, current_period_end', {
      count: 'exact',
    })
    .in('subscription_plan', ['starter', 'pro'])
    .eq('subscription_status', 'active')
    .or(`current_period_end.is.null,current_period_end.lt.${now}`)
    .not('email', 'ilike', '%@showstencil-test.invalid')
    .limit(SAMPLE_LIMIT)

  if (error) {
    return errInvariant(7, 'paid_users_with_expired_period', 'HIGH', error.message)
  }

  return {
    id: 7,
    name: 'paid_users_with_expired_period',
    severity: 'HIGH',
    status: (count ?? 0) === 0 ? 'PASS' : 'FAIL',
    violationCount: count ?? 0,
    sample: (data ?? []).slice(0, 5),
  }
}

async function checkCancelledUsersInGraceLostPaidPlan(): Promise<InvariantResult> {
  // Cancelled with future current_period_end but already downgraded to free.
  // User has lost paid access during their billing grace period — Day 40 fix violated.
  const now = new Date().toISOString()

  const { data, error, count } = await supabase
    .from('users')
    .select('id, email, current_period_end, subscription_plan, subscription_status', {
      count: 'exact',
    })
    .eq('subscription_status', 'cancelled')
    .gt('current_period_end', now)
    .eq('subscription_plan', 'free')
    .not('email', 'ilike', '%@showstencil-test.invalid')
    .limit(SAMPLE_LIMIT)

  if (error) {
    return errInvariant(8, 'cancelled_users_in_grace_lost_paid_plan', 'HIGH', error.message)
  }

  return {
    id: 8,
    name: 'cancelled_users_in_grace_lost_paid_plan',
    severity: 'HIGH',
    status: (count ?? 0) === 0 ? 'PASS' : 'FAIL',
    violationCount: count ?? 0,
    sample: (data ?? []).slice(0, 5),
  }
}

async function checkVideoRowsMissingMetadata(): Promise<InvariantResult> {
  // Video rows with NULL title or NULL published_at. CRITICAL because these
  // rows poison every downstream consumer that joins on videos.title (niche
  // detection, digest generation, gap scoring, idea generation). Added in
  // Day 46 after a sync bug let 13 such rows accumulate in production.
  // Post-fix this count should always be zero — saveVideoData now skips any
  // analytics row whose Data API metadata is missing instead of writing a
  // half-null placeholder.
  const { data, error, count } = await supabase
    .from('videos')
    .select('id, user_id, youtube_video_id, view_count, synced_at', { count: 'exact' })
    .or('title.is.null,published_at.is.null')
    .order('synced_at', { ascending: false })
    .limit(SAMPLE_LIMIT)

  if (error) {
    return errInvariant(10, 'video_rows_missing_metadata', 'CRITICAL', error.message)
  }

  return {
    id: 10,
    name: 'video_rows_missing_metadata',
    severity: 'CRITICAL',
    status: (count ?? 0) === 0 ? 'PASS' : 'FAIL',
    violationCount: count ?? 0,
    sample: (data ?? []).slice(0, 5),
  }
}

async function checkUsersStuckInManualNicheSelection(): Promise<InvariantResult> {
  // Users with niche_id IS NULL, created >7 days ago, who already have at least one
  // channel_snapshot row — meaning the first sync completed but they never finished
  // the manual niche picker. Picker-drop-off catcher introduced with the Day 48+
  // taxonomy expansion / manual-selection flow. HIGH (not CRITICAL) because the
  // user account is functional but degraded — every niche-dependent surface
  // (competitors, digest, ideas) is blocked until they pick. Test users excluded.
  const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()

  const { data: candidates, error } = await supabase
    .from('users')
    .select('id, email, created_at')
    .is('niche_id', null)
    .lt('created_at', cutoff)
    .not('email', 'ilike', '%@showstencil-test.invalid')
    .limit(500)

  if (error) {
    return errInvariant(11, 'users_stuck_in_manual_niche_selection', 'HIGH', error.message)
  }

  const violations: { id: string; email: string; created_at: string }[] = []
  for (const u of candidates ?? []) {
    const { count } = await supabase
      .from('channel_snapshots')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', u.id)
    if ((count ?? 0) > 0) {
      violations.push({ id: u.id, email: u.email, created_at: u.created_at })
      if (violations.length >= SAMPLE_LIMIT) break
    }
  }

  return {
    id: 11,
    name: 'users_stuck_in_manual_niche_selection',
    severity: 'HIGH',
    status: violations.length === 0 ? 'PASS' : 'FAIL',
    violationCount: violations.length,
    sample: violations.slice(0, 5),
  }
}

async function checkUsersWithOtherNicheNoDescription(): Promise<InvariantResult> {
  // Users with niche_id = 'other' but niche_description is NULL or shorter than
  // 50 characters. Catches bugs in the manual-picker API (Day 48+) where the
  // 'Other' branch was saved without the required free-text description.
  // CRITICAL because every niche-dependent downstream surface (competitor
  // matching, digest prompts, idea generation) relies on the description as
  // the substitute for a known niche slug. A missing or trivially-short value
  // poisons all of them.
  const { data, error } = await supabase
    .from('users')
    .select('id, email, niche_id, niche_description')
    .eq('niche_id', 'other')
    .limit(500)

  if (error) {
    return errInvariant(12, 'users_with_other_niche_no_description', 'CRITICAL', error.message)
  }

  const violations = (data ?? []).filter((u) => {
    const desc = u.niche_description as string | null | undefined
    return desc == null || desc.length < 50
  })

  return {
    id: 12,
    name: 'users_with_other_niche_no_description',
    severity: 'CRITICAL',
    status: violations.length === 0 ? 'PASS' : 'FAIL',
    violationCount: violations.length,
    sample: violations.slice(0, 5),
  }
}

function checkCronStalenessDeferred(): InvariantResult {
  // Deferred — sync_logs is only written from /api/sync (session-triggered).
  // The /api/cron/user-sync route bypasses logSyncAttempt and writes to error_logs
  // only on failure, so there's no positive marker for "the cron ran today."
  //
  // Proposed fix (out of scope for this batch): add a single
  //   void logSyncAttempt({ userId: null, status: 200, route: '/api/cron/user-sync', ... })
  // call at the end of app/api/cron/user-sync/route.ts (success path), then
  // change this check to: zero rows where route='/api/cron/user-sync' AND status=200
  // AND created_at > NOW() - 26h.
  return {
    id: 9,
    name: 'cron_runs_missing_last_24h',
    severity: 'HIGH',
    status: 'DEFERRED',
    violationCount: 0,
    sample: [],
    note: 'Requires cron route instrumentation — see comment in scripts/health-check.ts.',
  }
}

// ───────────────────────────────────────────────────────────────────────────────
// Helpers
// ───────────────────────────────────────────────────────────────────────────────

function errInvariant(
  id: number,
  name: string,
  severity: Severity,
  message: string,
): InvariantResult {
  return {
    id,
    name,
    severity,
    status: 'FAIL',
    violationCount: -1,
    sample: [],
    note: `Query failed: ${message}`,
  }
}

function pad(s: string, len: number): string {
  if (s.length >= len) return s.slice(0, len)
  return s + ' '.repeat(len - s.length)
}

function printReport(results: InvariantResult[]): void {
  console.log('')
  console.log('═'.repeat(86))
  console.log('  ShowStencil — Production Health Check')
  console.log('  ' + new Date().toISOString())
  console.log('═'.repeat(86))
  console.log('')
  console.log(
    '  ' +
      pad('#', 4) +
      pad('NAME', 44) +
      pad('SEVERITY', 12) +
      pad('STATUS', 12) +
      'COUNT',
  )
  console.log('  ' + '─'.repeat(82))

  for (const r of results) {
    const statusIcon =
      r.status === 'PASS'
        ? '✓ PASS'
        : r.status === 'FAIL'
        ? '✗ FAIL'
        : r.status === 'DEFERRED'
        ? '~ DEFER'
        : '· INFO'
    console.log(
      '  ' +
        pad(String(r.id), 4) +
        pad(r.name, 44) +
        pad(r.severity, 12) +
        pad(statusIcon, 12) +
        (r.violationCount >= 0 ? String(r.violationCount) : '—'),
    )
  }

  console.log('')
  console.log('─'.repeat(86))

  for (const r of results) {
    const hasDetail =
      r.note ||
      (r.sample.length > 0 && (r.status === 'FAIL' || r.status === 'INFO'))
    if (!hasDetail) continue

    console.log('')
    console.log(`  [${r.id}] ${r.name} (${r.severity}) — ${r.status}`)
    if (r.note) console.log(`      NOTE: ${r.note}`)
    if (r.sample.length > 0) {
      console.log('      sample:')
      for (const row of r.sample) {
        console.log('        - ' + JSON.stringify(row))
      }
    }
  }

  console.log('')
  console.log('═'.repeat(86))

  const criticalFails = results.filter(
    (r) => r.severity === 'CRITICAL' && r.status === 'FAIL',
  ).length
  const highFails = results.filter(
    (r) => r.severity === 'HIGH' && r.status === 'FAIL',
  ).length
  const warnFails = results.filter(
    (r) => r.severity === 'WARN' && r.status === 'FAIL',
  ).length
  const deferred = results.filter((r) => r.status === 'DEFERRED').length

  console.log(
    `  SUMMARY: ${criticalFails} CRITICAL, ${highFails} HIGH, ${warnFails} WARN, ${deferred} DEFERRED`,
  )
  console.log('═'.repeat(86))
  console.log('')
}

// ───────────────────────────────────────────────────────────────────────────────
// Main
// ───────────────────────────────────────────────────────────────────────────────

async function run(): Promise<void> {
  const results: InvariantResult[] = []

  // Sequential to keep log output readable and avoid Supabase rate limits.
  results.push(await checkUsersWithVideosMissingNiche())
  results.push(await checkConnectedUsersMissingSnapshots())
  results.push(await checkRecentSnapshotsMissingSubscriberCount())
  results.push(await checkSync5xxLast24h())
  results.push(await checkErrorLogsHistogram())
  results.push(await checkActiveCompetitorsMissingVideos())
  results.push(await checkPaidUsersWithExpiredPeriod())
  results.push(await checkCancelledUsersInGraceLostPaidPlan())
  results.push(checkCronStalenessDeferred())
  results.push(await checkVideoRowsMissingMetadata())
  results.push(await checkUsersStuckInManualNicheSelection())
  results.push(await checkUsersWithOtherNicheNoDescription())

  printReport(results)

  const anyCritical = results.some(
    (r) => r.severity === 'CRITICAL' && r.status === 'FAIL',
  )
  const anyHighOrWarn = results.some(
    (r) =>
      (r.severity === 'HIGH' || r.severity === 'WARN') && r.status === 'FAIL',
  )

  if (anyCritical) process.exit(1)
  if (anyHighOrWarn) process.exit(2)
  process.exit(0)
}

run().catch((err) => {
  console.error('health-check: unexpected error:', err)
  process.exit(1)
})
