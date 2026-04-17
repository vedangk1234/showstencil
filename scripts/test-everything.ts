import { config } from 'dotenv'
config({ path: '.env.local', override: true })

/**
 * scripts/test-everything.ts
 * Comprehensive automated test suite for all ShowStencil backend features.
 *
 * Run: npx tsx scripts/test-everything.ts
 *
 * Never stops on failure — runs all 28 tests and reports at the end.
 */

import crypto from 'crypto'
import { createServiceClient } from '@/lib/supabase'
import {
  saveChannelSnapshot,
  saveVideoData,
  getChannelSnapshots,
  getVideos,
  getUserSettings,
  upsertUserSettings,
  updateUserOnboardingStatus,
  updateUserSubscription,
  getUser,
  getUserByLSCustomerId,
  getUserByLSSubscriptionId,
  getCompetitorMetricsFromDB,
} from '@/lib/db'
import { detectNiche } from '@/lib/niche-engine'
import { calculateGapScore } from '@/lib/gap-scorer'
import {
  getNicheBenchmarks,
  getSubscriberTier,
  calculateRevenuePotential,
} from '@/lib/revenue-benchmarks'
import { detectViralVideos, findUncoveredTopics } from '@/lib/trend-detector'
import { generateDigest } from '@/lib/digest-generator'
import { generateVideoIdeas } from '@/lib/idea-generator'
import {
  generateUnsubscribeToken,
  sendWeeklyDigest,
  sendTrendAlert,
  checkAndSendAlerts,
} from '@/lib/email'
import {
  canAccess,
  getCompetitorLimit,
  getIdeaLimit,
  getViralLimit,
  getTopicLimit,
  getArchiveWeeks,
  getUpgradeMessage,
} from '@/lib/access'
import type {
  UserMetrics,
  CompetitorMetrics,
  DigestResult,
  IdeaResult,
  ViralVideo,
} from '@/types'

// ─── Constants ────────────────────────────────────────────────────────────────

const SEEDED_USER_ID = '848f7497-9a46-40a3-8d90-a96d1c9cf909'
let TEMP_USER_ID = ''

// ─── Result tracking ──────────────────────────────────────────────────────────

type TestStatus = 'PASS' | 'FAIL' | 'WARN' | 'SKIP'

interface TestResult {
  id: string
  name: string
  status: TestStatus
  message?: string
  error?: string
}

const results: TestResult[] = []
const startTime = Date.now()
let totalApiCost = 0  // accumulates USD cost from Claude calls

function record(id: string, name: string, status: TestStatus, message?: string, error?: string) {
  results.push({ id, name, status, message, error })
  const icon = status === 'PASS' ? '✅' : status === 'FAIL' ? '❌' : status === 'WARN' ? '⚠️' : '⏭️'
  const detail = message ? ` — ${message}` : error ? ` — ERROR: ${error}` : ''
  console.log(`  ${icon}  ${id} ${name}${detail}`)
}

function banner(title: string) {
  console.log(`\n${'═'.repeat(66)}`)
  console.log(`  ${title}`)
  console.log('═'.repeat(66))
}

// ─── PHASE 1 — ENVIRONMENT VARIABLES ─────────────────────────────────────────

async function runPhase1() {
  banner('PHASE 1 — ENVIRONMENT VARIABLES')

  const required = [
    'NEXT_PUBLIC_SUPABASE_URL',
    'NEXT_PUBLIC_SUPABASE_ANON_KEY',
    'SUPABASE_SERVICE_ROLE_KEY',
    'GOOGLE_CLIENT_ID',
    'GOOGLE_CLIENT_SECRET',
    'NEXTAUTH_SECRET',
    'NEXTAUTH_URL',
    'YOUTUBE_API_KEY',
    'ANTHROPIC_API_KEY',
    'RESEND_API_KEY',
    'RESEND_FROM_EMAIL',
    'CRON_SECRET',
    'LEMONSQUEEZY_API_KEY',
    'LEMONSQUEEZY_STORE_ID',
    'LEMONSQUEEZY_STARTER_VARIANT_ID',
    'LEMONSQUEEZY_PRO_VARIANT_ID',
    'LEMONSQUEEZY_WEBHOOK_SECRET',
  ]

  const missing = required.filter((k) => !process.env[k])

  if (missing.length === 0) {
    record('1.1', 'All env vars present', 'PASS', `${required.length}/${required.length} variables set`)
  } else {
    record('1.1', 'All env vars present', 'FAIL', undefined, `Missing: ${missing.join(', ')}`)
  }
}

// ─── PHASE 2 — DATABASE ───────────────────────────────────────────────────────

async function runPhase2() {
  banner('PHASE 2 — DATABASE')

  const supabase = createServiceClient()

  // 2.1 — Supabase connection
  try {
    const { error } = await supabase.from('users').select('id').limit(1)
    if (error) {
      record('2.1', 'Supabase connection', 'FAIL', undefined, error.message)
    } else {
      record('2.1', 'Supabase connection', 'PASS')
    }
  } catch (e: unknown) {
    record('2.1', 'Supabase connection', 'FAIL', undefined, String(e))
  }

  // 2.2 — All required tables exist
  const tables = [
    'users', 'channel_snapshots', 'videos', 'competitors',
    'competitor_videos', 'digests', 'ideas', 'user_settings',
    'gap_scores', 'trends',
  ]

  const missingTables: string[] = []
  for (const table of tables) {
    try {
      const { error } = await supabase.from(table).select('*').limit(1)
      if (error) missingTables.push(`${table} (${error.message})`)
    } catch (e: unknown) {
      missingTables.push(`${table} (${String(e)})`)
    }
  }

  if (missingTables.length === 0) {
    record('2.2', 'All tables exist', 'PASS', `${tables.length} tables found`)
  } else {
    record('2.2', 'All tables exist', 'FAIL', undefined, `Missing: ${missingTables.join(', ')}`)
  }

  // 2.3 — Users table schema
  try {
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .eq('id', SEEDED_USER_ID)
      .single()

    if (error || !data) {
      record('2.3', 'Users table schema', 'FAIL', undefined, error?.message ?? 'seeded user not found')
    } else {
      const required = [
        'id', 'email', 'youtube_access_token', 'onboarding_completed',
        'niche_id', 'subscription_status', 'subscription_plan',
        'lemon_squeezy_customer_id', 'lemon_squeezy_subscription_id',
        'trial_ends_at', 'current_period_end',
      ]
      const missingCols = required.filter((col) => !(col in data))
      if (missingCols.length === 0) {
        record('2.3', 'Users table schema', 'PASS', `${required.length} required columns present`)
      } else {
        record('2.3', 'Users table schema', 'FAIL', undefined, `Missing columns: ${missingCols.join(', ')}`)
      }
    }
  } catch (e: unknown) {
    record('2.3', 'Users table schema', 'FAIL', undefined, String(e))
  }

  // 2.4 — Create temp user
  TEMP_USER_ID = crypto.randomUUID()
  try {
    const { error } = await supabase.from('users').insert({
      id: TEMP_USER_ID,
      email: 'test-automated@showstencil-test.com',
      onboarding_completed: false,
      subscription_status: 'free',
      subscription_plan: 'free',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })

    if (error) {
      record('2.4', 'Create temp user', 'FAIL', undefined, error.message)
      TEMP_USER_ID = '' // can't continue DB tests without this
    } else {
      // Verify we can read it back
      const user = await getUser(TEMP_USER_ID)
      if (user) {
        record('2.4', 'Create temp user', 'PASS', `Created temp user: ${TEMP_USER_ID}`)
        console.log(`         Created temp user: ${TEMP_USER_ID}`)
      } else {
        record('2.4', 'Create temp user', 'FAIL', undefined, 'Insert succeeded but read-back failed')
      }
    }
  } catch (e: unknown) {
    record('2.4', 'Create temp user', 'FAIL', undefined, String(e))
    TEMP_USER_ID = ''
  }

  if (!TEMP_USER_ID) {
    // Skip remaining DB tests that depend on TEMP_USER_ID
    const skipped = ['2.5','2.6','2.7','2.8','2.9','2.10','2.11','2.12','2.13']
    for (const id of skipped) {
      record(id, `(skipped — temp user creation failed)`, 'SKIP')
    }
    record('2.14', 'Delete temp user and cleanup', 'SKIP', 'Skipped — temp user was never created')
    return
  }

  // 2.5 — saveChannelSnapshot
  try {
    const fakeOverview = {
      totalViews: 125000,
      totalWatchTimeMinutes: 450000,
      avgViewDurationSeconds: 280,
      subscribersGained: 320,
      subscribersLost: 45,
      netSubscribers: 275,
      estimatedRevenue: 450,
    }
    const ok = await saveChannelSnapshot(TEMP_USER_ID, fakeOverview)
    if (ok) {
      const rows = await supabase
        .from('channel_snapshots')
        .select('id')
        .eq('user_id', TEMP_USER_ID)
        .limit(1)
      record('2.5', 'Save channel snapshot', rows.data && rows.data.length > 0 ? 'PASS' : 'FAIL',
        ok ? 'snapshot saved' : undefined)
    } else {
      record('2.5', 'Save channel snapshot', 'FAIL', undefined, 'saveChannelSnapshot returned false')
    }
  } catch (e: unknown) {
    record('2.5', 'Save channel snapshot', 'FAIL', undefined, String(e))
  }

  // 2.6 — saveVideoData
  try {
    const fakeAnalytics = [
      { videoId: 'test_vid_001', views: 12500, watchTimeMinutes: 45000, avgViewDurationSeconds: 216,
        avgViewPercentage: 62, likes: 450, comments: 89, shares: 23, subscribersGained: 45,
        subscribersLost: 5, estimatedRevenue: 48, ctr: 0.042 },
      { videoId: 'test_vid_002', views: 8200, watchTimeMinutes: 28000, avgViewDurationSeconds: 205,
        avgViewPercentage: 55, likes: 290, comments: 55, shares: 14, subscribersGained: 28,
        subscribersLost: 3, estimatedRevenue: 31, ctr: 0.038 },
      { videoId: 'test_vid_003', views: 5600, watchTimeMinutes: 18000, avgViewDurationSeconds: 193,
        avgViewPercentage: 48, likes: 178, comments: 33, shares: 8, subscribersGained: 15,
        subscribersLost: 2, estimatedRevenue: 21, ctr: 0.031 },
    ]
    const fakeDetails = [
      { videoId: 'test_vid_001', title: 'How I Invested My First $1000', publishedAt: '2026-03-01T10:00:00Z',
        duration: 842, likeCount: 450, commentCount: 89, viewCount: 12500, thumbnailDefault: '',
        thumbnailHighRes: '', tags: [], categoryId: '27', categoryName: 'Education',
        defaultLanguage: 'en', isLiveStream: false, madeForKids: false },
      { videoId: 'test_vid_002', title: 'Index Funds Explained Simply', publishedAt: '2026-03-08T10:00:00Z',
        duration: 724, likeCount: 290, commentCount: 55, viewCount: 8200, thumbnailDefault: '',
        thumbnailHighRes: '', tags: [], categoryId: '27', categoryName: 'Education',
        defaultLanguage: 'en', isLiveStream: false, madeForKids: false },
      { videoId: 'test_vid_003', title: 'My Stock Portfolio Q1 Update', publishedAt: '2026-03-15T10:00:00Z',
        duration: 618, likeCount: 178, commentCount: 33, viewCount: 5600, thumbnailDefault: '',
        thumbnailHighRes: '', tags: [], categoryId: '27', categoryName: 'Education',
        defaultLanguage: 'en', isLiveStream: false, madeForKids: false },
    ]
    const saved = await saveVideoData(TEMP_USER_ID, fakeAnalytics, fakeDetails)
    if (saved === 3) {
      record('2.6', 'Save video data', 'PASS', `${saved} videos saved`)
    } else {
      record('2.6', 'Save video data', 'FAIL', undefined, `Expected 3 videos saved, got ${saved}`)
    }
  } catch (e: unknown) {
    record('2.6', 'Save video data', 'FAIL', undefined, String(e))
  }

  // 2.7 — getChannelSnapshots
  try {
    const snapshots = await getChannelSnapshots(TEMP_USER_ID, 30)
    if (snapshots.length >= 1) {
      record('2.7', 'Get channel snapshots', 'PASS', `${snapshots.length} snapshot(s) returned`)
    } else {
      record('2.7', 'Get channel snapshots', 'FAIL', undefined, 'Returned empty array')
    }
  } catch (e: unknown) {
    record('2.7', 'Get channel snapshots', 'FAIL', undefined, String(e))
  }

  // 2.8 — getVideos
  try {
    const videos = await getVideos(TEMP_USER_ID, 10)
    if (videos.length >= 1) {
      record('2.8', 'Get videos', 'PASS', `${videos.length} video(s) returned`)
    } else {
      record('2.8', 'Get videos', 'FAIL', undefined, 'Returned empty array')
    }
  } catch (e: unknown) {
    record('2.8', 'Get videos', 'FAIL', undefined, String(e))
  }

  // 2.9 — getUserSettings and upsertUserSettings
  try {
    const ok = await upsertUserSettings(TEMP_USER_ID, {
      weekly_digest_enabled: true,
      alerts_enabled: true,
      alert_threshold_multiplier: 3.0,
    })
    if (!ok) {
      record('2.9', 'User settings upsert', 'FAIL', undefined, 'upsertUserSettings returned false')
    } else {
      const settings = await getUserSettings(TEMP_USER_ID)
      if (
        settings &&
        settings.weekly_digest_enabled === true &&
        settings.alerts_enabled === true &&
        settings.alert_threshold_multiplier === 3.0
      ) {
        record('2.9', 'User settings upsert', 'PASS', 'settings upserted and verified')
      } else {
        record('2.9', 'User settings upsert', 'FAIL', undefined,
          `Values mismatch: ${JSON.stringify(settings)}`)
      }
    }
  } catch (e: unknown) {
    record('2.9', 'User settings upsert', 'FAIL', undefined, String(e))
  }

  // 2.10 — updateUserOnboardingStatus
  try {
    const ok = await updateUserOnboardingStatus(TEMP_USER_ID, true)
    if (!ok) {
      record('2.10', 'Update onboarding status', 'FAIL', undefined, 'returned false')
    } else {
      const user = await getUser(TEMP_USER_ID)
      if (user?.onboarding_completed === true) {
        record('2.10', 'Update onboarding status', 'PASS', 'onboarding_completed = true')
      } else {
        record('2.10', 'Update onboarding status', 'FAIL', undefined,
          `onboarding_completed is still ${user?.onboarding_completed}`)
      }
    }
  } catch (e: unknown) {
    record('2.10', 'Update onboarding status', 'FAIL', undefined, String(e))
  }

  // 2.11 — updateUserSubscription
  try {
    const trialEnd = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
    const ok = await updateUserSubscription(TEMP_USER_ID, {
      subscription_status: 'on_trial',
      subscription_plan: 'pro',
      trial_ends_at: trialEnd,
    })
    if (!ok) {
      record('2.11', 'Update subscription', 'FAIL', undefined, 'returned false')
    } else {
      const user = await getUser(TEMP_USER_ID)
      if (user?.subscription_plan === 'pro') {
        record('2.11', 'Update subscription', 'PASS', `plan=${user.subscription_plan}, status=${user.subscription_status}`)
      } else {
        record('2.11', 'Update subscription', 'FAIL', undefined,
          `subscription_plan is ${user?.subscription_plan}`)
      }
    }
  } catch (e: unknown) {
    record('2.11', 'Update subscription', 'FAIL', undefined, String(e))
  }

  // 2.12 — getUserByLSCustomerId
  try {
    await updateUserSubscription(TEMP_USER_ID, { lemon_squeezy_customer_id: 'test_customer_999' })
    const user = await getUserByLSCustomerId('test_customer_999')
    if (user && user.id === TEMP_USER_ID) {
      record('2.12', 'Get user by LS customer ID', 'PASS', `found user ${user.id.slice(0, 8)}…`)
    } else {
      record('2.12', 'Get user by LS customer ID', 'FAIL', undefined,
        user ? `wrong user returned: ${user.id}` : 'returned null')
    }
  } catch (e: unknown) {
    record('2.12', 'Get user by LS customer ID', 'FAIL', undefined, String(e))
  }

  // 2.13 — getUserByLSSubscriptionId
  try {
    await updateUserSubscription(TEMP_USER_ID, { lemon_squeezy_subscription_id: 'test_sub_999' })
    const user = await getUserByLSSubscriptionId('test_sub_999')
    if (user && user.id === TEMP_USER_ID) {
      record('2.13', 'Get user by LS subscription ID', 'PASS', `found user ${user.id.slice(0, 8)}…`)
    } else {
      record('2.13', 'Get user by LS subscription ID', 'FAIL', undefined,
        user ? `wrong user returned: ${user.id}` : 'returned null')
    }
  } catch (e: unknown) {
    record('2.13', 'Get user by LS subscription ID', 'FAIL', undefined, String(e))
  }

  // 2.14 — Delete temp user and all related data
  let cleanupOk = true
  const cleanupErrors: string[] = []
  const deleteTargets: { table: string; column: string }[] = [
    { table: 'user_settings', column: 'user_id' },
    { table: 'channel_snapshots', column: 'user_id' },
    { table: 'videos', column: 'user_id' },
    { table: 'digests', column: 'user_id' },
    { table: 'ideas', column: 'user_id' },
  ]

  for (const { table, column } of deleteTargets) {
    const { error } = await supabase.from(table).delete().eq(column, TEMP_USER_ID)
    if (error) {
      cleanupOk = false
      cleanupErrors.push(`${table}: ${error.message}`)
    }
  }

  // Delete the user row itself
  const { error: userDeleteError } = await supabase
    .from('users')
    .delete()
    .eq('id', TEMP_USER_ID)

  if (userDeleteError) {
    cleanupOk = false
    cleanupErrors.push(`users: ${userDeleteError.message}`)
  } else {
    // Verify user is gone
    const user = await getUser(TEMP_USER_ID)
    if (user) {
      cleanupOk = false
      cleanupErrors.push('user still exists after delete')
    }
  }

  if (cleanupOk) {
    record('2.14', 'Delete temp user and cleanup', 'PASS', `Cleaned up temp user: ${TEMP_USER_ID}`)
    console.log(`         Cleaned up temp user: ${TEMP_USER_ID}`)
  } else {
    record('2.14', 'Delete temp user and cleanup', 'FAIL', undefined, cleanupErrors.join('; '))
    console.warn('\n  ⚠️  MANUAL CLEANUP NEEDED: delete user test-automated@showstencil-test.com from Supabase\n')
  }
}

// ─── PHASE 3 — INTELLIGENCE PIPELINE ─────────────────────────────────────────

async function runPhase3() {
  banner('PHASE 3 — INTELLIGENCE PIPELINE')

  // 3.1 — Niche detection
  try {
    const titles = [
      'How I Invested My First $1000',
      'Index Funds for Beginners',
      'My Stock Portfolio Revealed',
      'How to Build an Emergency Fund',
      'Passive Income with Dividends',
    ]
    const result = await detectNiche(titles, [])
    console.log(`         nicheId=${result.nicheId}, confidence=${result.confidence}`)
    if (result.nicheId === 'finance' && result.confidence > 0.5) {
      record('3.1', 'Niche detection', 'PASS', `niche=${result.nicheId}, confidence=${result.confidence}`)
    } else {
      record('3.1', 'Niche detection', 'FAIL', undefined,
        `Expected nicheId=finance confidence>0.5, got nicheId=${result.nicheId} confidence=${result.confidence}`)
    }
  } catch (e: unknown) {
    record('3.1', 'Niche detection', 'FAIL', undefined, String(e))
  }

  // 3.2 — Gap scorer with real DB data
  const step32Start = Date.now()
  let competitorMetrics: CompetitorMetrics[] = []
  try {
    competitorMetrics = await getCompetitorMetricsFromDB(SEEDED_USER_ID)

    if (competitorMetrics.length === 0) {
      record('3.2', 'Gap scorer with real data', 'FAIL', undefined,
        'No competitor metrics in DB — run seed-test-data.ts first')
    } else {
      const userMetrics: UserMetrics = {
        avgViewsPerVideo: 8400,
        ctr: 0.021,
        avgViewDurationSeconds: 420,
        uploadsPerMonth: 2,
        subscriberCount: 45000,
        nicheId: 'finance',
        recentVideoTitles: [
          'How I Invested My First $1000',
          'Index Funds for Beginners',
          'My Stock Portfolio Revealed',
        ],
      }
      const result = calculateGapScore(userMetrics, competitorMetrics)
      const allScores = [
        result.breakdown.viewsGap.score,
        result.breakdown.ctrGap.score,
        result.breakdown.watchTimeGap.score,
        result.breakdown.uploadFrequencyGap.score,
      ]
      const allValid = allScores.every((s) => s >= 0 && s <= 100)

      console.log(`         overallScore=${result.overallScore}, bottleneck=${result.primaryBottleneck}`)
      console.log(`         revenueGap=$${result.revenueGap.gapMonthly.toFixed(0)}/month`)

      if (result.overallScore >= 1 && result.overallScore <= 100 && allValid) {
        record('3.2', 'Gap scorer with real data', 'PASS',
          `score=${result.overallScore}/100, bottleneck=${result.primaryBottleneck}`)
      } else {
        record('3.2', 'Gap scorer with real data', 'FAIL', undefined,
          `Invalid result: overall=${result.overallScore}, scores=${allScores.join(',')}`)
      }
    }
  } catch (e: unknown) {
    record('3.2', 'Gap scorer with real data', 'FAIL', undefined, String(e))
  }
  const step32Time = Date.now() - step32Start

  // 3.3 — Revenue benchmarks
  try {
    const benchmarks = getNicheBenchmarks()
    const nicheCount = Object.keys(benchmarks).length
    const tier = getSubscriberTier(45000)
    const potential = calculateRevenuePotential('finance', 45000, 8400, 2)

    console.log(`         ${nicheCount} niches loaded, tier=${tier}`)
    console.log(`         current=$${potential.currentMonthlyEstimate.toFixed(0)}/mo, benchmark=$${potential.benchmarkMonthlyEstimate.toFixed(0)}/mo, gap=$${potential.gapMonthly.toFixed(0)}/mo`)

    const allOk = (
      nicheCount === 12 &&
      tier === 'tier2' &&
      potential.currentMonthlyEstimate >= 50 &&
      potential.currentMonthlyEstimate <= 300 &&
      potential.benchmarkMonthlyEstimate >= 300 &&
      potential.benchmarkMonthlyEstimate <= 800 &&
      potential.gapMonthly > 0
    )

    if (allOk) {
      record('3.3', 'Revenue benchmarks', 'PASS',
        `12 niches, tier=${tier}, gap=$${potential.gapMonthly.toFixed(0)}/mo`)
    } else {
      const issues = []
      if (nicheCount !== 12) issues.push(`niches=${nicheCount}`)
      if (tier !== 'tier2') issues.push(`tier=${tier}`)
      if (potential.currentMonthlyEstimate < 50 || potential.currentMonthlyEstimate > 300)
        issues.push(`current=$${potential.currentMonthlyEstimate}`)
      if (potential.benchmarkMonthlyEstimate < 300 || potential.benchmarkMonthlyEstimate > 800)
        issues.push(`benchmark=$${potential.benchmarkMonthlyEstimate}`)
      if (potential.gapMonthly <= 0) issues.push(`gapMonthly=${potential.gapMonthly}`)
      record('3.3', 'Revenue benchmarks', 'FAIL', undefined, issues.join(', '))
    }
  } catch (e: unknown) {
    record('3.3', 'Revenue benchmarks', 'FAIL', undefined, String(e))
  }

  // 3.4 — detectViralVideos
  try {
    const supabase = createServiceClient()
    const { data: competitors } = await supabase
      .from('competitors')
      .select('id')
      .eq('user_id', SEEDED_USER_ID)
      .eq('is_active', true)

    const competitorIds = (competitors ?? []).map((c: { id: string }) => c.id)
    const viral = await detectViralVideos(competitorIds)
    console.log(`         ${viral.length} viral video(s) detected`)
    record('3.4', 'Viral video detection', 'PASS', `${viral.length} viral video(s) found (0 is valid)`)
  } catch (e: unknown) {
    record('3.4', 'Viral video detection', 'FAIL', undefined, String(e))
  }

  // 3.5 — findUncoveredTopics
  const step35Start = Date.now()
  try {
    const userTitles = [
      'How to Save Money', 'Budget for Beginners',
      'Emergency Fund Guide', 'Index Fund Investing',
    ]
    const competitorTitles = [
      'Passive Income Ideas', 'Real Estate Investing',
      'Stock Market Crash Explained', 'High Yield Savings',
      'Salary Negotiation Tips', 'Tax Loss Harvesting',
      'Dividend Investing Strategy', 'FIRE Movement Guide',
    ]
    const topics = await findUncoveredTopics(userTitles, competitorTitles)
    console.log(`         ${topics.length} uncovered topics returned`)
    for (const t of topics.slice(0, 3)) {
      console.log(`           • ${t.topic} [${t.searchDemandEstimate}]`)
    }

    if (
      topics.length >= 2 &&
      topics.every((t) => t.suggestedAngle && t.searchDemandEstimate)
    ) {
      record('3.5', 'Uncovered topics', 'PASS', `${topics.length} topics returned`)
    } else {
      record('3.5', 'Uncovered topics', 'FAIL', undefined,
        `Expected ≥2 topics with fields, got ${topics.length}`)
    }
  } catch (e: unknown) {
    record('3.5', 'Uncovered topics', 'FAIL', undefined, String(e))
  }
  const step35Time = Date.now() - step35Start

  // 3.6 + 3.7 — generateDigest and generateVideoIdeas in parallel (mirrors production cron)
  const step3637Start = Date.now()

  const [settled36, settled37] = await Promise.allSettled([
    generateDigest(SEEDED_USER_ID),
    generateVideoIdeas(SEEDED_USER_ID),
  ])

  const step3637WallMs = Date.now() - step3637Start

  // 3.6 — digest result
  if (settled36.status === 'fulfilled') {
    const result: DigestResult = settled36.value
    console.log(`         digest generated in ${step3637WallMs}ms wall time (parallel)`)
    console.log(`         thisWeek: "${result.sections.thisWeek.slice(0, 150)}…"`)

    const allSections = [
      result.sections.thisWeek,
      result.sections.competitorMoves,
      result.sections.videoIdeas,
      result.sections.oneChange,
    ]
    const allNonEmpty = allSections.every((s) => s && s.length > 0)
    const digestCost = 0.015
    totalApiCost += digestCost

    if (allNonEmpty) {
      record('3.6', 'Digest generation', 'PASS', `${step3637WallMs}ms wall (parallel w/ ideas), ~$${digestCost.toFixed(4)}`)
    } else {
      const empty = ['thisWeek','competitorMoves','videoIdeas','oneChange'].filter((_, i) => !allSections[i])
      record('3.6', 'Digest generation', 'FAIL', undefined, `Empty sections: ${empty.join(', ')}`)
    }
  } else {
    record('3.6', 'Digest generation', 'FAIL', undefined, String(settled36.reason))
  }

  // 3.7 — ideas result
  if (settled37.status === 'fulfilled') {
    const result: IdeaResult = settled37.value
    console.log(`         ${result.ideas.length} idea(s) generated in ${step3637WallMs}ms wall time (parallel)`)
    for (const idea of result.ideas) {
      console.log(`           #${idea.rank} [${idea.score}] ${idea.title}`)
    }

    const ideaCost = result.costUsd ?? 0.011
    totalApiCost += ideaCost

    const allValid =
      result.ideas.length === 3 &&
      result.ideas.every((idea) => idea.score > 0 && idea.title.length > 0)

    if (allValid) {
      record('3.7', 'Idea generation', 'PASS', `${result.ideas.length} ideas, ~$${ideaCost.toFixed(4)}`)
    } else {
      record('3.7', 'Idea generation', 'FAIL', undefined,
        `Expected 3 valid ideas, got ${result.ideas.length}: ${result.ideas.map((i) => `"${i.title}"(${i.score})`).join(', ')}`)
    }
  } else {
    record('3.7', 'Idea generation', 'FAIL', undefined, String(settled37.reason))
  }

  // 3.8 — Full pipeline timing (3.6+3.7 now counted as one parallel wall-clock slot)
  const pipelineTotalMs = step32Time + step35Time + step3637WallMs
  console.log(`\n         Pipeline timing:`)
  console.log(`           3.2 gap scorer:      ${step32Time}ms`)
  console.log(`           3.5 uncov topics:    ${step35Time}ms`)
  console.log(`           3.6+3.7 parallel:    ${step3637WallMs}ms  (digest + ideas ran simultaneously)`)
  console.log(`           Total:               ${pipelineTotalMs}ms`)

  if (pipelineTotalMs <= 30000) {
    record('3.8', 'Full pipeline timing', 'PASS', `${pipelineTotalMs}ms total (under 30s)`)
  } else if (pipelineTotalMs <= 60000) {
    record('3.8', 'Full pipeline timing', 'WARN', `${pipelineTotalMs}ms total — slow but under 60s`)
  } else {
    record('3.8', 'Full pipeline timing', 'FAIL', undefined, `${pipelineTotalMs}ms total — exceeds 60s limit`)
  }
}

// ─── PHASE 4 — EMAIL AND COMMUNICATION ───────────────────────────────────────

async function runPhase4() {
  banner('PHASE 4 — EMAIL AND COMMUNICATION')

  // 4.1 — generateUnsubscribeToken
  try {
    const token = await generateUnsubscribeToken(SEEDED_USER_ID)
    const supabase = createServiceClient()
    const { data } = await supabase
      .from('user_settings')
      .select('unsubscribe_token')
      .eq('user_id', SEEDED_USER_ID)
      .single()

    if (token && token.length > 0 && data?.unsubscribe_token === token) {
      console.log(`         token: ${token.slice(0, 8)}…`)
      record('4.1', 'Generate unsubscribe token', 'PASS', `token starts: ${token.slice(0, 8)}…`)
    } else {
      record('4.1', 'Generate unsubscribe token', 'FAIL', undefined,
        `token="${token}", db_token="${data?.unsubscribe_token}"`)
    }
  } catch (e: unknown) {
    record('4.1', 'Generate unsubscribe token', 'FAIL', undefined, String(e))
  }

  // 4.2 — sendWeeklyDigest
  try {
    const fakeDigest: DigestResult = {
      userId: SEEDED_USER_ID,
      generatedAt: new Date().toISOString(),
      overallGapScore: 58,
      sections: {
        thisWeek: 'Your channel pulled in 8,400 avg views this week, which is 62% behind where Finance With Sarah sits. Subscriber momentum is holding steady at +275 net new subscribers.',
        competitorMoves: 'Finance With Sarah posted "How I Made $50K in Dividends" — it hit 48,000 views in 48 hours, which is 3.2x her channel average. That thumbnail angle is working.',
        videoIdeas: '1. **How I Finally Understood Tax-Loss Harvesting** — everyone covers it but nobody explains it simply\n2. **Dividend Portfolio Q2 Update** — your audience wants transparency\n3. **The $500/Month Passive Income Blueprint** — high search demand, low competition',
        oneChange: 'Post on Mondays. Your top 3 performing videos all went up on Monday — your audience is engaged at the start of the week and that is when the algorithm rewards you.',
      },
      rawMarkdown: '## YOUR WEEK\nTest digest content',
      videoIdeasParsed: [
        { title: 'How I Finally Understood Tax-Loss Harvesting', opportunityScore: 85, reasoning: 'High search demand, low competition' },
        { title: 'Dividend Portfolio Q2 Update', opportunityScore: 72, reasoning: 'Audience wants transparency' },
        { title: 'The $500/Month Passive Income Blueprint', opportunityScore: 68, reasoning: 'High search demand' },
      ],
    }

    console.log(`         Sending real email to seeded user's Gmail…`)
    const ok = await sendWeeklyDigest(SEEDED_USER_ID, fakeDigest)
    totalApiCost += 0.001  // Resend cost

    if (ok) {
      record('4.2', 'Send weekly digest email', 'PASS', 'email sent successfully (check Gmail)')
    } else {
      record('4.2', 'Send weekly digest email', 'FAIL', undefined, 'sendWeeklyDigest returned false')
    }
  } catch (e: unknown) {
    record('4.2', 'Send weekly digest email', 'FAIL', undefined, String(e))
  }

  // 4.3 — sendTrendAlert
  try {
    const fakeViralVideo: ViralVideo = {
      videoId: 'test_viral_abc123',
      title: 'I Turned $1,000 Into $10,000 in 6 Months (Here\'s Exactly How)',
      channelId: 'UC_finance_with_sarah',
      channelName: 'Finance With Sarah',
      viewCount: 48200,
      velocityScore: 1004,
      publishedAt: new Date(Date.now() - 36 * 60 * 60 * 1000).toISOString(),
      thumbnailUrl: '',
      performanceVsAvg: 3.2,
    }

    console.log(`         Sending real trend alert email…`)
    const ok = await sendTrendAlert(
      SEEDED_USER_ID,
      fakeViralVideo,
      'Create a video comparing index funds vs real estate — your audience is asking this exact question',
    )
    totalApiCost += 0.001

    if (ok) {
      record('4.3', 'Send trend alert email', 'PASS', 'alert sent (check Gmail) — or skipped if already alerted today')
    } else {
      record('4.3', 'Send trend alert email', 'FAIL', undefined, 'sendTrendAlert returned false')
    }
  } catch (e: unknown) {
    record('4.3', 'Send trend alert email', 'FAIL', undefined, String(e))
  }

  // 4.4 — checkAndSendAlerts
  try {
    const result = await checkAndSendAlerts()
    console.log(`         checkAndSendAlerts: { checked: ${result.checked}, sent: ${result.sent} }`)
    if (typeof result.checked === 'number' && typeof result.sent === 'number') {
      record('4.4', 'Check and send alerts', 'PASS', `checked=${result.checked}, sent=${result.sent}`)
    } else {
      record('4.4', 'Check and send alerts', 'FAIL', undefined,
        `unexpected result shape: ${JSON.stringify(result)}`)
    }
  } catch (e: unknown) {
    record('4.4', 'Check and send alerts', 'FAIL', undefined, String(e))
  }
}

// ─── PHASE 5 — PAYMENT AND ACCESS CONTROL ────────────────────────────────────

async function runPhase5() {
  banner('PHASE 5 — PAYMENT AND ACCESS CONTROL')

  // Ensure seeded user is on free plan to start
  await updateUserSubscription(SEEDED_USER_ID, {
    subscription_status: 'free',
    subscription_plan: 'free',
    trial_ends_at: null,
  })

  // 5.1 — canAccess for free user
  try {
    const results51 = await Promise.all([
      canAccess(SEEDED_USER_ID, 'digest:weekly'),
      canAccess(SEEDED_USER_ID, 'alerts:daily'),
      canAccess(SEEDED_USER_ID, 'search:compare'),
    ])
    const [digestWeekly, alertsDaily, searchCompare] = results51
    console.log(`         canAccess free: digest:weekly=${digestWeekly}, alerts:daily=${alertsDaily}, search:compare=${searchCompare}`)

    if (!digestWeekly && !alertsDaily && !searchCompare) {
      record('5.1', 'canAccess — free user', 'PASS', 'all 3 gated features correctly blocked')
    } else {
      const wrong = []
      if (digestWeekly) wrong.push('digest:weekly should be false')
      if (alertsDaily) wrong.push('alerts:daily should be false')
      if (searchCompare) wrong.push('search:compare should be false')
      record('5.1', 'canAccess — free user', 'FAIL', undefined, wrong.join(', '))
    }
  } catch (e: unknown) {
    record('5.1', 'canAccess — free user', 'FAIL', undefined, String(e))
  }

  // 5.2 — Limit functions for free user
  try {
    const [compLimit, ideaLimit, viralLimit, topicLimit, archiveWeeks] = await Promise.all([
      getCompetitorLimit(SEEDED_USER_ID),
      getIdeaLimit(SEEDED_USER_ID),
      getViralLimit(SEEDED_USER_ID),
      getTopicLimit(SEEDED_USER_ID),
      getArchiveWeeks(SEEDED_USER_ID),
    ])
    console.log(`         free limits: competitors=${compLimit}, ideas=${ideaLimit}, viral=${viralLimit}, topics=${topicLimit}, archive=${archiveWeeks}`)

    const allMatch = (
      compLimit === 3 &&
      ideaLimit === 3 &&
      viralLimit === 3 &&
      topicLimit === 3 &&
      archiveWeeks === 4
    )

    if (allMatch) {
      record('5.2', 'Limit functions — free user', 'PASS', `comp=3, ideas=3, viral=3, topics=3, archive=4`)
    } else {
      record('5.2', 'Limit functions — free user', 'FAIL', undefined,
        `got comp=${compLimit}, ideas=${ideaLimit}, viral=${viralLimit}, topics=${topicLimit}, archive=${archiveWeeks}`)
    }
  } catch (e: unknown) {
    record('5.2', 'Limit functions — free user', 'FAIL', undefined, String(e))
  }

  // 5.3 — Upgrade to pro and retest
  try {
    await updateUserSubscription(SEEDED_USER_ID, {
      subscription_status: 'active',
      subscription_plan: 'pro',
    })

    const [digestWeekly, searchCompare, compLimit, ideaLimit, viralLimit] = await Promise.all([
      canAccess(SEEDED_USER_ID, 'digest:weekly'),
      canAccess(SEEDED_USER_ID, 'search:compare'),
      getCompetitorLimit(SEEDED_USER_ID),
      getIdeaLimit(SEEDED_USER_ID),
      getViralLimit(SEEDED_USER_ID),
    ])
    console.log(`         pro: digest:weekly=${digestWeekly}, search:compare=${searchCompare}, comp=${compLimit}, ideas=${ideaLimit}, viral=${viralLimit}`)

    const allMatch = (
      digestWeekly === true &&
      searchCompare === true &&
      compLimit === 10 &&
      ideaLimit === 6 &&
      viralLimit === 10
    )

    if (allMatch) {
      record('5.3', 'canAccess — pro user', 'PASS', 'all pro features unlocked correctly')
    } else {
      const issues = []
      if (!digestWeekly) issues.push('digest:weekly should be true')
      if (!searchCompare) issues.push('search:compare should be true')
      if (compLimit !== 10) issues.push(`competitors=${compLimit} expected 10`)
      if (ideaLimit !== 6) issues.push(`ideas=${ideaLimit} expected 6`)
      if (viralLimit !== 10) issues.push(`viral=${viralLimit} expected 10`)
      record('5.3', 'canAccess — pro user', 'FAIL', undefined, issues.join(', '))
    }
  } catch (e: unknown) {
    record('5.3', 'canAccess — pro user', 'FAIL', undefined, String(e))
  }

  // 5.4 — Trial expiry logic
  try {
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
    await updateUserSubscription(SEEDED_USER_ID, {
      subscription_status: 'on_trial',
      subscription_plan: 'pro',
      trial_ends_at: yesterday,
    })

    const searchCompare = await canAccess(SEEDED_USER_ID, 'search:compare')
    console.log(`         expired trial search:compare=${searchCompare} (expect false)`)

    if (searchCompare === false) {
      record('5.4', 'Trial expiry logic', 'PASS', 'expired trial correctly denied pro feature')
    } else {
      record('5.4', 'Trial expiry logic', 'FAIL', undefined,
        'search:compare returned true despite expired trial — expiry logic is broken')
    }
  } catch (e: unknown) {
    record('5.4', 'Trial expiry logic', 'FAIL', undefined, String(e))
  }

  // 5.5 — Reset user back to free (CRITICAL — always runs)
  try {
    const ok = await updateUserSubscription(SEEDED_USER_ID, {
      subscription_status: 'free',
      subscription_plan: 'free',
      trial_ends_at: null,
    })
    const user = await getUser(SEEDED_USER_ID)
    if (ok && user?.subscription_plan === 'free' && user?.subscription_status === 'free') {
      record('5.5', 'Reset user to free', 'PASS', 'seeded user restored to free plan')
    } else {
      record('5.5', 'Reset user to free', 'FAIL', undefined,
        `plan=${user?.subscription_plan}, status=${user?.subscription_status}`)
    }
  } catch (e: unknown) {
    record('5.5', 'Reset user to free', 'FAIL', undefined, String(e))
  }

  // 5.6 — getUpgradeMessage
  try {
    const msg = getUpgradeMessage('search:compare')
    const hasUpgradeLanguage = /upgrade|unlock|get|pro/i.test(msg)
    const hasNegativeLanguage = /you cannot|not allowed|forbidden/i.test(msg)
    console.log(`         upgrade message: "${msg.slice(0, 80)}…"`)

    if (msg.length > 0 && hasUpgradeLanguage && !hasNegativeLanguage) {
      record('5.6', 'getUpgradeMessage', 'PASS', 'friendly upgrade message returned')
    } else {
      const issues = []
      if (msg.length === 0) issues.push('empty string')
      if (!hasUpgradeLanguage) issues.push('no upgrade language')
      if (hasNegativeLanguage) issues.push('contains forbidden "you cannot"/"not allowed" language')
      record('5.6', 'getUpgradeMessage', 'FAIL', undefined, issues.join(', '))
    }
  } catch (e: unknown) {
    record('5.6', 'getUpgradeMessage', 'FAIL', undefined, String(e))
  }

  // 5.7 — Lemon Squeezy API connectivity
  try {
    const lsKey = process.env.LEMONSQUEEZY_API_KEY
    const lsStoreId = process.env.LEMONSQUEEZY_STORE_ID

    if (!lsKey) {
      record('5.7', 'Lemon Squeezy API', 'FAIL', undefined, 'LEMONSQUEEZY_API_KEY not set')
    } else {
      const url = `https://api.lemonsqueezy.com/v1/products?filter[store_id]=${lsStoreId ?? ''}`
      const response = await fetch(url, {
        headers: {
          Authorization: `Bearer ${lsKey}`,
          Accept: 'application/vnd.api+json',
        },
      })

      if (response.ok) {
        const json = await response.json() as { data?: unknown[] }
        const productCount = Array.isArray(json.data) ? json.data.length : 0
        console.log(`         LS API: ${productCount} product(s) found`)
        record('5.7', 'Lemon Squeezy API', 'PASS', `${productCount} product(s) in store`)
      } else if (response.status === 401) {
        record('5.7', 'Lemon Squeezy API', 'FAIL', undefined, 'HTTP 401 — API key is invalid')
      } else {
        record('5.7', 'Lemon Squeezy API', 'FAIL', undefined, `HTTP ${response.status}`)
      }
    }
  } catch (e: unknown) {
    record('5.7', 'Lemon Squeezy API', 'FAIL', undefined, String(e))
  }

  // 5.8 — Webhook signature verification
  try {
    const webhookSecret = process.env.LEMONSQUEEZY_WEBHOOK_SECRET
    if (!webhookSecret) {
      record('5.8', 'Webhook signature verification', 'SKIP', 'LEMONSQUEEZY_WEBHOOK_SECRET not set')
      return
    }

    // Try to connect to dev server first
    const devServerUrl = 'http://localhost:3000'
    let devServerRunning = false

    try {
      const healthCheck = await fetch(`${devServerUrl}/api/auth/session`, { signal: AbortSignal.timeout(2000) })
      devServerRunning = healthCheck.status < 500
    } catch {
      devServerRunning = false
    }

    if (!devServerRunning) {
      record('5.8', 'Webhook signature verification', 'SKIP',
        'dev server not running — start with npm run dev to test this')
      return
    }

    const fakePayload = JSON.stringify({
      meta: { event_name: 'subscription_created', custom_data: { user_id: SEEDED_USER_ID } },
      data: { id: 'test_sub_webhook', attributes: { status: 'active', variant_id: '99999',
        customer_id: 'test_cust_webhook', renews_at: null, ends_at: null } },
    })

    // Correct signature
    const correctSig = crypto
      .createHmac('sha256', webhookSecret)
      .update(fakePayload)
      .digest('hex')

    const correctResp = await fetch(`${devServerUrl}/api/webhooks/lemonsqueezy`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Signature': correctSig },
      body: fakePayload,
    })

    // Wrong signature
    const wrongResp = await fetch(`${devServerUrl}/api/webhooks/lemonsqueezy`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Signature': 'bad_signature_here' },
      body: fakePayload,
    })

    console.log(`         correct sig → HTTP ${correctResp.status}, wrong sig → HTTP ${wrongResp.status}`)

    if (correctResp.status === 200 && wrongResp.status === 401) {
      record('5.8', 'Webhook signature verification', 'PASS',
        `correct=200, wrong=401 — HMAC verification working`)
    } else {
      record('5.8', 'Webhook signature verification', 'FAIL', undefined,
        `expected correct=200 wrong=401, got correct=${correctResp.status} wrong=${wrongResp.status}`)
    }
  } catch (e: unknown) {
    record('5.8', 'Webhook signature verification', 'FAIL', undefined, String(e))
  }
}

// ─── FINAL REPORT ─────────────────────────────────────────────────────────────

function printReport() {
  const totalTime = Math.round((Date.now() - startTime) / 1000)
  const today = new Date().toISOString().slice(0, 10)

  const passed  = results.filter((r) => r.status === 'PASS').length
  const failed  = results.filter((r) => r.status === 'FAIL').length
  const warned  = results.filter((r) => r.status === 'WARN').length
  const skipped = results.filter((r) => r.status === 'SKIP').length
  const total   = results.length

  // Cost projections
  const weeklyAt100 = totalApiCost * 100

  console.log('\n')
  console.log('╔══════════════════════════════════════════════════════════════╗')
  console.log(`║      SHOWSTENCIL BACKEND TEST SUITE — ${today}         ║`)
  console.log('╚══════════════════════════════════════════════════════════════╝')

  function line(id: string, name: string, status: TestStatus) {
    const icon = status === 'PASS' ? '✅ PASS' : status === 'FAIL' ? '❌ FAIL' : status === 'WARN' ? '⚠️  WARN' : '⏭️  SKIP'
    const label = `  ${id.padEnd(5)} ${name.padEnd(38)}`
    console.log(`${label} ${icon}`)
  }

  function findResult(id: string) {
    return results.find((r) => r.id === id)
  }

  console.log('\nPHASE 1 — ENVIRONMENT')
  line('1.1', 'All env vars present', findResult('1.1')?.status ?? 'SKIP')

  console.log('\nPHASE 2 — DATABASE')
  for (const id of ['2.1','2.2','2.3','2.4','2.5','2.6','2.7','2.8','2.9','2.10','2.11','2.12','2.13','2.14']) {
    const r = findResult(id)
    const names: Record<string, string> = {
      '2.1':  'Supabase connection',
      '2.2':  'All tables exist',
      '2.3':  'Users table schema',
      '2.4':  'Create temp user',
      '2.5':  'Save channel snapshot',
      '2.6':  'Save video data',
      '2.7':  'Get channel snapshots',
      '2.8':  'Get videos',
      '2.9':  'User settings upsert',
      '2.10': 'Update onboarding status',
      '2.11': 'Update subscription',
      '2.12': 'Get user by LS customer ID',
      '2.13': 'Get user by LS subscription ID',
      '2.14': 'Delete temp user and cleanup',
    }
    line(id, names[id] ?? id, r?.status ?? 'SKIP')
  }

  console.log('\nPHASE 3 — INTELLIGENCE PIPELINE')
  for (const id of ['3.1','3.2','3.3','3.4','3.5','3.6','3.7','3.8']) {
    const r = findResult(id)
    const names: Record<string, string> = {
      '3.1': 'Niche detection',
      '3.2': 'Gap scorer with real data',
      '3.3': 'Revenue benchmarks',
      '3.4': 'Viral video detection',
      '3.5': 'Uncovered topics',
      '3.6': 'Digest generation',
      '3.7': 'Idea generation',
      '3.8': 'Full pipeline timing',
    }
    line(id, names[id] ?? id, r?.status ?? 'SKIP')
  }

  console.log('\nPHASE 4 — EMAIL')
  for (const id of ['4.1','4.2','4.3','4.4']) {
    const r = findResult(id)
    const names: Record<string, string> = {
      '4.1': 'Generate unsubscribe token',
      '4.2': 'Send weekly digest email',
      '4.3': 'Send trend alert email',
      '4.4': 'Check and send alerts',
    }
    line(id, names[id] ?? id, r?.status ?? 'SKIP')
  }

  console.log('\nPHASE 5 — PAYMENTS AND ACCESS')
  for (const id of ['5.1','5.2','5.3','5.4','5.5','5.6','5.7','5.8']) {
    const r = findResult(id)
    const names: Record<string, string> = {
      '5.1': 'canAccess — free user',
      '5.2': 'Limit functions — free user',
      '5.3': 'canAccess — pro user',
      '5.4': 'Trial expiry logic',
      '5.5': 'Reset user to free',
      '5.6': 'getUpgradeMessage',
      '5.7': 'Lemon Squeezy API',
      '5.8': 'Webhook signature verification',
    }
    line(id, names[id] ?? id, r?.status ?? 'SKIP')
  }

  console.log('\n' + '═'.repeat(64))
  console.log('SUMMARY')
  console.log('═'.repeat(64))
  console.log(`Total tests:    ${total}`)
  console.log(`Passed:         ${passed}`)
  console.log(`Failed:         ${failed}`)
  console.log(`Warnings:       ${warned}`)
  console.log(`Skipped:        ${skipped}`)
  console.log()
  console.log(`Total time:     ${totalTime}s`)
  console.log(`Total API cost: $${totalApiCost.toFixed(4)} (Anthropic + Resend)`)
  console.log(`Weekly cost at 100 users: $${weeklyAt100.toFixed(2)}`)

  const failedTests = results.filter((r) => r.status === 'FAIL')
  if (failedTests.length > 0) {
    console.log('\nFAILED TESTS:')
    for (const r of failedTests) {
      console.log(`  ❌  ${r.id} — ${r.error ?? r.message ?? 'no details'}`)
    }

    console.log('\nNEXT STEPS:')
    const fileMap: Record<string, string> = {
      '1.':  '.env.local — add the missing variables',
      '2.1': 'lib/supabase.ts — check NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY',
      '2.2': 'Supabase SQL editor — run the CREATE TABLE statements from CLAUDE.md',
      '2.3': 'Supabase SQL editor — run the ALTER TABLE migrations from CLAUDE.md',
      '2.4': 'lib/db.ts + Supabase RLS — check users table insert policy',
      '2.5': 'lib/db.ts:saveChannelSnapshot — check the insert logic',
      '2.6': 'lib/db.ts:saveVideoData — check the merge and insert logic',
      '2.7': 'lib/db.ts:getChannelSnapshots — check the date filter',
      '2.8': 'lib/db.ts:getVideos — check the query',
      '2.9': 'lib/db.ts:upsertUserSettings — check onConflict clause',
      '2.10': 'lib/db.ts:updateUserOnboardingStatus',
      '2.11': 'lib/db.ts:updateUserSubscription',
      '2.12': 'lib/db.ts:getUserByLSCustomerId — check column name lemon_squeezy_customer_id',
      '2.13': 'lib/db.ts:getUserByLSSubscriptionId — check column name lemon_squeezy_subscription_id',
      '2.14': 'Supabase dashboard — manually delete user test-automated@showstencil-test.com',
      '3.1': 'lib/niche-engine.ts:detectNiche — check ANTHROPIC_API_KEY and prompt',
      '3.2': 'lib/gap-scorer.ts:calculateGapScore + scripts/seed-test-data.ts (re-run seeder)',
      '3.3': 'lib/revenue-benchmarks.ts — check niche IDs and calculation logic',
      '3.4': 'lib/trend-detector.ts:detectViralVideos — check is_viral column in competitor_videos',
      '3.5': 'lib/trend-detector.ts:findUncoveredTopics — check Claude response parsing',
      '3.6': 'lib/digest-generator.ts:generateDigest — check ANTHROPIC_API_KEY and DB data',
      '3.7': 'lib/idea-generator.ts:generateVideoIdeas — check Claude prompt and parsing',
      '3.8': 'Consider parallelising steps 3.5, 3.6, 3.7 in production',
      '4.1': 'lib/email.ts:generateUnsubscribeToken — check user_settings.unsubscribe_token column',
      '4.2': 'lib/email.ts:sendWeeklyDigest — check RESEND_API_KEY and RESEND_FROM_EMAIL',
      '4.3': 'lib/email.ts:sendTrendAlert — check Resend sending domain',
      '4.4': 'lib/email.ts:checkAndSendAlerts — check subscription_status filter',
      '5.1': 'lib/access.ts:canAccess — check FEATURE_GATES and getUserPlan',
      '5.2': 'lib/access.ts — check limit helper functions for free tier',
      '5.3': 'lib/access.ts — check pro tier logic in canAccess and limit helpers',
      '5.4': 'lib/access.ts:getUserPlan — check trial expiry date comparison logic',
      '5.5': 'lib/db.ts:updateUserSubscription — critical cleanup failed',
      '5.6': 'lib/access.ts:getUpgradeMessage — check message text',
      '5.7': '.env.local — check LEMONSQUEEZY_API_KEY and LEMONSQUEEZY_STORE_ID',
      '5.8': 'app/api/webhooks/lemonsqueezy/route.ts — check HMAC verification',
    }

    for (const r of failedTests) {
      const prefix = r.id.slice(0, 2)
      const file = fileMap[r.id] ?? fileMap[prefix] ?? `search codebase for test ${r.id}`
      console.log(`  • ${r.id}: ${file}`)
    }
  }

  console.log('\n' + '═'.repeat(64))
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n🚀 SHOWSTENCIL BACKEND TEST SUITE STARTING…\n')
  console.log(`   Seeded user ID: ${SEEDED_USER_ID}`)
  console.log(`   Timestamp:      ${new Date().toISOString()}`)

  await runPhase1()
  await runPhase2()
  await runPhase3()
  await runPhase4()
  await runPhase5()

  printReport()
}

main().catch((err) => {
  console.error('\n💥 Test runner crashed unexpectedly:', err)
  process.exit(1)
})
