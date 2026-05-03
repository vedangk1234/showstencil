/**
 * scripts/test-all-endpoints.ts
 * Comprehensive integration test — tests every API route and DB table.
 *
 * For routes that require NextAuth session cookies, this script validates
 * data integrity by querying the DB directly instead of calling HTTP.
 * Cron routes and /api/sync are called via HTTP with cron-secret headers.
 *
 * Run:
 *   npx tsx --env-file=.env.local scripts/test-all-endpoints.ts
 */

import { createServiceClient } from '../lib/supabase'

// ─── Config ──────────────────────────────────────────────────────────────────

const CRON_SECRET = process.env.CRON_SECRET ?? ''
const TEST_USER_ID = '98d0b1ed-47a8-47e6-a0e2-1c64dc9af927'
const TEST_USER_EMAIL = 'vedangk2912@gmail.com'

// ─── Result tracking ─────────────────────────────────────────────────────────

let passed = 0
let failed = 0
let warnings = 0
const results: Array<{
  name: string
  status: 'PASS' | 'FAIL' | 'WARN'
  detail: string
}> = []

function pass(name: string, detail: string): void {
  passed++
  results.push({ name, status: 'PASS', detail })
  console.log(`  ✓ ${name}: ${detail}`)
}

function fail(name: string, detail: string): void {
  failed++
  results.push({ name, status: 'FAIL', detail })
  console.log(`  ✗ ${name}: ${detail}`)
}

function warn(name: string, detail: string): void {
  warnings++
  results.push({ name, status: 'WARN', detail })
  console.log(`  ⚠ ${name}: ${detail}`)
}

async function section(title: string, fn: () => Promise<void>): Promise<void> {
  console.log(`\n${'═'.repeat(60)}`)
  console.log(`  ${title}`)
  console.log(`${'═'.repeat(60)}`)
  try {
    await fn()
  } catch (err) {
    fail(title, `Section threw: ${err instanceof Error ? err.message : String(err)}`)
  }
}

// ─── HTTP helpers ─────────────────────────────────────────────────────────────

async function detectBaseUrl(): Promise<string> {
  try {
    const res = await fetch('http://localhost:3000/api/auth/providers', {
      signal: AbortSignal.timeout(2000),
    })
    if (res.ok || res.status === 200) {
      console.log('  → Using localhost:3000')
      return 'http://localhost:3000'
    }
  } catch {
    // fall through to production
  }
  console.log('  → Using production: https://nixlytics-u6k1.vercel.app')
  return 'https://nixlytics-u6k1.vercel.app'
}

async function cronFetch(baseUrl: string, path: string, method = 'GET'): Promise<Response> {
  return fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${CRON_SECRET}`,
      'Content-Type': 'application/json',
    },
    signal: AbortSignal.timeout(55_000),
  })
}

async function cronFetchWithUserId(baseUrl: string, path: string, method = 'POST'): Promise<Response> {
  return fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      'x-cron-user-id': TEST_USER_ID,
      'x-cron-secret': CRON_SECRET,
      'Content-Type': 'application/json',
    },
    signal: AbortSignal.timeout(55_000),
  })
}

// ─── Section 1 — User & Auth Data ─────────────────────────────────────────────

async function testUserData(): Promise<void> {
  await section('1. User & Auth Data', async () => {
    const supabase = createServiceClient()

    const { data: user, error } = await supabase
      .from('users')
      .select('*')
      .eq('id', TEST_USER_ID)
      .single()

    if (error || !user) {
      fail('1.1 User exists', `Not found — ${error?.message ?? 'null row'}`)
      return
    }
    pass('1.1 User exists', `id=${user.id}`)

    // Verify email matches expected test user
    if (user.email === TEST_USER_EMAIL) {
      pass('1.1a Email matches', user.email)
    } else {
      warn('1.1a Email', `Expected ${TEST_USER_EMAIL} but got ${user.email}`)
    }

    if (user.youtube_channel_id) {
      pass('1.2 YouTube channel connected', user.youtube_channel_id)
    } else {
      fail('1.2 YouTube channel connected', 'youtube_channel_id is null')
    }

    if (user.youtube_access_token) {
      pass('1.3 Access token exists', 'present (not shown)')
    } else {
      fail('1.3 Access token exists', 'youtube_access_token is null')
    }

    if (user.youtube_refresh_token) {
      pass('1.4 Refresh token exists', 'present (not shown)')
    } else {
      fail('1.4 Refresh token exists', 'youtube_refresh_token is null')
    }

    if (user.token_expires_at) {
      const expiresAt = new Date(user.token_expires_at)
      const now = new Date()
      if (expiresAt > now) {
        pass('1.5 Token not expired', `expires ${expiresAt.toISOString()}`)
      } else {
        warn('1.5 Token not expired', `expired at ${expiresAt.toISOString()} — will refresh on next sync`)
      }
    } else {
      fail('1.5 Token not expired', 'token_expires_at is null')
    }

    if (user.niche_id) {
      pass('1.6 Niche detected', user.niche_id)
    } else {
      fail('1.6 Niche detected', 'niche_id is null — detection may not have run')
    }

    if (user.sub_niche) {
      pass('1.7 Sub-niche detected', user.sub_niche)
    } else {
      warn('1.7 Sub-niche detected', 'sub_niche is null — will populate on next sync')
    }

    if (user.onboarding_completed) {
      pass('1.8 Onboarding completed', 'true')
    } else {
      warn('1.8 Onboarding completed', 'false — user has not completed onboarding')
    }

    pass('1.9 Subscription status', `${user.subscription_status} / ${user.subscription_plan}`)
  })
}

// ─── Section 2 — Channel Snapshots ───────────────────────────────────────────

async function testChannelSnapshots(): Promise<void> {
  await section('2. Channel Snapshots', async () => {
    const supabase = createServiceClient()

    const { data: snapshots, error } = await supabase
      .from('channel_snapshots')
      .select('*')
      .eq('user_id', TEST_USER_ID)
      .not('subscriber_count', 'is', null)
      .order('snapshot_date', { ascending: false })
      .limit(10)

    if (error) {
      fail('2.1 Snapshots exist', error.message)
      return
    }

    if (!snapshots || snapshots.length === 0) {
      fail('2.1 Snapshots exist', 'No snapshots found')
      return
    }
    pass('2.1 Snapshots exist', `${snapshots.length} rows found`)

    const latest = snapshots[0]
    const latestDate = new Date(latest.snapshot_date)
    const today = new Date()
    const daysDiff = Math.floor((today.getTime() - latestDate.getTime()) / (1000 * 60 * 60 * 24))

    if (daysDiff === 0) {
      pass('2.2 Recent snapshot (today)', `snapshot_date=${latest.snapshot_date}`)
    } else if (daysDiff <= 2) {
      warn('2.2 Recent snapshot', `Last snapshot was ${daysDiff} day(s) ago — sync may have missed today`)
    } else {
      fail('2.2 Recent snapshot', `Last snapshot was ${daysDiff} days ago — sync is not running`)
    }

    if (latest.subscriber_count && latest.subscriber_count > 0) {
      pass('2.3 Subscriber count', `${latest.subscriber_count.toLocaleString()} subs`)
    } else {
      fail('2.3 Subscriber count', `subscriber_count=${latest.subscriber_count}`)
    }

    const { count } = await supabase
      .from('channel_snapshots')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', TEST_USER_ID)
      .not('subscriber_count', 'is', null)

    if ((count ?? 0) >= 30) {
      pass('2.4 Historical data (30+ days)', `${count} valid snapshots`)
    } else if ((count ?? 0) >= 7) {
      warn('2.4 Historical data', `Only ${count} snapshots — need 30 for full charts`)
    } else {
      fail('2.4 Historical data', `Only ${count} snapshots`)
    }

    if (latest.estimated_monthly_revenue != null) {
      pass('2.5 Revenue data', `$${(latest.estimated_monthly_revenue as number).toFixed(2)}`)
    } else {
      warn('2.5 Revenue data', 'estimated_monthly_revenue is null — may be non-monetized channel')
    }

    if (latest.avg_ctr != null && (latest.avg_ctr as number) > 0) {
      pass('2.6 CTR data', `${(latest.avg_ctr as number).toFixed(2)}%`)
    } else {
      warn('2.6 CTR data', 'avg_ctr is null or zero')
    }
  })
}

// ─── Section 3 — Own Channel Videos ──────────────────────────────────────────

async function testOwnVideos(): Promise<void> {
  await section('3. Own Channel Videos', async () => {
    const supabase = createServiceClient()

    const { data: videos, error, count } = await supabase
      .from('videos')
      .select('*', { count: 'exact' })
      .eq('user_id', TEST_USER_ID)
      .limit(20)

    if (error) {
      fail('3.1 Videos exist', error.message)
      return
    }

    if (!videos || videos.length === 0) {
      fail('3.1 Videos exist', 'No videos found — sync may not have fetched videos')
      return
    }
    pass('3.1 Videos exist', `${count} total videos`)

    const withDuration = videos.filter((v) => (v.duration_seconds as number) > 0)
    if (withDuration.length === videos.length) {
      const avgDuration = Math.round(
        withDuration.reduce((s, v) => s + (v.duration_seconds as number), 0) / withDuration.length,
      )
      pass(
        '3.2 Video duration populated',
        `avg ${Math.floor(avgDuration / 60)}m ${avgDuration % 60}s`,
      )
    } else {
      warn('3.2 Video duration', `${withDuration.length}/${videos.length} have duration`)
    }

    const withViews = videos.filter((v) => (v.view_count as number) > 0)
    if (withViews.length > 0) {
      const avgViews = Math.round(
        withViews.reduce((s, v) => s + (v.view_count as number), 0) / withViews.length,
      )
      pass('3.3 View counts populated', `avg ${avgViews.toLocaleString()} views`)
    } else {
      fail('3.3 View counts populated', 'All videos have 0 views')
    }

    const withCTR = videos.filter((v) => v.ctr != null && (v.ctr as number) > 0)
    if (withCTR.length > 0) {
      pass('3.4 CTR data on videos', `${withCTR.length}/${videos.length} have CTR`)
    } else {
      warn('3.4 CTR data on videos', 'No videos have CTR data')
    }

    const sorted = [...videos].sort(
      (a, b) =>
        new Date(b.published_at as string).getTime() -
        new Date(a.published_at as string).getTime(),
    )
    const newest = sorted[0]
    if (newest) {
      const daysAgo = Math.floor(
        (Date.now() - new Date(newest.published_at as string).getTime()) / (1000 * 60 * 60 * 24),
      )
      pass(
        '3.5 Most recent video',
        `"${(newest.title as string)?.substring(0, 50)}" — ${daysAgo} days ago`,
      )
    }
  })
}

// ─── Section 4 — Competitors ──────────────────────────────────────────────────

async function testCompetitors(): Promise<void> {
  await section('4. Competitors', async () => {
    const supabase = createServiceClient()

    const { data: competitors, error } = await supabase
      .from('competitors')
      .select('*')
      .eq('user_id', TEST_USER_ID)
      .eq('is_active', true)
      .order('tier', { ascending: true })

    if (error) {
      fail('4.1 Competitors query', error.message)
      return
    }

    const activeCount = competitors?.length ?? 0
    if (activeCount >= 3) {
      pass('4.2 Active competitor count', `${activeCount} active competitors`)
    } else if (activeCount > 0) {
      fail('4.2 Active competitor count', `Only ${activeCount} — need 3 (Tier 1, Tier 2, Dominator)`)
    } else {
      fail('4.2 Active competitor count', '0 competitors — auto-detection may not have run')
      return
    }

    const tier1 = competitors?.find((c) => c.tier === 1 && !c.is_dominator)
    if (tier1) {
      pass(
        '4.3 Tier 1 competitor',
        `${tier1.channel_name} (${((tier1.subscriber_count as number) / 1000).toFixed(0)}K subs)`,
      )
    } else {
      fail('4.3 Tier 1 competitor', 'No Tier 1 competitor found')
    }

    const tier2 = competitors?.find((c) => c.tier === 2 && !c.is_dominator)
    if (tier2) {
      pass(
        '4.4 Tier 2 competitor',
        `${tier2.channel_name} (${((tier2.subscriber_count as number) / 1000).toFixed(0)}K subs)`,
      )
    } else {
      fail('4.4 Tier 2 competitor', 'No Tier 2 competitor found')
    }

    const dominator = competitors?.find((c) => c.is_dominator || c.tier === 3)
    if (dominator) {
      const subs = dominator.subscriber_count as number
      const subStr =
        subs >= 1_000_000
          ? `${(subs / 1_000_000).toFixed(1)}M`
          : `${(subs / 1000).toFixed(0)}K`
      pass('4.5 Dominator competitor', `${dominator.channel_name} (${subStr} subs)`)
    } else {
      fail('4.5 Dominator competitor', 'No Dominator found')
    }

    const fakeIds =
      competitors?.filter(
        (c) =>
          !(c.youtube_channel_id as string)?.startsWith('UC') ||
          (c.youtube_channel_id as string)?.length !== 24,
      ) ?? []
    if (fakeIds.length === 0) {
      pass('4.6 All have valid YouTube IDs', 'All start with UC and are 24 chars')
    } else {
      fail(
        '4.6 Valid YouTube IDs',
        `${fakeIds.map((c) => c.channel_name).join(', ')} have fake IDs`,
      )
    }

    const noSubNiche = competitors?.filter((c) => !c.sub_niche) ?? []
    if (noSubNiche.length === 0) {
      pass('4.7 Sub-niche populated on all', 'All competitors have sub_niche')
    } else {
      warn(
        '4.7 Sub-niche populated',
        `${noSubNiche.map((c) => c.channel_name).join(', ')} missing sub_niche`,
      )
    }

    const noAvgViews =
      competitors?.filter(
        (c) => !c.avg_views_per_video || (c.avg_views_per_video as number) === 0,
      ) ?? []
    if (noAvgViews.length === 0) {
      pass(
        '4.8 Avg views per video',
        `Tier1=${(tier1?.avg_views_per_video as number | undefined)?.toLocaleString()} Tier2=${(tier2?.avg_views_per_video as number | undefined)?.toLocaleString()}`,
      )
    } else {
      warn(
        '4.8 Avg views per video',
        `Missing on: ${noAvgViews.map((c) => c.channel_name).join(', ')}`,
      )
    }

    const nonUSIndicators = ['australia', 'australian', 'uk ', 'british', 'india', 'canadian']
    const suspectChannels =
      competitors?.filter((c) => {
        const text = `${c.channel_name} ${(c.sub_niche as string) ?? ''}`.toLowerCase()
        return nonUSIndicators.some((indicator) => text.includes(indicator))
      }) ?? []
    if (suspectChannels.length === 0) {
      pass('4.9 All competitors appear US-relevant', 'No non-US indicators found')
    } else {
      warn('4.9 Non-US competitor detected', suspectChannels.map((c) => c.channel_name).join(', '))
    }

    const manual = competitors?.find((c) => c.is_searched && c.is_active)
    if (manual) {
      pass('4.10 Manual competitor slot', `${manual.channel_name} (manually added)`)
      if (manual.replacement_locked_until) {
        const lockDate = new Date(manual.replacement_locked_until as string)
        pass('4.10a Replacement lock', `locked until ${lockDate.toLocaleDateString()}`)
      } else {
        warn('4.10a Replacement lock', 'replacement_locked_until is null on manual competitor')
      }
    } else {
      warn('4.10 Manual competitor slot', 'No manually added competitor — slot is open')
    }
  })
}

// ─── Section 5 — Competitor Videos ───────────────────────────────────────────

async function testCompetitorVideos(): Promise<void> {
  await section('5. Competitor Videos', async () => {
    const supabase = createServiceClient()

    const { data: competitors } = await supabase
      .from('competitors')
      .select('id, channel_name, tier, is_dominator')
      .eq('user_id', TEST_USER_ID)
      .eq('is_active', true)

    if (!competitors || competitors.length === 0) {
      fail('5.0 Competitors exist', 'Skipping section — no competitors found')
      return
    }

    for (const comp of competitors) {
      const { data: videos, count } = await supabase
        .from('competitor_videos')
        .select('*', { count: 'exact' })
        .eq('competitor_id', comp.id)
        .limit(20)

      const videoCount = count ?? 0
      const tierLabel = comp.is_dominator ? 'Dominator' : `Tier ${comp.tier}`

      if (videoCount >= 10) {
        pass(`5. ${comp.channel_name} video count`, `${videoCount} videos (${tierLabel})`)
      } else if (videoCount > 0) {
        warn(`5. ${comp.channel_name} video count`, `Only ${videoCount} videos — need ≥10`)
      } else {
        fail(`5. ${comp.channel_name} video count`, '0 videos — data not synced yet')
        continue
      }

      if (!videos) continue

      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
      const recentVideos = videos.filter(
        (v) => new Date(v.published_at as string) >= thirtyDaysAgo,
      )

      if (recentVideos.length >= 3) {
        pass(
          `5. ${comp.channel_name} activity (30d)`,
          `${recentVideos.length} videos in last 30 days`,
        )
      } else {
        warn(
          `5. ${comp.channel_name} activity (30d)`,
          `Only ${recentVideos.length} videos in last 30 days`,
        )
      }

      const avgViews = Math.round(
        videos.reduce((s, v) => s + ((v.view_count as number) ?? 0), 0) / videos.length,
      )
      pass(`5. ${comp.channel_name} avg views`, avgViews.toLocaleString())

      const withVelocity = videos.filter((v) => (v.velocity_score as number) > 0)
      if (withVelocity.length > 0) {
        pass(
          `5. ${comp.channel_name} velocity scores`,
          `${withVelocity.length}/${videos.length} have velocity`,
        )
      } else {
        warn(`5. ${comp.channel_name} velocity scores`, 'No velocity scores')
      }

      const viral = videos.filter((v) => v.is_viral)
      pass(`5. ${comp.channel_name} viral videos`, `${viral.length} flagged as viral`)
    }
  })
}

// ─── Section 6 — Competitor Snapshots ────────────────────────────────────────

async function testCompetitorSnapshots(): Promise<void> {
  await section('6. Competitor Snapshots', async () => {
    const supabase = createServiceClient()

    const { data: competitors } = await supabase
      .from('competitors')
      .select('id, channel_name, tier, is_dominator')
      .eq('user_id', TEST_USER_ID)
      .eq('is_active', true)

    if (!competitors || competitors.length === 0) {
      fail('6.0 Competitors exist', 'Skipping section')
      return
    }

    for (const comp of competitors) {
      const { data: snapshots, count } = await supabase
        .from('competitor_snapshots')
        .select('snapshot_date, subscriber_count', { count: 'exact' })
        .eq('competitor_id', comp.id)
        .not('subscriber_count', 'is', null)
        .order('snapshot_date', { ascending: false })
        .limit(5)

      const snapCount = count ?? 0

      if (snapCount >= 30) {
        pass(`6. ${comp.channel_name} snapshot history`, `${snapCount} valid snapshots`)
      } else if (snapCount >= 5) {
        warn(`6. ${comp.channel_name} snapshot history`, `${snapCount} snapshots — will grow daily`)
      } else if (snapCount >= 1) {
        warn(
          `6. ${comp.channel_name} snapshot history`,
          `Only ${snapCount} snapshot — needs daily cron to build up`,
        )
      } else {
        fail(`6. ${comp.channel_name} snapshot history`, '0 non-null snapshots')
      }

      if (snapshots && snapshots.length > 0) {
        const latest = snapshots[0]
        const latestDate = new Date(latest.snapshot_date as string)
        const daysDiff = Math.floor(
          (Date.now() - latestDate.getTime()) / (1000 * 60 * 60 * 24),
        )

        if (daysDiff <= 1) {
          pass(
            `6. ${comp.channel_name} latest snapshot`,
            `${(latest.subscriber_count as number)?.toLocaleString()} subs on ${latest.snapshot_date}`,
          )
        } else {
          warn(
            `6. ${comp.channel_name} latest snapshot`,
            `${daysDiff} days ago — cron may have missed`,
          )
        }
      }
    }
  })
}

// ─── Section 7 — Gap Scores ───────────────────────────────────────────────────

async function testGapScores(): Promise<void> {
  await section('7. Gap Scores', async () => {
    const supabase = createServiceClient()

    const { data: gaps, error } = await supabase
      .from('gap_scores')
      .select('*')
      .eq('user_id', TEST_USER_ID)
      .order('calculated_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (error) {
      fail('7.1 Gap scores query', error.message)
      return
    }

    if (!gaps) {
      fail('7.1 Gap scores exist', 'No gap scores found — may not have calculated yet')
      return
    }
    pass('7.1 Gap scores exist', `calculated at ${gaps.calculated_at}`)

    if (
      gaps.overall_score != null &&
      (gaps.overall_score as number) >= 0 &&
      (gaps.overall_score as number) <= 100
    ) {
      pass('7.2 Overall gap score', `${gaps.overall_score}/100`)
    } else {
      fail('7.2 Overall gap score', `Invalid value: ${gaps.overall_score}`)
    }

    const scores: Record<string, number | null> = {
      views: gaps.views_gap_score as number | null,
      ctr: gaps.ctr_gap_score as number | null,
      watch_time: gaps.watch_time_gap_score as number | null,
      upload_freq: gaps.upload_frequency_gap_score as number | null,
    }

    const populated = Object.entries(scores).filter(([, v]) => v != null)
    if (populated.length === 4) {
      pass(
        '7.3 All gap scores populated',
        Object.entries(scores)
          .map(([k, v]) => `${k}=${v}`)
          .join(' '),
      )
    } else {
      warn('7.3 Gap scores', `Only ${populated.length}/4 scores populated`)
    }

    if (gaps.primary_bottleneck) {
      pass('7.4 Primary bottleneck', gaps.primary_bottleneck as string)
    } else {
      warn('7.4 Primary bottleneck', 'null — may not be calculated')
    }

    if (gaps.estimated_revenue_gap != null) {
      pass(
        '7.5 Revenue gap',
        `$${(gaps.estimated_revenue_gap as number).toFixed(2)}/month potential`,
      )
    } else {
      warn('7.5 Revenue gap', 'null')
    }
  })
}

// ─── Section 8 — Weekly Digests ───────────────────────────────────────────────

async function testDigests(): Promise<void> {
  await section('8. Weekly Digests', async () => {
    const supabase = createServiceClient()

    const { data: digests, error } = await supabase
      .from('digests')
      .select('*')
      .eq('user_id', TEST_USER_ID)
      .order('created_at', { ascending: false })
      .limit(3)

    if (error) {
      fail('8.1 Digests query', error.message)
      return
    }

    if (!digests || digests.length === 0) {
      fail('8.1 Digests exist', 'No digests found — weekly cron may not have run')
      return
    }
    pass('8.1 Digests exist', `${digests.length} digests found`)

    const latest = digests[0]

    if (latest.content && (latest.content as string).length > 100) {
      pass('8.2 Digest has content', `${(latest.content as string).length} chars`)
    } else {
      fail(
        '8.2 Digest content',
        `Content too short or missing: ${(latest.content as string)?.length ?? 0} chars`,
      )
    }

    if (latest.email_sent_at) {
      pass('8.3 Email sent', `sent at ${latest.email_sent_at}`)
    } else {
      fail('8.3 Email sent', 'email_sent_at is null — email was generated but not sent')
    }

    const daysSince = Math.floor(
      (Date.now() - new Date(latest.created_at as string).getTime()) / (1000 * 60 * 60 * 24),
    )
    if (daysSince <= 7) {
      pass('8.4 Digest recency', `Latest digest ${daysSince} day(s) ago`)
    } else {
      warn('8.4 Digest recency', `Latest digest was ${daysSince} days ago — next due Monday`)
    }

    if (
      latest.video_ideas &&
      Array.isArray(latest.video_ideas) &&
      (latest.video_ideas as unknown[]).length > 0
    ) {
      pass('8.5 Video ideas in digest', `${(latest.video_ideas as unknown[]).length} ideas`)
    } else {
      warn('8.5 Video ideas in digest', 'No video ideas found in digest')
    }
  })
}

// ─── Section 9 — Video Ideas ──────────────────────────────────────────────────

async function testIdeas(): Promise<void> {
  await section('9. Video Ideas', async () => {
    const supabase = createServiceClient()

    const { data: ideas, count, error } = await supabase
      .from('ideas')
      .select('*', { count: 'exact' })
      .eq('user_id', TEST_USER_ID)
      .order('generated_at', { ascending: false })
      .limit(5)

    if (error) {
      fail('9.1 Ideas query', error.message)
      return
    }

    if (!ideas || ideas.length === 0) {
      fail('9.1 Ideas exist', 'No ideas found')
      return
    }
    pass('9.1 Ideas exist', `${count} total ideas`)

    const latest = ideas[0]

    if (latest.title && (latest.title as string).length > 5) {
      pass('9.2 Idea has title', `"${(latest.title as string).substring(0, 60)}"`)
    } else {
      fail('9.2 Idea title', 'Missing or too short')
    }

    if (latest.opportunity_score != null && (latest.opportunity_score as number) > 0) {
      pass('9.3 Opportunity score', `${latest.opportunity_score}/100`)
    } else {
      warn('9.3 Opportunity score', 'Missing or zero')
    }

    // hook_2/hook_3 are the named columns; content_brief contains hook_1
    const withHooks = ideas.filter(
      (i) => i.content_brief || i.hook_2 || i.hook_3,
    )
    if (withHooks.length > 0) {
      pass('9.4 Ideas have hooks', `${withHooks.length}/${ideas.length} have hook content`)
    } else {
      warn('9.4 Ideas have hooks', 'No hook content found — may be old ideas pre-hooks feature')
    }

    const withWhyNow = ideas.filter(
      (i) => i.why_now && (i.why_now as string).length > 10,
    )
    if (withWhyNow.length > 0) {
      pass('9.5 Ideas have why_now', `${withWhyNow.length}/${ideas.length} have why_now`)
    } else {
      warn('9.5 Ideas have why_now', 'why_now missing')
    }

    const daysSince = Math.floor(
      (Date.now() - new Date(latest.generated_at as string).getTime()) / (1000 * 60 * 60 * 24),
    )
    if (daysSince <= 7) {
      pass('9.6 Idea recency', `Latest idea generated ${daysSince} day(s) ago`)
    } else {
      warn('9.6 Idea recency', `Latest idea is ${daysSince} days old`)
    }
  })
}

// ─── Section 10 — Cron Routes ─────────────────────────────────────────────────

async function testCronRoutes(baseUrl: string): Promise<void> {
  await section('10. Cron Routes (HTTP)', async () => {
    // 10.1 refresh-data
    try {
      const res = await cronFetch(baseUrl, '/api/cron/refresh-data')
      if (res.ok) {
        const data = (await res.json()) as Record<string, number>
        pass(
          '10.1 refresh-data cron',
          `processed=${data.processed} succeeded=${data.succeeded} failed=${data.failed}`,
        )
        if ((data.failed ?? 0) > 0) {
          warn('10.1 refresh-data failures', `${data.failed} user(s) failed`)
        }
      } else {
        fail('10.1 refresh-data cron', `HTTP ${res.status}`)
      }
    } catch (err) {
      fail(
        '10.1 refresh-data cron',
        `Fetch error: ${err instanceof Error ? err.message : String(err)}`,
      )
    }

    // 10.2 trend-detection
    try {
      const res = await cronFetch(baseUrl, '/api/cron/trend-detection')
      if (res.ok) {
        const data = (await res.json()) as Record<string, number>
        pass(
          '10.2 trend-detection cron',
          `channelsChecked=${data.channelsChecked ?? data.channels} viralFound=${data.viralVideosFound ?? data.viral}`,
        )
      } else {
        fail('10.2 trend-detection cron', `HTTP ${res.status}`)
      }
    } catch (err) {
      fail(
        '10.2 trend-detection cron',
        `Fetch error: ${err instanceof Error ? err.message : String(err)}`,
      )
    }

    // 10.3 weekly-digest (just check it responds, don't re-run full digest generation)
    try {
      const res = await cronFetch(baseUrl, '/api/cron/weekly-digest')
      if (res.ok) {
        const data = (await res.json()) as Record<string, number>
        pass(
          '10.3 weekly-digest cron',
          `processed=${data.processed} succeeded=${data.succeeded}`,
        )
      } else {
        fail('10.3 weekly-digest cron', `HTTP ${res.status}`)
      }
    } catch (err) {
      fail(
        '10.3 weekly-digest cron',
        `Fetch error: ${err instanceof Error ? err.message : String(err)}`,
      )
    }

    // 10.4 /api/sync with cron user-id bypass
    try {
      const res = await cronFetchWithUserId(baseUrl, '/api/sync')
      if (res.ok) {
        const data = (await res.json()) as {
          success: boolean
          videosSynced: number
          channelSnapshot: unknown
        }
        pass(
          '10.4 /api/sync',
          `success=${data.success} videos=${data.videosSynced} snapshot=${data.channelSnapshot != null}`,
        )
      } else {
        const body = await res.text()
        fail('10.4 /api/sync', `HTTP ${res.status} — ${body.substring(0, 120)}`)
      }
    } catch (err) {
      fail(
        '10.4 /api/sync',
        `Fetch error: ${err instanceof Error ? err.message : String(err)}`,
      )
    }

    // 10.5 Reject bad cron secret
    try {
      const res = await fetch(`${baseUrl}/api/cron/trend-detection`, {
        headers: { Authorization: 'Bearer wrong-secret' },
        signal: AbortSignal.timeout(5000),
      })
      if (res.status === 401) {
        pass('10.5 Bad cron secret rejected', 'HTTP 401 as expected')
      } else {
        fail('10.5 Bad cron secret rejected', `Expected 401 but got ${res.status}`)
      }
    } catch (err) {
      warn(
        '10.5 Bad cron secret rejected',
        `Could not verify: ${err instanceof Error ? err.message : String(err)}`,
      )
    }

    // 10.6 cache-cleanup cron
    try {
      const res = await cronFetch(baseUrl, '/api/cron/cache-cleanup')
      if (res.ok) {
        const data = (await res.json()) as Record<string, number>
        pass(
          '10.6 cache-cleanup cron',
          `expired_cache_deleted=${data.expired_cache_deleted ?? 0} old_searches_deleted=${data.old_searches_deleted ?? 0}`,
        )
      } else {
        fail('10.6 cache-cleanup cron', `HTTP ${res.status}`)
      }
    } catch (err) {
      fail(
        '10.6 cache-cleanup cron',
        `Fetch error: ${err instanceof Error ? err.message : String(err)}`,
      )
    }

    // 10.7 sub-niche-detection cron
    try {
      const res = await cronFetch(baseUrl, '/api/cron/sub-niche-detection')
      if (res.ok) {
        const data = (await res.json()) as Record<string, number>
        pass(
          '10.7 sub-niche-detection cron',
          `processed=${data.processed ?? 0} updated=${data.updated ?? 0}`,
        )
      } else {
        fail('10.7 sub-niche-detection cron', `HTTP ${res.status}`)
      }
    } catch (err) {
      fail(
        '10.7 sub-niche-detection cron',
        `Fetch error: ${err instanceof Error ? err.message : String(err)}`,
      )
    }
  })
}

// ─── Section 11 — Onboarding Flow Data ───────────────────────────────────────

async function testOnboardingFlow(): Promise<void> {
  await section('11. Onboarding Flow Data', async () => {
    const supabase = createServiceClient()

    const { data: user } = await supabase
      .from('users')
      .select('name, image, youtube_channel_id, niche_id, sub_niche, onboarding_completed')
      .eq('id', TEST_USER_ID)
      .single()

    if (user?.name) {
      pass('11.1 Channel name available', user.name as string)
    } else {
      fail('11.1 Channel name', 'null — Step 2 will show no name')
    }

    if (user?.image) {
      pass('11.2 Channel thumbnail available', 'present')
    } else {
      warn('11.2 Channel thumbnail', 'null — Step 2 will show initial fallback')
    }

    if (user?.niche_id) {
      pass('11.3 Niche detected for Step 3', user.niche_id as string)
    } else {
      fail(
        '11.3 Niche for Step 3',
        'null — Step 3 will spin until timeout then default to finance',
      )
    }

    const { data: competitors } = await supabase
      .from('competitors')
      .select('id, channel_name, tier, is_dominator, channel_thumbnail')
      .eq('user_id', TEST_USER_ID)
      .eq('is_active', true)

    const hasTier1 = competitors?.some((c) => c.tier === 1) ?? false
    const hasTier2 = competitors?.some((c) => c.tier === 2) ?? false
    const hasDom = competitors?.some((c) => c.is_dominator || c.tier === 3) ?? false

    if (hasTier1 && hasTier2 && hasDom) {
      pass('11.4 All 3 tiers for Step 4', 'Tier1✓ Tier2✓ Dominator✓')
    } else {
      fail(
        '11.4 All 3 tiers for Step 4',
        `Tier1=${hasTier1} Tier2=${hasTier2} Dom=${hasDom}`,
      )
    }

    const { data: gap } = await supabase
      .from('gap_scores')
      .select('overall_score')
      .eq('user_id', TEST_USER_ID)
      .order('calculated_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (gap?.overall_score != null) {
      pass('11.5 Gap score for Step 5 reveal', `${gap.overall_score}/100`)
    } else {
      warn('11.5 Gap score for Step 5', 'null — Step 5 will show fallback message')
    }

    const { data: idea } = await supabase
      .from('ideas')
      .select('title, why_now')
      .eq('user_id', TEST_USER_ID)
      .order('generated_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (idea?.title) {
      pass(
        '11.6 Top idea for Step 5 reveal',
        `"${(idea.title as string).substring(0, 50)}"`,
      )
    } else {
      warn('11.6 Top idea for Step 5', 'null — Step 5 will show fallback message')
    }

    if (user?.onboarding_completed) {
      pass('11.7 Onboarding flag', 'onboarding_completed=true')
    } else {
      warn(
        '11.7 Onboarding flag',
        'onboarding_completed=false — user would be routed to /onboarding',
      )
    }
  })
}

// ─── Section 12 — Email System ────────────────────────────────────────────────

async function testEmailSystem(): Promise<void> {
  await section('12. Email System', async () => {
    const supabase = createServiceClient()

    if (process.env.RESEND_API_KEY) {
      pass('12.1 RESEND_API_KEY configured', 'present')
    } else {
      fail('12.1 RESEND_API_KEY configured', 'missing from env — no emails will send')
    }

    const fromEmail = process.env.RESEND_FROM_EMAIL ?? 'onboarding@resend.dev (fallback)'
    pass('12.2 FROM_EMAIL', fromEmail)

    const { data: lastDigest } = await supabase
      .from('digests')
      .select('email_sent_at, created_at')
      .eq('user_id', TEST_USER_ID)
      .not('email_sent_at', 'is', null)
      .order('email_sent_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (lastDigest?.email_sent_at) {
      const daysSince = Math.floor(
        (Date.now() - new Date(lastDigest.email_sent_at as string).getTime()) /
          (1000 * 60 * 60 * 24),
      )
      pass('12.3 Last digest email sent', `${daysSince} day(s) ago`)
    } else {
      fail(
        '12.3 Last digest email sent',
        'No digest email ever sent — check sendWeeklyDigest wiring',
      )
    }

    const { data: settings } = await supabase
      .from('user_settings')
      .select('*')
      .eq('user_id', TEST_USER_ID)
      .maybeSingle()

    if (settings) {
      pass('12.4 User settings exist', `alerts_enabled=${settings.alerts_enabled}`)
    } else {
      warn(
        '12.4 User settings',
        'No user_settings row — alert preferences not configured',
      )
    }

    // 12.5 Unsubscribe token exists (for one-click email unsubscribe)
    if (settings?.unsubscribe_token) {
      pass('12.5 Unsubscribe token', 'present — one-click unsubscribe will work')
    } else {
      warn('12.5 Unsubscribe token', 'null — will be generated on next email send')
    }
  })
}

// ─── Section 13 — Competitor Insights ────────────────────────────────────────

async function testCompetitorInsights(): Promise<void> {
  await section('13. Competitor Insights', async () => {
    const supabase = createServiceClient()

    const { data: competitors } = await supabase
      .from('competitors')
      .select('id, channel_name, insights, insights_generated_at, avg_views_per_video, video_count')
      .eq('user_id', TEST_USER_ID)
      .eq('is_active', true)

    if (!competitors || competitors.length === 0) {
      fail('13.0 Competitors for insights', 'No competitors found')
      return
    }

    for (const comp of competitors) {
      const hasEnoughData =
        comp.avg_views_per_video != null || ((comp.video_count as number) ?? 0) > 0
      if (hasEnoughData) {
        pass(
          `13. ${comp.channel_name} has enough data`,
          `avg_views=${comp.avg_views_per_video} video_count=${comp.video_count}`,
        )
      } else {
        fail(
          `13. ${comp.channel_name} has enough data`,
          'Missing avg_views and video_count — insights will be blocked',
        )
      }

      if (comp.insights && comp.insights_generated_at) {
        const daysSince = Math.floor(
          (Date.now() - new Date(comp.insights_generated_at as string).getTime()) /
            (1000 * 60 * 60 * 24),
        )
        const insightCount = Array.isArray(comp.insights)
          ? (comp.insights as unknown[]).length
          : '?'
        pass(
          `13. ${comp.channel_name} insights cached`,
          `${daysSince} day(s) old (${insightCount} insights)`,
        )
      } else {
        warn(
          `13. ${comp.channel_name} insights`,
          'Not cached — will generate on first Insights tab view',
        )
      }
    }
  })
}

// ─── Section 14 — Plan Gating ─────────────────────────────────────────────────

async function testPlanGating(): Promise<void> {
  await section('14. Plan Gating', async () => {
    const supabase = createServiceClient()

    const { data: user } = await supabase
      .from('users')
      .select(
        'subscription_status, subscription_plan, trial_ends_at, current_period_end',
      )
      .eq('id', TEST_USER_ID)
      .single()

    if (!user) {
      fail('14.0 User found', 'Cannot check plan gating')
      return
    }

    const validStatuses = ['free', 'on_trial', 'active', 'past_due', 'cancelled']
    if (validStatuses.includes(user.subscription_status as string)) {
      pass(
        '14.1 Subscription status valid',
        `${user.subscription_status} / ${user.subscription_plan}`,
      )
    } else {
      fail('14.1 Subscription status', `Invalid value: ${user.subscription_status}`)
    }

    if (user.subscription_status === 'on_trial') {
      if (user.trial_ends_at) {
        const trialEnd = new Date(user.trial_ends_at as string)
        const daysLeft = Math.ceil(
          (trialEnd.getTime() - Date.now()) / (1000 * 60 * 60 * 24),
        )
        pass('14.2 Trial end date', `${daysLeft} days remaining`)
      } else {
        fail('14.2 Trial end date', 'on_trial status but trial_ends_at is null')
      }
    }

    const { count: competitorCount } = await supabase
      .from('competitors')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', TEST_USER_ID)
      .eq('is_active', true)

    const planLimits: Record<string, number> = {
      free: 1,
      starter: 4,
      pro: 999,
    }
    const plan = (user.subscription_plan as string) ?? 'free'
    const limit = planLimits[plan] ?? 4
    const compCount = competitorCount ?? 0

    if (compCount <= limit) {
      pass('14.3 Competitor count within plan limit', `${compCount}/${limit} slots used`)
    } else {
      fail(
        '14.3 Competitor count',
        `${compCount} competitors but plan limit is ${limit}`,
      )
    }
  })
}

// ─── Section 15 — Payments ────────────────────────────────────────────────────

async function testPayments(): Promise<void> {
  await section('15. Payments (Lemon Squeezy)', async () => {
    if (process.env.LEMONSQUEEZY_API_KEY) {
      pass('15.1 LemonSqueezy API key', 'present')
    } else {
      warn('15.1 LemonSqueezy API key', 'missing — checkout will not work')
    }

    if (process.env.LEMONSQUEEZY_WEBHOOK_SECRET) {
      pass('15.2 Webhook secret', 'present')
    } else {
      warn('15.2 Webhook secret', 'missing — webhooks will be rejected')
    }

    if (process.env.LEMONSQUEEZY_STORE_ID) {
      pass('15.3 Store ID', process.env.LEMONSQUEEZY_STORE_ID)
    } else {
      warn('15.3 Store ID', 'missing')
    }

    const supabase = createServiceClient()
    const { data: user } = await supabase
      .from('users')
      .select('lemon_squeezy_customer_id, lemon_squeezy_subscription_id')
      .eq('id', TEST_USER_ID)
      .single()

    if (user?.lemon_squeezy_customer_id) {
      pass('15.4 LS customer ID', user.lemon_squeezy_customer_id as string)
    } else {
      warn('15.4 LS customer ID', 'null — test user has not paid yet')
    }
  })
}

// ─── Section 16 — Environment Variables ──────────────────────────────────────

async function testEnvVars(): Promise<void> {
  await section('16. Environment Variables', async () => {
    const required = [
      'NEXT_PUBLIC_APP_URL',
      'NEXTAUTH_URL',
      'NEXTAUTH_SECRET',
      'GOOGLE_CLIENT_ID',
      'GOOGLE_CLIENT_SECRET',
      'NEXT_PUBLIC_SUPABASE_URL',
      'NEXT_PUBLIC_SUPABASE_ANON_KEY',
      'SUPABASE_SERVICE_ROLE_KEY',
      'ANTHROPIC_API_KEY',
      'YOUTUBE_API_KEY',
      'CRON_SECRET',
      'RESEND_API_KEY',
    ]

    const optional = [
      'RESEND_FROM_EMAIL',
      'LEMONSQUEEZY_API_KEY',
      'LEMONSQUEEZY_WEBHOOK_SECRET',
      'LEMONSQUEEZY_STORE_ID',
      'LEMONSQUEEZY_VARIANT_ID_STARTER',
      'LEMONSQUEEZY_VARIANT_ID_PRO',
      'GEMINI_API_KEY',
      'GOOGLE_GEMINI_API_KEY',
      'SENTRY_DSN',
    ]

    for (const key of required) {
      if (process.env[key]) {
        pass(`16. ${key}`, 'present')
      } else {
        fail(`16. ${key}`, 'MISSING — required for app to function')
      }
    }

    for (const key of optional) {
      if (process.env[key]) {
        pass(`16. ${key}`, 'present')
      } else {
        warn(`16. ${key}`, 'not set — feature may be degraded')
      }
    }
  })
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log('\n' + '═'.repeat(60))
  console.log('  SHOWSTENCIL — FULL INTEGRATION TEST SUITE')
  console.log('  ' + new Date().toISOString())
  console.log('═'.repeat(60))

  const baseUrl = await detectBaseUrl()

  // Run all sections. Each has its own error boundary — one failure
  // never prevents the rest from running.
  await testUserData()
  await testChannelSnapshots()
  await testOwnVideos()
  await testCompetitors()
  await testCompetitorVideos()
  await testCompetitorSnapshots()
  await testGapScores()
  await testDigests()
  await testIdeas()
  await testCronRoutes(baseUrl)
  await testOnboardingFlow()
  await testEmailSystem()
  await testCompetitorInsights()
  await testPlanGating()
  await testPayments()
  await testEnvVars()

  // ─── Final summary ──────────────────────────────────────────────────────────

  console.log(`\n${'═'.repeat(60)}`)
  console.log('  FINAL RESULTS')
  console.log(`${'═'.repeat(60)}`)
  console.log(`  ✓ Passed:   ${passed}`)
  console.log(`  ✗ Failed:   ${failed}`)
  console.log(`  ⚠ Warnings: ${warnings}`)
  console.log(`  Total:     ${passed + failed + warnings}`)
  console.log(`${'═'.repeat(60)}`)

  const denominator = passed + failed
  const score = denominator > 0 ? Math.round((passed / denominator) * 100) : 0

  if (failed === 0) {
    console.log('\n  🎉 PERFECT SCORE — App is fully operational')
  } else if (score >= 85) {
    console.log(`\n  ✅ SCORE: ${score}% — App is mostly working (${failed} failures)`)
  } else if (score >= 60) {
    console.log(`\n  ⚠️  SCORE: ${score}% — Significant issues need attention`)
  } else {
    console.log(`\n  ❌ SCORE: ${score}% — Critical failures detected`)
  }

  if (failed > 0) {
    console.log('\n  FAILURES TO FIX:')
    results
      .filter((r) => r.status === 'FAIL')
      .forEach((r) => console.log(`  ✗ ${r.name}: ${r.detail}`))
  }

  if (warnings > 0) {
    console.log('\n  WARNINGS:')
    results
      .filter((r) => r.status === 'WARN')
      .forEach((r) => console.log(`  ⚠ ${r.name}: ${r.detail}`))
  }

  console.log()
  process.exit(failed > 0 ? 1 : 0)
}

main().catch((err) => {
  console.error('\nTest runner crashed:', err)
  process.exit(1)
})
