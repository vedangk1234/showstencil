/**
 * scripts/integration/sync-pipeline.test.ts
 * Integration tests for syncUserChannel().
 *
 * Run: npx tsx --env-file=.env.local scripts/integration/sync-pipeline.test.ts
 *
 * What's mocked: YouTube Data, YouTube Analytics, Anthropic Claude, Google OAuth.
 *                All intercepted at globalThis.fetch.
 * What's live:   Supabase (prod). Test users use the .invalid TLD so cleanup
 *                queries can sweep any leaked state.
 *
 * Each case creates its own UUID test user, runs sync, asserts DB state,
 * deletes the user (FK cascade handles children), and only then runs the next
 * case. A final sweep deletes anything matching @showstencil-test.invalid.
 */

import crypto from 'node:crypto'
import { strict as assert } from 'node:assert'
import { createServiceClient } from '../../lib/supabase'
import { syncUserChannel } from '../../lib/sync-logic'
import { saveManualNicheSelection } from '../../lib/niche-engine'
import { detectSubNiche } from '../../lib/sub-niche-detector'
import {
  install,
  restore,
  callsMatching,
  youtubeAnalyticsHandler,
  youtubeChannelsHandler,
  youtubeVideosHandler,
  anthropicHandler,
  oauth2Handler,
  subNicheNoopHandler,
} from './mock-fetch'

const supabase = createServiceClient()

const TEST_CHANNEL_ID = 'UC_test_integration_001'
const TEST_EMAIL_SUFFIX = '@showstencil-test.invalid'

// ───────────────────────────────────────────────────────────────────────────────
// Test infrastructure
// ───────────────────────────────────────────────────────────────────────────────

interface TestUserOpts {
  nicheId?: string | null
  tokenExpiresInSeconds?: number
  withRefreshToken?: boolean
}

async function createTestUser(opts: TestUserOpts = {}): Promise<string> {
  const id = crypto.randomUUID()
  const email = `integration-test-${id}${TEST_EMAIL_SUFFIX}`
  const tokenExpiresAt = new Date(
    Date.now() + (opts.tokenExpiresInSeconds ?? 3600) * 1000,
  ).toISOString()

  const { error } = await supabase.from('users').insert({
    id,
    email,
    youtube_channel_id: TEST_CHANNEL_ID,
    youtube_access_token: 'integration_test_access_token',
    youtube_refresh_token: opts.withRefreshToken === false ? null : 'integration_test_refresh_token',
    token_expires_at: tokenExpiresAt,
    niche_id: opts.nicheId ?? null,
    onboarding_completed: false,
    subscription_status: 'free',
    subscription_plan: 'free',
  })
  if (error) throw new Error(`failed to create test user: ${error.message}`)
  return id
}

async function cleanupTestUser(userId: string): Promise<void> {
  // FK cascade handles children, but we delete error_logs/sync_logs explicitly
  // because they're ON DELETE SET NULL (we want them GONE for clean assertions
  // in the next test, not orphaned).
  await supabase.from('error_logs').delete().eq('user_id', userId)
  await supabase.from('sync_logs').delete().eq('user_id', userId)
  await supabase.from('users').delete().eq('id', userId)
}

async function cleanupAllTestUsers(): Promise<number> {
  // Belt-and-suspenders: sweep any leaked test users from prior crashed runs.
  const { data } = await supabase
    .from('users')
    .select('id')
    .ilike('email', `%${TEST_EMAIL_SUFFIX}`)
  const ids = (data ?? []).map((r) => r.id)
  if (ids.length === 0) return 0

  await supabase.from('error_logs').delete().in('user_id', ids)
  await supabase.from('sync_logs').delete().in('user_id', ids)
  const { error } = await supabase.from('users').delete().in('id', ids)
  if (error) console.warn(`cleanup sweep: ${error.message}`)
  return ids.length
}

async function getErrorLogs(userId: string, _since: Date): Promise<
  Array<{ error: string; severity: string; route: string }>
> {
  // sync-logic + youtube-analytics + db code paths log via `void logError(...)`
  // — fire-and-forget. On the early-return branches (e.g. token expired → 401)
  // syncUserChannel returns before the Supabase insert flushes. Poll briefly
  // so assertions that follow a fast-fail sync still see the logged row.
  //
  // The `_since` parameter is intentionally unused: each test case mints a
  // fresh UUID user, so user_id isolation is already complete. Filtering by
  // created_at on top of that exposes us to clock skew between the local test
  // host and Supabase (a row inserted from a clock ~500ms behind sinceTs
  // would be invisible to the assertion, even though the write succeeded).
  const deadline = Date.now() + 3000
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { data } = await supabase
      .from('error_logs')
      .select('error_message, severity, route')
      .eq('user_id', userId)
    const rows = (data ?? []).map((r) => ({
      error: r.error_message,
      severity: r.severity,
      route: r.route,
    }))
    if (rows.length > 0) return rows
    if (Date.now() >= deadline) return rows
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
}

async function getNiche(userId: string): Promise<string | null> {
  const { data } = await supabase
    .from('users')
    .select('niche_id')
    .eq('id', userId)
    .single()
  return data?.niche_id ?? null
}

async function countRows(table: string, userId: string): Promise<number> {
  const { count } = await supabase
    .from(table)
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
  return count ?? 0
}

// ───────────────────────────────────────────────────────────────────────────────
// Stock mocks for the happy-path Analytics + Channels + Videos calls
// ───────────────────────────────────────────────────────────────────────────────

function happyPathHandlers(opts: {
  videoIds: string[]
  videoTitles: Record<string, string>
  claudeResponse?: string
  subscriberCount?: number | null
}) {
  return [
    // Analytics: overview gets real values, video query returns videoIds rows.
    youtubeAnalyticsHandler({
      rowValues: {
        views: 50000,
        estimatedMinutesWatched: 120000,
        averageViewDuration: 280,
        subscribersGained: 300,
        subscribersLost: 50,
        estimatedRevenue: 200,
      },
      videoRows: opts.videoIds.map((id) => ({
        video: id,
        views: 5000,
        estimatedMinutesWatched: 12000,
        averageViewDuration: 280,
        averageViewPercentage: 55,
        likes: 100,
        comments: 20,
        shares: 5,
        subscribersGained: 10,
        estimatedRevenue: 20,
        annotationClickThroughRate: 0.04,
      })),
    }),
    // Subscriber count from Data API — null = competitor auto-detection skipped.
    youtubeChannelsHandler({
      channelId: TEST_CHANNEL_ID,
      subscriberCount: opts.subscriberCount ?? null,
    }),
    // getVideoDetails for the videoIds returned by Analytics.
    youtubeVideosHandler({
      videoDetails: Object.fromEntries(
        opts.videoIds.map((id) => [
          id,
          {
            title: opts.videoTitles[id] ?? `Video ${id}`,
            publishedAt: new Date(Date.now() - 7 * 86400 * 1000).toISOString(),
            durationSeconds: 600,
          },
        ]),
      ),
    }),
    // detectNiche → Claude.
    // Phase 3 (2026-06-09): wire format is now "nicheSlug" (one of the 31 slugs
    // in lib/niches.ts) instead of the legacy "nicheId" (one of 12 categorical
    // names). Personal finance content classifies as 'finance_crypto'.
    anthropicHandler({
      responseText:
        opts.claudeResponse ??
        '{"nicheSlug":"finance_crypto","confidence":0.95,"reasoning":"All titles are personal finance content"}',
    }),
    subNicheNoopHandler(),
  ]
}

// ───────────────────────────────────────────────────────────────────────────────
// Test cases
// ───────────────────────────────────────────────────────────────────────────────

async function case1_happyPathWithNicheDetection(): Promise<void> {
  const userId = await createTestUser({ nicheId: null })
  const sinceTs = new Date()

  const videoIds = ['vid_finance_1', 'vid_finance_2', 'vid_finance_3', 'vid_finance_4', 'vid_finance_5']
  const titles: Record<string, string> = {
    vid_finance_1: 'How I Invested My First $1000',
    vid_finance_2: 'Index Funds Explained Simply',
    vid_finance_3: 'My Roth IRA Strategy',
    vid_finance_4: 'Best Budgeting Apps 2026',
    vid_finance_5: 'Stock Market Basics',
  }

  install(happyPathHandlers({ videoIds, videoTitles: titles }))

  try {
    const result = await syncUserChannel(userId)

    assert.equal(result.success, true, 'sync should succeed')
    assert.equal(result.channelSnapshot, true, 'snapshot should be written')
    assert.ok(result.videosSynced >= 3, `expected ≥3 videos synced, got ${result.videosSynced}`)

    const niche = await getNiche(userId)
    // Phase 3 (2026-06-09): personal finance content slug renamed to 'finance_crypto'
    // as part of the 31-niche taxonomy migration.
    assert.equal(niche, 'finance_crypto', 'niche_id should be set to finance_crypto after detection')

    assert.equal(await countRows('channel_snapshots', userId), 1, 'one snapshot row')
    assert.ok((await countRows('videos', userId)) >= 3, 'video rows persisted')

    // Confirm Claude was actually invoked.
    const claudeCalls = callsMatching((c) => c.url.includes('api.anthropic.com'))
    assert.ok(claudeCalls.length >= 1, 'expected ≥1 call to api.anthropic.com')

    void sinceTs
  } finally {
    restore()
    await cleanupTestUser(userId)
  }
}

async function case2_happyPathNicheAlreadySet(): Promise<void> {
  // Phase 4 (2026-06-10): 'finance' replaced by 'finance_crypto' in the new taxonomy.
  // sync-logic only invokes detectNiche when niche_id is null, so any valid (or even
  // stale-but-non-null) slug skips the Claude call. Use the current canonical slug here
  // so the row reads as production-realistic.
  const userId = await createTestUser({ nicheId: 'finance_crypto' })

  const videoIds = ['vid_2_1', 'vid_2_2']
  const titles: Record<string, string> = {
    vid_2_1: 'Already-finance video 1',
    vid_2_2: 'Already-finance video 2',
  }

  // NOTE: no anthropicHandler registered. Strict mode means any call to
  // api.anthropic.com throws — that IS the "Claude must not be called" assertion.
  install([
    youtubeAnalyticsHandler({
      rowValues: {
        views: 30000,
        estimatedMinutesWatched: 70000,
        averageViewDuration: 250,
        subscribersGained: 100,
        subscribersLost: 20,
        estimatedRevenue: 100,
      },
      videoRows: videoIds.map((id) => ({
        video: id,
        views: 3000,
        estimatedMinutesWatched: 7000,
        averageViewDuration: 250,
        averageViewPercentage: 50,
        likes: 60,
        comments: 12,
        shares: 3,
        subscribersGained: 5,
        estimatedRevenue: 10,
        annotationClickThroughRate: 0.03,
      })),
    }),
    youtubeChannelsHandler({ channelId: TEST_CHANNEL_ID, subscriberCount: null }),
    youtubeVideosHandler({
      videoDetails: Object.fromEntries(
        videoIds.map((id) => [
          id,
          { title: titles[id], publishedAt: new Date().toISOString(), durationSeconds: 500 },
        ]),
      ),
    }),
    subNicheNoopHandler(),
  ])

  try {
    const result = await syncUserChannel(userId)

    assert.equal(result.success, true, 'sync should succeed')
    assert.equal(await getNiche(userId), 'finance_crypto', 'niche unchanged')

    const claudeCalls = callsMatching((c) => c.url.includes('api.anthropic.com'))
    assert.equal(claudeCalls.length, 0, 'Claude should NOT have been called for a niched user')
  } finally {
    restore()
    await cleanupTestUser(userId)
  }
}

async function case3_zeroVideosWarnLogged(): Promise<void> {
  const userId = await createTestUser({ nicheId: null })
  const sinceTs = new Date()

  // Analytics overview returns data (so snapshot writes) but video query is empty.
  install([
    youtubeAnalyticsHandler({
      rowValues: {
        views: 10000,
        estimatedMinutesWatched: 30000,
        averageViewDuration: 240,
        subscribersGained: 20,
        subscribersLost: 5,
        estimatedRevenue: 30,
      },
      videoRows: [], // ← no videos
    }),
    youtubeChannelsHandler({ channelId: TEST_CHANNEL_ID, subscriberCount: null }),
    // No videos handler needed — getVideoDetails is only called when there's data
    // to fetch, but we register a no-op so a stray empty call returns cleanly.
    youtubeVideosHandler({ videoDetails: {} }),
    subNicheNoopHandler(),
  ])

  try {
    const result = await syncUserChannel(userId)

    assert.equal(result.success, true, 'sync still succeeds with no videos')
    assert.equal(result.videosSynced, 0, 'zero videos synced')
    assert.equal(await getNiche(userId), null, 'niche_id stays null (no titles to classify)')

    const logs = await getErrorLogs(userId, sinceTs)
    const warn = logs.find(
      (l) =>
        l.route === '/api/sync' &&
        l.severity === 'warn' &&
        l.error.startsWith('no video titles available'),
    )
    assert.ok(warn, `expected warn log "no video titles available" — found: ${JSON.stringify(logs)}`)
  } finally {
    restore()
    await cleanupTestUser(userId)
  }
}

async function case4_claudeConfidenceZero(): Promise<void> {
  const userId = await createTestUser({ nicheId: null })
  const sinceTs = new Date()

  const videoIds = ['vid_4_1', 'vid_4_2', 'vid_4_3']
  const titles: Record<string, string> = {
    vid_4_1: 'My weekly vlog',
    vid_4_2: 'Random thoughts on stuff',
    vid_4_3: 'Channel update',
  }

  install(
    happyPathHandlers({
      videoIds,
      videoTitles: titles,
      // Phase 3 (2026-06-09): detectNiche now asks Claude for "nicheSlug" instead
      // of "nicheId", and an unclassified result is signalled by an explicit null
      // slug rather than a low-confidence fallback to a niche name. Test mock
      // updated to match the new wire format the production prompt expects.
      claudeResponse:
        '{"nicheSlug":null,"confidence":0,"reasoning":"Unable to classify confidently"}',
    }),
  )

  try {
    const result = await syncUserChannel(userId)

    assert.equal(result.success, true, 'sync still succeeds')
    assert.equal(
      await getNiche(userId),
      null,
      'niche_id stays null when Claude could not classify (Phase 3 invariant — no silent fallback)',
    )

    const logs = await getErrorLogs(userId, sinceTs)
    // Phase 3: warn message renamed from "detectNiche returned confidence 0" to
    // "detectNiche could not classify confidently" to cover both the confidence=0
    // case AND the new "below threshold / unknown slug → manual selection" cases
    // under a single message.
    const warn = logs.find(
      (l) =>
        l.route === '/api/sync' &&
        l.severity === 'warn' &&
        l.error.startsWith('detectNiche could not classify confidently'),
    )
    assert.ok(
      warn,
      `expected warn log "detectNiche could not classify confidently" — found: ${JSON.stringify(logs)}`,
    )
  } finally {
    restore()
    await cleanupTestUser(userId)
  }
}

async function case5_expiredTokenNoRefresh(): Promise<void> {
  const userId = await createTestUser({
    nicheId: null,
    tokenExpiresInSeconds: -3600, // expired 1h ago
    withRefreshToken: false, // no refresh token stored
  })
  const sinceTs = new Date()

  // Strict mode: any fetch other than Supabase passthrough throws.
  install([])

  try {
    const result = await syncUserChannel(userId)

    assert.equal(result.success, false, 'sync should fail')
    assert.equal(result.httpStatus, 401, 'should be HTTP 401')
    assert.ok(
      result.error && /reconnect/i.test(result.error),
      `error should mention reconnect — got: "${result.error}"`,
    )
    assert.equal(result.channelSnapshot, false, 'no snapshot')
    assert.equal(await countRows('channel_snapshots', userId), 0, 'no snapshot rows in DB')
    assert.equal(await countRows('videos', userId), 0, 'no video rows in DB')

    const logs = await getErrorLogs(userId, sinceTs)
    const tokenWarn = logs.find(
      (l) => l.severity === 'warn' && l.error.includes('Token expired'),
    )
    assert.ok(
      tokenWarn,
      `expected token-expired warn log — found: ${JSON.stringify(logs)}`,
    )

    // Strict mode confirms no YouTube / Anthropic / OAuth calls were attempted.
    const externalCalls = callsMatching(
      (c) =>
        c.url.includes('googleapis.com') ||
        c.url.includes('anthropic.com'),
    )
    assert.equal(
      externalCalls.length,
      0,
      `no external API calls should fire — got: ${externalCalls.length}`,
    )
  } finally {
    restore()
    await cleanupTestUser(userId)
  }
}

async function case6_analyticsOverviewFailsGracefulDegradation(): Promise<void> {
  // Existing sync code is built to gracefully degrade when Analytics fails —
  // overview comes back null, snapshot is skipped, but sync returns success=true.
  // This test pins that contract: no partial DB writes, but no false failure either.
  // Phase 4: any non-null slug skips detectNiche in sync-logic. Use the
  // canonical Phase-3 slug for clarity.
  const userId = await createTestUser({ nicheId: 'finance_crypto' }) // skip niche path
  const sinceTs = new Date()
  // Unique marker so we can find the error_logs row even though
  // lib/youtube-analytics doesn't tag errors with userId.
  const upstreamMarker = `simulated-upstream-failure-${crypto.randomUUID()}`

  install([
    // Override the analytics handler to return HTTP 500 — analyticsQuery returns
    // null instead of throwing, so overview/videos/demographics/traffic/daily
    // all end up null/[]. Sync continues without crashing.
    {
      name: 'youtube-analytics-500',
      match: (url: string) => url.includes('youtubeanalytics.googleapis.com'),
      respond: () =>
        new Response(
          JSON.stringify({ error: { message: upstreamMarker } }),
          { status: 500, headers: { 'content-type': 'application/json' } },
        ),
    },
    // Even though overview returns null and saveChannelSnapshot is skipped, the
    // sync still falls through to the competitor-detection block, which calls
    // Supabase only (passthrough). No external HTTP fires there for this user.
    youtubeChannelsHandler({ channelId: TEST_CHANNEL_ID, subscriberCount: null }),
    youtubeVideosHandler({ videoDetails: {} }),
    subNicheNoopHandler(),
  ])

  try {
    const result = await syncUserChannel(userId)

    // Sync says success because the failure is logged but not fatal.
    assert.equal(result.success, true, 'sync gracefully degrades to success=true')
    assert.equal(result.channelSnapshot, false, 'snapshot NOT written when overview is null')
    assert.equal(result.videosSynced, 0, 'no videos synced')

    // Critically: no partial DB state.
    assert.equal(
      await countRows('channel_snapshots', userId),
      0,
      'no partial snapshot row',
    )
    assert.equal(await countRows('videos', userId), 0, 'no partial video rows')

    // Niche unchanged (was already 'finance_crypto').
    assert.equal(await getNiche(userId), 'finance_crypto', 'niche unchanged')

    // Error logs should record the upstream failure. lib/youtube-analytics
    // doesn't tag errors with userId, so we look up by the unique marker
    // baked into our mock response. logError is fire-and-forget so poll
    // briefly — same pattern as getErrorLogs(). No created_at filter:
    // the upstreamMarker is unique to this test invocation so any matching
    // row is necessarily ours, and dropping the filter sidesteps clock skew.
    let matched: Array<{ route: string; severity: string; error_message: string }> | null = null
    {
      const deadline = Date.now() + 3000
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const { data } = await supabase
          .from('error_logs')
          .select('route, severity, error_message')
          .ilike('error_message', `%${upstreamMarker}%`)
        if (data && data.length > 0) {
          matched = data
          break
        }
        if (Date.now() >= deadline) {
          matched = data ?? null
          break
        }
        await new Promise((resolve) => setTimeout(resolve, 100))
      }
    }
    assert.ok(
      matched && matched.length > 0,
      `expected ≥1 error_logs row containing the marker — found: ${JSON.stringify(matched)}`,
    )
    void sinceTs

    // Clean up the marker rows so they don't accumulate across runs.
    await supabase
      .from('error_logs')
      .delete()
      .ilike('error_message', `%${upstreamMarker}%`)
  } finally {
    restore()
    await cleanupTestUser(userId)
  }
}

async function case7_selfHealOnSecondSync(): Promise<void> {
  // This is the exact regression that prompted this whole effort:
  // sync must be self-healing across multiple invocations, not only on a
  // single happy-path call.
  const userId = await createTestUser({ nicheId: null })
  const sinceTs = new Date()

  // ── First sync: 0 videos from Analytics, no titles → niche stays null.
  install([
    youtubeAnalyticsHandler({
      rowValues: {
        views: 5000,
        estimatedMinutesWatched: 15000,
        averageViewDuration: 200,
        subscribersGained: 10,
        subscribersLost: 2,
        estimatedRevenue: 15,
      },
      videoRows: [], // no videos yet
    }),
    youtubeChannelsHandler({ channelId: TEST_CHANNEL_ID, subscriberCount: null }),
    youtubeVideosHandler({ videoDetails: {} }),
    subNicheNoopHandler(),
  ])

  let firstResult: Awaited<ReturnType<typeof syncUserChannel>>
  try {
    firstResult = await syncUserChannel(userId)
  } finally {
    restore()
  }

  assert.equal(firstResult.success, true, 'first sync succeeds')
  assert.equal(await getNiche(userId), null, 'after first sync niche_id is still null')

  const firstLogs = await getErrorLogs(userId, sinceTs)
  const firstWarn = firstLogs.find(
    (l) =>
      l.route === '/api/sync' &&
      l.severity === 'warn' &&
      l.error.startsWith('no video titles available'),
  )
  assert.ok(
    firstWarn,
    `first sync should log "no video titles available" — got: ${JSON.stringify(firstLogs)}`,
  )

  // ── Between syncs: user posts 5 videos. Insert them directly to the DB to
  // simulate "user uploaded content between the two cron runs."
  const newVideoIds = [
    'vid_heal_1',
    'vid_heal_2',
    'vid_heal_3',
    'vid_heal_4',
    'vid_heal_5',
  ]
  const newTitles: Record<string, string> = {
    vid_heal_1: 'How I Saved $50K in 2 Years',
    vid_heal_2: 'My Roth IRA Performance',
    vid_heal_3: 'Index Fund Investing for Beginners',
    vid_heal_4: 'Tax-Loss Harvesting Explained',
    vid_heal_5: 'Emergency Fund Strategy',
  }

  // ── Second sync: Analytics now returns the 5 videos → niche detected.
  const sinceSecondTs = new Date()
  install(
    happyPathHandlers({ videoIds: newVideoIds, videoTitles: newTitles }),
  )

  let secondResult: Awaited<ReturnType<typeof syncUserChannel>>
  try {
    secondResult = await syncUserChannel(userId)
  } finally {
    restore()
  }

  assert.equal(secondResult.success, true, 'second sync succeeds')
  assert.ok(
    secondResult.videosSynced >= 3,
    `second sync should synchronise videos, got ${secondResult.videosSynced}`,
  )
  assert.equal(
    await getNiche(userId),
    'finance_crypto',
    'self-heal: second sync sets niche_id from the new content (Phase 3 taxonomy: personal finance → finance_crypto)',
  )
  void sinceSecondTs

  await cleanupTestUser(userId)
}

async function case8_videoMetadataMissingSkipsRow(): Promise<void> {
  // Regression test for Day 46 fix: when the Data API omits a video ID
  // (private/unlisted/deleted/restricted, or filtered as Short/live/kids by
  // getVideoDetails), saveVideoData must NOT insert a row with null title /
  // null published_at. Instead it skips the row and logs a single warn-level
  // error_logs entry naming the missing IDs.
  const userId = await createTestUser({ nicheId: 'finance_crypto' })
  const sinceTs = new Date()

  const videoIds = ['vid_metadata_a', 'vid_metadata_b', 'vid_metadata_c']
  const titles: Record<string, string> = {
    vid_metadata_a: 'Title A — has metadata',
    vid_metadata_c: 'Title C — has metadata',
    // vid_metadata_b intentionally absent — mock will omit it from videos.list
  }

  install([
    youtubeAnalyticsHandler({
      rowValues: {
        views: 30000,
        estimatedMinutesWatched: 70000,
        averageViewDuration: 250,
        subscribersGained: 100,
        subscribersLost: 20,
        estimatedRevenue: 100,
      },
      // All 3 IDs returned by Analytics — including the one the Data API
      // will not be able to enrich. This is the real production pattern.
      videoRows: videoIds.map((id) => ({
        video: id,
        views: 3000,
        estimatedMinutesWatched: 7000,
        averageViewDuration: 250,
        averageViewPercentage: 50,
        likes: 60,
        comments: 12,
        shares: 3,
        subscribersGained: 5,
        estimatedRevenue: 10,
        annotationClickThroughRate: 0.03,
      })),
    }),
    youtubeChannelsHandler({ channelId: TEST_CHANNEL_ID, subscriberCount: null }),
    // vid_metadata_b is omitted from the Data API response entirely.
    youtubeVideosHandler({
      videoDetails: Object.fromEntries(
        Object.entries(titles).map(([id, title]) => [
          id,
          {
            title,
            publishedAt: new Date(Date.now() - 7 * 86400 * 1000).toISOString(),
            durationSeconds: 600,
          },
        ]),
      ),
      missingIds: ['vid_metadata_b'],
    }),
    subNicheNoopHandler(),
  ])

  try {
    const result = await syncUserChannel(userId)

    assert.equal(result.success, true, 'sync should succeed even with partially missing metadata')
    assert.equal(
      result.videosSynced,
      2,
      `expected 2 videos synced (b skipped), got ${result.videosSynced}`,
    )

    // Assertion 1: only 2 video rows persisted.
    const totalRows = await countRows('videos', userId)
    assert.equal(totalRows, 2, `expected 2 video rows in DB, got ${totalRows}`)

    // Assertion 2: zero rows with null title or null published_at.
    const { count: nullRowCount } = await supabase
      .from('videos')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .or('title.is.null,published_at.is.null')
    assert.equal(
      nullRowCount,
      0,
      `expected 0 null-metadata rows, got ${nullRowCount} — Day 46 regression`,
    )

    // Assertion 3: a warn-level error_logs entry was written from
    // lib/db/saveVideoData mentioning the missing video ID.
    const logs = await getErrorLogs(userId, sinceTs)
    const skipLog = logs.find(
      (l) => l.route === 'lib/db/saveVideoData' && l.severity === 'warn',
    )
    assert.ok(
      skipLog,
      `expected a warn-level log from lib/db/saveVideoData, got: ${JSON.stringify(logs)}`,
    )

    // Assertion 4: the missing ID is named in the log details (not just a count).
    const { data: logDetails } = await supabase
      .from('error_logs')
      .select('error_details')
      .eq('user_id', userId)
      .eq('route', 'lib/db/saveVideoData')
      .eq('severity', 'warn')
      .gt('created_at', sinceTs.toISOString())
      .maybeSingle()
    const detailsBlob = JSON.stringify(logDetails?.error_details ?? {})
    assert.ok(
      detailsBlob.includes('vid_metadata_b'),
      `log details should name vid_metadata_b — got: ${detailsBlob}`,
    )

    // Assertion 5: the 2 surviving rows have the right IDs (sanity check).
    const { data: surviving } = await supabase
      .from('videos')
      .select('youtube_video_id, title, published_at')
      .eq('user_id', userId)
      .order('youtube_video_id', { ascending: true })
    const ids = (surviving ?? []).map((r) => r.youtube_video_id)
    assert.deepEqual(
      ids,
      ['vid_metadata_a', 'vid_metadata_c'],
      `surviving IDs wrong: ${JSON.stringify(ids)}`,
    )
    assert.ok(
      (surviving ?? []).every((r) => r.title !== null && r.published_at !== null),
      'every surviving row must have non-null title and published_at',
    )
  } finally {
    restore()
    await cleanupTestUser(userId)
  }
}

async function case9_lowConfidenceRequiresManualSelection(): Promise<void> {
  // Phase 7: when detectNiche returns a slug but confidence is below the 0.6
  // threshold, sync-logic must NOT write niche_id, MUST set the new
  // requiresManualSelection flag on its SyncResult, and MUST log an
  // info/warn-level error_logs entry naming the manual-selection path so the
  // condition is visible after the fact.
  const userId = await createTestUser({ nicheId: null })
  const sinceTs = new Date()

  const videoIds = ['vid_9_1', 'vid_9_2', 'vid_9_3']
  const titles: Record<string, string> = {
    vid_9_1: 'Mixed content video 1',
    vid_9_2: 'Mixed content video 2',
    vid_9_3: 'Mixed content video 3',
  }

  install(
    happyPathHandlers({
      videoIds,
      videoTitles: titles,
      // Claude returns a real slug but with confidence below the threshold (0.6).
      // detectNiche treats this exactly like the "could not classify" case:
      // niche_id stays null, requiresManualSelection bubbles up.
      claudeResponse:
        '{"nicheSlug":"entertainment_comedy","confidence":0.4,"reasoning":"Titles are too generic to classify confidently"}',
    }),
  )

  try {
    const result = await syncUserChannel(userId)

    assert.equal(result.success, true, 'sync should succeed')
    assert.equal(
      result.requiresManualSelection,
      true,
      `expected requiresManualSelection=true on the SyncResult, got ${result.requiresManualSelection}`,
    )
    assert.equal(
      await getNiche(userId),
      null,
      'niche_id must remain null when confidence is below threshold (Phase 7 invariant)',
    )

    const logs = await getErrorLogs(userId, sinceTs)
    const warn = logs.find(
      (l) =>
        l.route === '/api/sync' &&
        l.severity === 'warn' &&
        l.error.startsWith('detectNiche could not classify confidently'),
    )
    assert.ok(
      warn,
      `expected warn log "detectNiche could not classify confidently" — found: ${JSON.stringify(logs)}`,
    )
  } finally {
    restore()
    await cleanupTestUser(userId)
  }
}

async function case10_manualNicheSelectionViaApi(): Promise<void> {
  // Phase 7: when the user picks a real niche + real sub via the manual picker,
  // saveManualNicheSelection (the lib function the API route delegates to) must:
  //   - write niche_id to the picked slug verbatim
  //   - write sub_niche to the picked sub-slug
  //   - leave niche_description as null (no description was supplied)
  //   - clear sub_niche_keywords / sub_niche_confidence (those were detector
  //     outputs and would be misleading next to a manually-picked sub-niche)
  // The route /api/user/niche/manual is the HTTP wrapper around this — its
  // own validation is unit-tested via tsc. End-to-end network testing of the
  // route is out of scope for this in-process integration suite.
  const userId = await createTestUser({ nicheId: null })

  // Seed a stale sub_niche/keywords/confidence so we can verify they're wiped
  // when a manual sub-niche is recorded. Phase 2 schema additions allow this.
  await supabase
    .from('users')
    .update({
      sub_niche: 'stale-detector-output',
      sub_niche_keywords: ['stale_kw'],
      sub_niche_confidence: 0.42,
      sub_niche_detected_at: new Date(Date.now() - 86400 * 1000).toISOString(),
    })
    .eq('id', userId)

  try {
    const ok = await saveManualNicheSelection(userId, 'finance_crypto', {
      subNicheSlug: 'personal_finance',
    })
    assert.equal(ok, true, 'saveManualNicheSelection should return true')

    const { data: user } = await supabase
      .from('users')
      .select(
        'niche_id, niche_description, sub_niche, sub_niche_keywords, sub_niche_confidence',
      )
      .eq('id', userId)
      .single()

    assert.equal(user?.niche_id, 'finance_crypto', 'niche_id set to picked slug')
    assert.equal(
      user?.sub_niche,
      'personal_finance',
      'sub_niche set to picked sub-slug',
    )
    assert.equal(
      user?.niche_description,
      null,
      'niche_description stays null when no description was supplied',
    )
    assert.equal(
      user?.sub_niche_keywords,
      null,
      'stale detector keywords must be cleared on manual selection',
    )
    assert.equal(
      user?.sub_niche_confidence,
      null,
      'stale detector confidence must be cleared on manual selection',
    )
  } finally {
    await cleanupTestUser(userId)
  }
}

async function case11_otherWithDescriptionFeedsDetector(): Promise<void> {
  // Phase 7: when the user picks nicheSlug='other' with a description,
  // saveManualNicheSelection must:
  //   - write the literal 'other' to niche_id
  //   - save the description verbatim to niche_description
  //   - clear sub_niche so the next sub-niche detector pass re-derives it
  // And on the next /api/users/detect-sub-niche pass (which is what runs after
  // the first sync produces enough video data), the description must be
  // included in the prompt passed to Claude. We assert that contract directly
  // against detectSubNiche — that's the function the route delegates to.
  const userId = await createTestUser({ nicheId: null })

  // Seed prior detector output so we can confirm it's cleared.
  await supabase
    .from('users')
    .update({
      sub_niche: 'stale-detector-output',
      sub_niche_keywords: ['stale_kw_a', 'stale_kw_b'],
      sub_niche_confidence: 0.55,
    })
    .eq('id', userId)

  const description =
    'I run a US-based educational channel about urban beekeeping for absolute beginners. ' +
    'Every video walks through one practical task — installing a nuc, harvesting honey, ' +
    'managing varroa — with the kind of close-up footage you only get when the host actually ' +
    'keeps bees themselves. The audience is mostly hobbyist gardeners in their 30s and 40s.'

  try {
    const ok = await saveManualNicheSelection(userId, 'other', { description })
    assert.equal(ok, true, 'saveManualNicheSelection should return true for "other" + description')

    const { data: user } = await supabase
      .from('users')
      .select('niche_id, niche_description, sub_niche, sub_niche_keywords, sub_niche_confidence')
      .eq('id', userId)
      .single()

    assert.equal(user?.niche_id, 'other', 'niche_id stored as literal "other"')
    assert.equal(
      user?.niche_description,
      description,
      'niche_description saved verbatim',
    )
    assert.equal(user?.sub_niche, null, 'sub_niche cleared so detector re-derives')
    assert.equal(user?.sub_niche_keywords, null, 'sub_niche_keywords cleared')
    assert.equal(user?.sub_niche_confidence, null, 'sub_niche_confidence cleared')

    // ── Second half: detectSubNiche must receive the description ──────────
    // The detector calls Anthropic. Install a handler that returns a fixed
    // response; the callLog records the request body so we can assert the
    // description ended up in the prompt.
    install([
      anthropicHandler({
        responseText:
          '{"sub_niche":"Urban Beekeeping","keywords":["bees","hive","honey","varroa","beginner"],"confidence":0.85}',
      }),
    ])

    const result = await detectSubNiche([], {
      nicheDescription: description,
    })

    assert.equal(
      result.sub_niche,
      'Urban Beekeeping',
      `detector should return sub_niche from Claude response — got ${JSON.stringify(result)}`,
    )

    const claudeCalls = callsMatching((c) => c.url.includes('api.anthropic.com'))
    assert.ok(claudeCalls.length >= 1, 'detectSubNiche should call Anthropic')

    // The description must appear in the body of the Anthropic call. The body
    // is the messages.create JSON; the prompt is a `content` string on the
    // user message, so a substring search against the body is sufficient.
    const descriptionSnippet = 'urban beekeeping for absolute beginners'
    const sawDescription = claudeCalls.some(
      (c) => typeof c.body === 'string' && c.body.toLowerCase().includes(descriptionSnippet),
    )
    assert.ok(
      sawDescription,
      `expected Claude prompt to include the user's description snippet "${descriptionSnippet}" — ` +
        `Anthropic call body did not contain it. First body: ${claudeCalls[0]?.body?.slice(0, 500)}`,
    )
  } finally {
    restore()
    await cleanupTestUser(userId)
  }
}

// ───────────────────────────────────────────────────────────────────────────────
// Runner
// ───────────────────────────────────────────────────────────────────────────────

interface Case {
  name: string
  fn: () => Promise<void>
}

const cases: Case[] = [
  { name: 'case 1 — happy path with niche detection', fn: case1_happyPathWithNicheDetection },
  { name: 'case 2 — niche already set, Claude not called', fn: case2_happyPathNicheAlreadySet },
  { name: 'case 3 — 0 videos → warn logged, niche stays null', fn: case3_zeroVideosWarnLogged },
  { name: 'case 4 — Claude confidence 0 → niche stays null', fn: case4_claudeConfidenceZero },
  { name: 'case 5 — expired token, no refresh token → 401', fn: case5_expiredTokenNoRefresh },
  { name: 'case 6 — Analytics 500 → graceful degradation, no partial state', fn: case6_analyticsOverviewFailsGracefulDegradation },
  { name: 'case 7 — self-heal on second sync', fn: case7_selfHealOnSecondSync },
  { name: 'case 8 — missing Data API metadata → row skipped, warn logged', fn: case8_videoMetadataMissingSkipsRow },
  { name: 'case 9 — low-confidence niche detection → requiresManualSelection=true, niche stays null', fn: case9_lowConfidenceRequiresManualSelection },
  { name: 'case 10 — manual niche selection via lib → niche_id + sub_niche set, detector outputs cleared', fn: case10_manualNicheSelectionViaApi },
  { name: 'case 11 — manual "other" + description → saved verbatim, detector receives description', fn: case11_otherWithDescriptionFeedsDetector },
]

async function run(): Promise<void> {
  console.log('')
  console.log('═'.repeat(70))
  console.log('  sync-pipeline integration tests')
  console.log('═'.repeat(70))

  const swept = await cleanupAllTestUsers()
  if (swept > 0) {
    console.log(`  swept ${swept} leaked test user(s) before starting`)
  }

  let passed = 0
  let failed = 0
  const failures: { name: string; error: string }[] = []

  for (const c of cases) {
    const start = Date.now()
    try {
      await c.fn()
      const elapsed = Date.now() - start
      console.log(`  ✓ ${c.name} (${elapsed}ms)`)
      passed++
    } catch (err) {
      const elapsed = Date.now() - start
      const message =
        err instanceof assert.AssertionError
          ? err.message
          : err instanceof Error
          ? err.message
          : String(err)
      console.log(`  ✗ ${c.name} (${elapsed}ms)`)
      console.log(`      ${message.split('\n').join('\n      ')}`)
      failed++
      failures.push({ name: c.name, error: message })
    } finally {
      restore()
    }
  }

  // Final sweep.
  const sweptAfter = await cleanupAllTestUsers()

  console.log('')
  console.log('─'.repeat(70))
  console.log(`  passed: ${passed} / ${cases.length}`)
  console.log(`  failed: ${failed}`)
  console.log(`  cleanup sweep: ${sweptAfter} leftover row(s) removed`)
  console.log('─'.repeat(70))
  console.log('')

  if (failed > 0) {
    console.log('FAILURES:')
    for (const f of failures) {
      console.log(`  - ${f.name}`)
      console.log(`    ${f.error.split('\n').join('\n    ')}`)
    }
    console.log('')
    process.exit(1)
  }
  process.exit(0)
}

run().catch((err) => {
  console.error('runner crashed:', err)
  process.exit(1)
})
