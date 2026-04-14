/**
 * scripts/test-full-pipeline.ts
 * End-to-end intelligence pipeline timing test for a single user.
 *
 * Runs all 7 pipeline steps in sequence, times each one, and reports
 * overall performance + estimated cost.
 *
 * Run:
 *   npx tsx --env-file=.env.local scripts/test-full-pipeline.ts
 */

import { createServiceClient } from '@/lib/supabase';
import { getUser, getChannelSnapshots, getVideos, getCompetitorMetricsFromDB } from '@/lib/db';
import { calculateGapScore, saveGapScore } from '@/lib/gap-scorer';
import { detectViralVideos, findUncoveredTopics, getTrendingInNiche } from '@/lib/trend-detector';
import { generateDigest } from '@/lib/digest-generator';
import { generateVideoIdeas } from '@/lib/idea-generator';
import { calculateRevenuePotential, getBenchmarkComparison, getNicheBenchmarks } from '@/lib/revenue-benchmarks';

// ─── Config ──────────────────────────────────────────────────────────────────

const USER_ID = '848f7497-9a46-40a3-8d90-a96d1c9cf909';
const SLOW_STEP_THRESHOLD_MS = 10_000;
const PIPELINE_TARGET_MS = 30_000;

// Claude Sonnet 4.6 pricing
const COST_PER_INPUT_TOKEN = 3 / 1_000_000;
const COST_PER_OUTPUT_TOKEN = 15 / 1_000_000;

// ─── Timing helpers ──────────────────────────────────────────────────────────

function pad(label: string, width = 32): string {
  return label.padEnd(width, ' ');
}

function fmtMs(ms: number): string {
  return `${ms.toLocaleString()}ms`;
}

function warn(stepNum: number, ms: number): void {
  console.log(`  ⚠  WARNING: Step ${stepNum} is slow (${fmtMs(ms)}) — consider caching`);
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function runPipeline(): Promise<void> {
  console.log('\n=== FULL PIPELINE TEST ===\n');

  const supabase = createServiceClient();
  const timings: number[] = [];
  const pipelineStart = Date.now();

  // Track cumulative Claude token usage across steps that call the API
  let totalInputTokens = 0;
  let totalOutputTokens = 0;

  // ─── Step 1 — Data sync check ─────────────────────────────────────────────
  // Verifies the user has a recent channel snapshot and competitor data in DB.
  // Does NOT call any external APIs — pure DB reads.

  const t1Start = Date.now();

  const [user, snapshots, videos, competitorMetrics] = await Promise.all([
    getUser(USER_ID),
    getChannelSnapshots(USER_ID, 30),
    getVideos(USER_ID, 10),
    getCompetitorMetricsFromDB(USER_ID),
  ]);

  const { data: competitorRows } = await supabase
    .from('competitors')
    .select('id')
    .eq('user_id', USER_ID)
    .eq('is_active', true);

  const competitorIds = (competitorRows ?? []).map((r: { id: string }) => r.id);

  const latestSnapshot = snapshots[snapshots.length - 1];
  const t1 = Date.now() - t1Start;
  timings.push(t1);

  console.log(`${pad('Step 1 — Data sync check:')}${fmtMs(t1)}`);
  if (t1 > SLOW_STEP_THRESHOLD_MS) warn(1, t1);

  if (!user) {
    console.error(`\nFATAL: User ${USER_ID} not found in DB. Aborting.`);
    process.exit(1);
  }
  if (!latestSnapshot) {
    console.warn('  NOTE: No channel snapshot found — gap score will use defaults');
  }
  if (competitorMetrics.length === 0) {
    console.warn('  NOTE: No competitor data in DB — run seed-test-data.ts first');
  }

  // ─── Step 2 — Gap score calculation ──────────────────────────────────────

  const t2Start = Date.now();

  let gapScore = null;
  let revenueGapMonthly = 0;
  let revenueGapAnnual = 0;

  if (latestSnapshot && competitorMetrics.length > 0) {
    const userMetrics = {
      avgViewsPerVideo: latestSnapshot.avg_views_per_video ?? 0,
      ctr: latestSnapshot.avg_ctr ?? 0,
      avgViewDurationSeconds: latestSnapshot.avg_view_duration_seconds ?? 360,
      uploadsPerMonth: 4,
      subscriberCount: latestSnapshot.subscriber_count ?? 0,
      nicheId: user.niche_id ?? 'finance',
      recentVideoTitles: videos.map((v) => v.title).filter((t): t is string => !!t),
    };

    gapScore = calculateGapScore(userMetrics, competitorMetrics);
    await saveGapScore(USER_ID, gapScore);
    revenueGapMonthly = gapScore.revenueGap.gapMonthly;
    revenueGapAnnual = gapScore.revenueGap.annualGap;
  }

  const t2 = Date.now() - t2Start;
  timings.push(t2);

  console.log(`${pad('Step 2 — Gap score calculation:')}${fmtMs(t2)}`);
  if (t2 > SLOW_STEP_THRESHOLD_MS) warn(2, t2);

  // ─── Step 3 — Trend detection ─────────────────────────────────────────────
  // Reads pre-flagged is_viral rows from competitor_videos — no YouTube API calls.

  const t3Start = Date.now();

  const viralVideos = competitorIds.length > 0
    ? await detectViralVideos(competitorIds)
    : [];

  const t3 = Date.now() - t3Start;
  timings.push(t3);

  console.log(`${pad('Step 3 — Trend detection:')}${fmtMs(t3)}`);
  if (t3 > SLOW_STEP_THRESHOLD_MS) warn(3, t3);

  // ─── Step 4 — Uncovered topics ────────────────────────────────────────────
  // Calls Claude to identify topic gaps between user and competitors.

  const t4Start = Date.now();

  const userVideoTitles = videos.map((v) => v.title).filter((t): t is string => !!t);

  const { data: competitorVideoRows } = await supabase
    .from('competitor_videos')
    .select('title')
    .in('competitor_id', competitorIds.length > 0 ? competitorIds : ['00000000-0000-0000-0000-000000000000'])
    .order('published_at', { ascending: false })
    .limit(60);

  const competitorVideoTitles = (competitorVideoRows ?? [])
    .map((v: { title: string | null }) => v.title)
    .filter((t): t is string => !!t);

  const uncoveredTopics =
    userVideoTitles.length > 0 && competitorVideoTitles.length > 0
      ? await findUncoveredTopics(userVideoTitles, competitorVideoTitles)
      : [];

  const t4 = Date.now() - t4Start;
  timings.push(t4);

  console.log(`${pad('Step 4 — Uncovered topics:')}${fmtMs(t4)}`);
  if (t4 > SLOW_STEP_THRESHOLD_MS) warn(4, t4);

  // Estimate uncovered-topics Claude tokens (~800 input, ~300 output based on prompt design)
  if (uncoveredTopics.length > 0) {
    totalInputTokens += 800;
    totalOutputTokens += 300;
  }

  // ─── Step 5 — Digest generation ───────────────────────────────────────────

  const t5Start = Date.now();

  let digestResult = null;
  try {
    digestResult = await generateDigest(USER_ID);
  } catch (err) {
    console.warn('  NOTE: Digest generation error (non-fatal):', (err as Error).message);
  }

  const t5 = Date.now() - t5Start;
  timings.push(t5);

  console.log(`${pad('Step 5 — Digest generation:')}${fmtMs(t5)}`);
  if (t5 > SLOW_STEP_THRESHOLD_MS) warn(5, t5);

  // ─── Step 6 — Idea generation ─────────────────────────────────────────────

  const t6Start = Date.now();

  let ideaResult = null;
  try {
    ideaResult = await generateVideoIdeas(USER_ID);
    if (ideaResult?.tokensUsed) {
      // idea-generator tracks total tokens — estimate 70/30 split
      totalInputTokens += Math.round(ideaResult.tokensUsed * 0.7);
      totalOutputTokens += Math.round(ideaResult.tokensUsed * 0.3);
    }
  } catch (err) {
    console.warn('  NOTE: Idea generation error (non-fatal):', (err as Error).message);
  }

  const t6 = Date.now() - t6Start;
  timings.push(t6);

  console.log(`${pad('Step 6 — Idea generation:')}${fmtMs(t6)}`);
  if (t6 > SLOW_STEP_THRESHOLD_MS) warn(6, t6);

  // ─── Step 7 — Revenue benchmarks ─────────────────────────────────────────
  // Pure computation — no DB or API calls.

  const t7Start = Date.now();

  const nicheId = user.niche_id ?? 'finance';
  const subscriberCount = latestSnapshot?.subscriber_count ?? 45_000;
  const avgViewsPerVideo = latestSnapshot?.avg_views_per_video ?? 8_400;
  const uploadsPerMonth = 4;

  const allBenchmarks = getNicheBenchmarks();
  const benchmarkExists = nicheId in allBenchmarks;

  let revenuePotential = null;
  let benchmarkComparison = null;

  if (benchmarkExists) {
    revenuePotential = calculateRevenuePotential(
      nicheId,
      subscriberCount,
      avgViewsPerVideo,
      uploadsPerMonth,
      latestSnapshot?.rpm ?? undefined,
    );

    benchmarkComparison = getBenchmarkComparison(nicheId, subscriberCount, {
      avgViewsPerVideo,
      uploadsPerMonth,
      avgViewDurationSeconds: latestSnapshot?.avg_view_duration_seconds ?? 480,
      ctr: latestSnapshot?.avg_ctr ?? 0.031,
    });
  }

  const t7 = Date.now() - t7Start;
  timings.push(t7);

  console.log(`${pad('Step 7 — Revenue benchmarks:')}${fmtMs(t7)}`);
  if (t7 > SLOW_STEP_THRESHOLD_MS) warn(7, t7);

  // ─── Summary ─────────────────────────────────────────────────────────────

  const totalMs = Date.now() - pipelineStart;
  const slowestStep = timings.reduce(
    (best, ms, idx) => (ms > best.ms ? { step: idx + 1, ms } : best),
    { step: 1, ms: timings[0] },
  );

  const costThisRun =
    totalInputTokens * COST_PER_INPUT_TOKEN + totalOutputTokens * COST_PER_OUTPUT_TOKEN;

  const revenueGapMonthlyFinal = revenueGapMonthly > 0
    ? revenueGapMonthly
    : revenuePotential?.gapMonthly ?? 0;

  const revenueGapAnnualFinal = revenueGapAnnual > 0
    ? revenueGapAnnual
    : revenuePotential?.gapAnnual ?? 0;

  console.log('─────────────────────────────────────────');
  console.log(`${pad('Total pipeline time:')}${fmtMs(totalMs)}`);
  console.log(`${pad('Target:')}under ${fmtMs(PIPELINE_TARGET_MS)}`);

  if (totalMs > PIPELINE_TARGET_MS) {
    console.log(`\nPIPELINE TOO SLOW: ${fmtMs(totalMs)} total. Optimization needed before launch.`);
  } else {
    console.log(`\nPipeline within target. (${fmtMs(PIPELINE_TARGET_MS - totalMs)} to spare)`);
  }

  console.log('');
  console.log(`${pad('Gap score:')}${gapScore?.overallScore ?? 'N/A'}/100`);
  console.log(`${pad('Ideas generated:')}${ideaResult?.ideas.length ?? 0}`);
  console.log(`${pad('Viral videos detected:')}${viralVideos.length}`);
  console.log(`${pad('Uncovered topics:')}${uncoveredTopics.length}`);
  console.log(`${pad('Revenue gap:')}$${revenueGapMonthlyFinal.toLocaleString()}/month ($${revenueGapAnnualFinal.toLocaleString()}/year)`);

  if (benchmarkComparison) {
    console.log(`${pad('Top benchmark insight:')}${benchmarkComparison.topInsight.slice(0, 100)}...`);
  }

  console.log('');
  console.log(`${pad('Total tokens used (est):')}${(totalInputTokens + totalOutputTokens).toLocaleString()} (${totalInputTokens.toLocaleString()} in / ${totalOutputTokens.toLocaleString()} out)`);
  console.log(`${pad('Cost this run:')}$${costThisRun.toFixed(5)}`);
  console.log(`${pad('At 100 users/week:')}$${(costThisRun * 100).toFixed(2)}`);

  console.log('');
  console.log(`Slowest step: Step ${slowestStep.step} (${fmtMs(slowestStep.ms)})`);

  console.log('\n=== PIPELINE TEST COMPLETE ===\n');
}

runPipeline().catch((err) => {
  console.error('\nPipeline test crashed:', err);
  process.exit(1);
});
