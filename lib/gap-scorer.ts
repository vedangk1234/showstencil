/**
 * lib/gap-scorer.ts
 * Core gap scoring algorithm — measures how far behind a creator is vs larger channels.
 *
 * Design decision: only compares against channels LARGER than the user.
 *   Tier 1: 1x–3x user's subscriber count  (most actionable)
 *   Tier 2: 3x–10x user's subscriber count (aspirational)
 *
 * Viral alerts are separate — they monitor ALL niche channels regardless of size.
 */

import { createServiceClient } from '@/lib/supabase';
import type { CompetitorFullProfile } from '@/lib/youtube-data';
import type {
  UserMetrics,
  CompetitorMetrics,
  MetricScore,
  RevenueEstimate,
  GapScoreResult,
} from '@/types';

// ---------------------------------------------------------------------------
// CPM benchmarks (USD, used for revenue estimation)
// ---------------------------------------------------------------------------

const NICHE_CPM: Record<string, number> = {
  finance: 18,
  business: 15,
  education: 12,
  tech: 10,
  beauty: 9,
  fitness: 8,
  cooking: 7,
  travel: 6,
  diy: 6,
  gaming: 4,
  entertainment: 3,
  vlog: 3,
};

const DEFAULT_CPM = 5;

// Watch time estimates per niche (seconds) — used when public data doesn't include duration
const NICHE_WATCH_DURATION: Record<string, number> = {
  finance: 720,
  education: 720,
  gaming: 480,
};
const DEFAULT_WATCH_DURATION = 360;

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Average an array of numbers. Returns 0 for empty arrays. */
function avg(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

/**
 * Calculate what percentage the user is behind the competitor average.
 * Positive = user is behind. Negative = user is ahead.
 * Returns 0 if competitorAvg is 0 (avoids division by zero).
 */
function calcGapPercent(competitorAvg: number, userValue: number): number {
  if (competitorAvg <= 0) return 0;
  return ((competitorAvg - userValue) / competitorAvg) * 100;
}

/**
 * Map a gap percentage to a 0–100 score using the defined piecewise scale.
 * Higher score = bigger gap = more opportunity.
 * Optionally capped at maxScore (used for upload frequency at 60).
 */
function scoreFromGap(gapPercent: number, maxScore = 100): number {
  if (gapPercent <= 0) return 0; // user is at or ahead of competitor avg
  let score: number;
  if (gapPercent < 25) {
    score = 10 + (gapPercent / 25) * 20;
  } else if (gapPercent < 50) {
    score = 30 + ((gapPercent - 25) / 25) * 30;
  } else if (gapPercent < 75) {
    score = 60 + ((gapPercent - 50) / 25) * 25;
  } else {
    score = 85 + Math.min(((gapPercent - 75) / 25) * 15, 15);
  }
  return Math.min(score, maxScore);
}

/** Format a number with commas: 34200 → "34,200" */
function fmtNum(n: number): string {
  return Math.round(n).toLocaleString('en-US');
}

/** Format seconds as "Xm Ys": 620 → "10m 20s" */
function fmtSeconds(s: number): string {
  const minutes = Math.floor(s / 60);
  const seconds = Math.round(s % 60);
  if (minutes === 0) return `${seconds}s`;
  return seconds === 0 ? `${minutes}m` : `${minutes}m ${seconds}s`;
}

/** Format a decimal CTR as a percentage string: 0.031 → "3.1%" */
function fmtCtr(ctr: number): string {
  return `${(ctr * 100).toFixed(1)}%`;
}

// ---------------------------------------------------------------------------
// Metric score builders
// ---------------------------------------------------------------------------

function buildViewsScore(userAvg: number, tier1Avg: number): MetricScore {
  const gapPercent = calcGapPercent(tier1Avg, userAvg);
  const score = scoreFromGap(gapPercent);
  let label: string;
  if (gapPercent <= 0) {
    label = `Your videos average ${fmtNum(userAvg)} views, ahead of the Tier 1 average of ${fmtNum(tier1Avg)}. Keep it up.`;
  } else {
    label = `Your videos average ${fmtNum(userAvg)} views. Tier 1 competitors average ${fmtNum(tier1Avg)}. You are ${Math.round(gapPercent)}% behind.`;
  }
  return { userValue: userAvg, competitorAvg: tier1Avg, gapPercent, score, label };
}

function buildCtrScore(userCtr: number, tier1Ctr: number, userAvgViews: number): MetricScore {
  const gapPercent = calcGapPercent(tier1Ctr, userCtr);
  const score = scoreFromGap(gapPercent);
  let label: string;
  if (gapPercent <= 0) {
    label = `Your estimated CTR is ${fmtCtr(userCtr)}, ahead of the Tier 1 average of ${fmtCtr(tier1Ctr)}. Thumbnails are working.`;
  } else {
    // Estimate additional views per video if CTR matched tier1
    const addedViews = userCtr > 0
      ? Math.round(userAvgViews * (tier1Ctr / userCtr - 1))
      : 0;
    label = `Your estimated CTR is ${fmtCtr(userCtr)}. Tier 1 average is ${fmtCtr(tier1Ctr)}. Closing this gap could add ${fmtNum(addedViews)} views per video.`;
  }
  return { userValue: userCtr, competitorAvg: tier1Ctr, gapPercent, score, label };
}

function buildWatchTimeScore(userWatch: number, tier1Watch: number): MetricScore {
  const gapPercent = calcGapPercent(tier1Watch, userWatch);
  const score = scoreFromGap(gapPercent);
  let label: string;
  if (gapPercent <= 0) {
    label = `Your average watch time is ${fmtSeconds(userWatch)}, ahead of the Tier 1 average of ${fmtSeconds(tier1Watch)}. Audience retention is strong.`;
  } else {
    label = `Your average watch time is ${fmtSeconds(userWatch)}. Tier 1 average is ${fmtSeconds(tier1Watch)}. Increasing this signals quality to YouTube's algorithm.`;
  }
  return { userValue: userWatch, competitorAvg: tier1Watch, gapPercent, score, label };
}

function buildUploadFrequencyScore(userUploads: number, tier1Uploads: number): MetricScore {
  const gapPercent = calcGapPercent(tier1Uploads, userUploads);
  const score = Math.min(scoreFromGap(gapPercent), 60); // hard cap at 60
  let label: string;
  if (gapPercent <= 0) {
    label = `You post ${userUploads.toFixed(1)} videos per month, matching or exceeding the Tier 1 average of ${tier1Uploads.toFixed(1)}.`;
  } else {
    const target = Math.ceil((userUploads + tier1Uploads) / 2);
    label = `You post ${userUploads.toFixed(1)} videos per month. Tier 1 channels average ${tier1Uploads.toFixed(1)}. Consider increasing to ${target} per month.`;
  }
  return { userValue: userUploads, competitorAvg: tier1Uploads, gapPercent, score, label };
}

// ---------------------------------------------------------------------------
// Score a set of competitors and return a weighted overall score (0–100)
// ---------------------------------------------------------------------------

function scoreVsGroup(userMetrics: UserMetrics, group: CompetitorMetrics[]): number {
  if (group.length === 0) return 0;

  const t1AvgViews = avg(group.map((c) => c.avgViewsPerVideo));
  const t1AvgCtr = avg(group.map((c) => c.estimatedCtr));
  const t1AvgWatch = avg(group.map((c) => c.avgViewDurationSeconds));
  const t1AvgUploads = avg(group.map((c) => c.uploadsPerMonth));

  const viewsScore = scoreFromGap(calcGapPercent(t1AvgViews, userMetrics.avgViewsPerVideo));
  const ctrScore = scoreFromGap(calcGapPercent(t1AvgCtr, userMetrics.ctr));
  const watchScore = scoreFromGap(calcGapPercent(t1AvgWatch, userMetrics.avgViewDurationSeconds));
  const freqScore = Math.min(
    scoreFromGap(calcGapPercent(t1AvgUploads, userMetrics.uploadsPerMonth)),
    60,
  );

  return Math.round(viewsScore * 0.35 + ctrScore * 0.30 + watchScore * 0.25 + freqScore * 0.10);
}

// ---------------------------------------------------------------------------
// Helper — estimateRevenue
// ---------------------------------------------------------------------------

/**
 * Estimate monthly revenue in USD using niche CPM benchmarks.
 * Formula: (avgViewsPerVideo × uploadsPerMonth × CPM) / 1000 × 0.55
 * (0.55 = YouTube's 55% revenue share to creators)
 */
export function estimateRevenue(
  avgViewsPerVideo: number,
  uploadsPerMonth: number,
  nicheId: string,
): number {
  const cpm = NICHE_CPM[nicheId] ?? DEFAULT_CPM;
  return (avgViewsPerVideo * uploadsPerMonth * cpm) / 1000 * 0.55;
}

// ---------------------------------------------------------------------------
// Helper — buildCompetitorMetrics
// ---------------------------------------------------------------------------

/**
 * Convert raw CompetitorFullProfile objects from youtube-data.ts into
 * CompetitorMetrics objects ready for gap scoring.
 *
 * Filters out channels with subscriberCount <= userSubCount (only larger channels).
 * Assigns tier based on subscriber ratio vs the user.
 *
 * @param channelProfiles  Raw profiles from getCompetitorFullProfile()
 * @param userSubCount     User's current subscriber count
 * @param nicheId          Optional — used to estimate watch duration
 */
export function buildCompetitorMetrics(
  channelProfiles: CompetitorFullProfile[],
  userSubCount: number,
  nicheId?: string,
): CompetitorMetrics[] {
  const watchDuration =
    NICHE_WATCH_DURATION[nicheId ?? ''] ?? DEFAULT_WATCH_DURATION;

  const result: CompetitorMetrics[] = [];

  for (const profile of channelProfiles) {
    const subCount = profile.channel.subscriberCount;

    // Only keep channels larger than the user
    if (subCount <= userSubCount) continue;

    // Assign tier
    const ratio = subCount / userSubCount;
    if (ratio > 10) continue; // beyond tier 2 — not actionable for scoring
    const tier: 1 | 2 = ratio <= 3 ? 1 : 2;

    // Average views per video across recent videos
    const videos = profile.recentVideos;
    const avgViews =
      videos.length > 0 ? avg(videos.map((v) => v.viewCount)) : 0;

    // Uploads per month — recentVideos spans 90 days, so divide by 3
    const uploadsPerMonth = videos.length / 3;

    // Estimated CTR from views/subs ratio (public data only)
    const estimatedCtr =
      subCount > 0 ? Math.min((avgViews / subCount) * 0.3, 0.15) : 0;

    // Recent video titles for topic gap analysis
    const recentVideoTitles = videos
      .slice(0, 10)
      .map((v) => v.title)
      .filter(Boolean);

    result.push({
      channelId: profile.channel.id,
      channelName: profile.channel.name,
      subscriberCount: subCount,
      avgViewsPerVideo: Math.round(avgViews),
      estimatedCtr: Math.round(estimatedCtr * 10000) / 10000,
      avgViewDurationSeconds: watchDuration,
      uploadsPerMonth: Math.round(uploadsPerMonth * 10) / 10,
      recentVideoTitles,
      tier,
    });
  }

  return result;
}

// ---------------------------------------------------------------------------
// Main — calculateGapScore
// ---------------------------------------------------------------------------

/**
 * Calculate how far behind the user is vs Tier 1 and Tier 2 competitors.
 * Competitors must be pre-filtered to channels larger than the user —
 * use buildCompetitorMetrics() or getCompetitorMetricsFromDB() for this.
 *
 * Returns a GapScoreResult with per-metric breakdowns, revenue gap, and
 * plain-English recommendations.
 */
export function calculateGapScore(
  userMetrics: UserMetrics,
  competitorMetrics: CompetitorMetrics[],
): GapScoreResult {
  const tier1 = competitorMetrics.filter((c) => c.tier === 1);
  const tier2 = competitorMetrics.filter((c) => c.tier === 2);

  // Fall back to tier2 if no tier1 competitors — still useful
  const primaryGroup = tier1.length > 0 ? tier1 : tier2;

  // Zero result if no competitors at all
  if (primaryGroup.length === 0) {
    const zero: MetricScore = { userValue: 0, competitorAvg: 0, gapPercent: 0, score: 0, label: 'No competitor data available.' };
    const zeroRevenue: RevenueEstimate = { userMonthlyEstimate: 0, tier1AvgMonthly: 0, gapMonthly: 0, annualGap: 0, cpmUsed: NICHE_CPM[userMetrics.nicheId] ?? DEFAULT_CPM };
    return {
      overallScore: 0,
      tier1Score: 0,
      tier2Score: 0,
      breakdown: { viewsGap: zero, ctrGap: zero, watchTimeGap: zero, uploadFrequencyGap: zero },
      topCompetitor: '',
      biggestOpportunity: 'views',
      primaryBottleneck: 'No competitor data available to calculate your gap score.',
      revenueGap: zeroRevenue,
      calculatedAt: new Date().toISOString(),
    };
  }

  // ---------------------------------------------------------------------------
  // Tier 1 averages (or primary group averages if no tier1)
  // ---------------------------------------------------------------------------
  const t1AvgViews = avg(primaryGroup.map((c) => c.avgViewsPerVideo));
  const t1AvgCtr = avg(primaryGroup.map((c) => c.estimatedCtr));
  const t1AvgWatch = avg(primaryGroup.map((c) => c.avgViewDurationSeconds));
  const t1AvgUploads = avg(primaryGroup.map((c) => c.uploadsPerMonth));

  // ---------------------------------------------------------------------------
  // Per-metric scores
  // ---------------------------------------------------------------------------
  const viewsGap = buildViewsScore(userMetrics.avgViewsPerVideo, t1AvgViews);
  const ctrGap = buildCtrScore(userMetrics.ctr, t1AvgCtr, userMetrics.avgViewsPerVideo);
  const watchTimeGap = buildWatchTimeScore(userMetrics.avgViewDurationSeconds, t1AvgWatch);
  const uploadFrequencyGap = buildUploadFrequencyScore(userMetrics.uploadsPerMonth, t1AvgUploads);

  // ---------------------------------------------------------------------------
  // Weighted overall score
  // ---------------------------------------------------------------------------
  const overallScore = Math.round(
    viewsGap.score * 0.35 +
    ctrGap.score * 0.30 +
    watchTimeGap.score * 0.25 +
    uploadFrequencyGap.score * 0.10,
  );

  // Separate tier scores (for display purposes)
  const tier1Score = tier1.length > 0 ? scoreVsGroup(userMetrics, tier1) : 0;
  const tier2Score = tier2.length > 0 ? scoreVsGroup(userMetrics, tier2) : 0;

  // ---------------------------------------------------------------------------
  // Biggest opportunity = metric with highest weighted contribution
  // ---------------------------------------------------------------------------
  const weightedContributions: Record<string, number> = {
    views: viewsGap.score * 0.35,
    ctr: ctrGap.score * 0.30,
    watchTime: watchTimeGap.score * 0.25,
    uploadFrequency: uploadFrequencyGap.score * 0.10,
  };

  const biggestOpportunity = Object.entries(weightedContributions)
    .sort(([, a], [, b]) => b - a)[0][0];

  const BOTTLENECK_MESSAGES: Record<string, string> = {
    views: 'Getting more views per video is your biggest growth lever right now',
    ctr: 'Improving your thumbnail and title CTR is your biggest growth lever right now',
    watchTime: 'Increasing how long viewers watch your videos is your biggest growth lever right now',
    uploadFrequency: 'Posting more consistently is your biggest growth lever right now',
  };

  const primaryBottleneck = BOTTLENECK_MESSAGES[biggestOpportunity] ?? BOTTLENECK_MESSAGES.views;

  // ---------------------------------------------------------------------------
  // Top competitor (best Tier 1 by avg views)
  // ---------------------------------------------------------------------------
  const topCompetitor = primaryGroup.length > 0
    ? [...primaryGroup].sort((a, b) => b.avgViewsPerVideo - a.avgViewsPerVideo)[0].channelName
    : '';

  // ---------------------------------------------------------------------------
  // Revenue gap
  // ---------------------------------------------------------------------------
  const cpm = NICHE_CPM[userMetrics.nicheId] ?? DEFAULT_CPM;

  const userMonthlyEstimate = estimateRevenue(
    userMetrics.avgViewsPerVideo,
    userMetrics.uploadsPerMonth,
    userMetrics.nicheId,
  );

  const tier1AvgMonthly =
    tier1.length > 0
      ? avg(
          tier1.map((c) =>
            estimateRevenue(c.avgViewsPerVideo, c.uploadsPerMonth, userMetrics.nicheId),
          ),
        )
      : 0;

  const gapMonthly = Math.max(tier1AvgMonthly - userMonthlyEstimate, 0);

  const revenueGap: RevenueEstimate = {
    userMonthlyEstimate: Math.round(userMonthlyEstimate * 100) / 100,
    tier1AvgMonthly: Math.round(tier1AvgMonthly * 100) / 100,
    gapMonthly: Math.round(gapMonthly * 100) / 100,
    annualGap: Math.round(gapMonthly * 12 * 100) / 100,
    cpmUsed: cpm,
  };

  return {
    overallScore,
    tier1Score,
    tier2Score,
    breakdown: { viewsGap, ctrGap, watchTimeGap, uploadFrequencyGap },
    topCompetitor,
    biggestOpportunity,
    primaryBottleneck,
    revenueGap,
    calculatedAt: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Helper — saveGapScore
// ---------------------------------------------------------------------------

/**
 * Saves a GapScoreResult to the gap_scores table.
 * Maps GapScoreResult fields to the schema column names from CLAUDE.md.
 *
 * @returns true on success, false on error
 */
export async function saveGapScore(
  userId: string,
  result: GapScoreResult,
): Promise<boolean> {
  const supabase = createServiceClient();

  const { error } = await supabase.from('gap_scores').insert({
    user_id: userId,
    calculated_at: result.calculatedAt,
    overall_score: result.overallScore,
    views_gap_score: Math.round(result.breakdown.viewsGap.score),
    ctr_gap_score: Math.round(result.breakdown.ctrGap.score),
    watch_time_gap_score: Math.round(result.breakdown.watchTimeGap.score),
    upload_frequency_gap_score: Math.round(result.breakdown.uploadFrequencyGap.score),
    topic_coverage_gap_score: 0, // calculated in a future milestone
    estimated_revenue_gap: result.revenueGap.gapMonthly,
    primary_bottleneck: result.primaryBottleneck,
  });

  if (error) {
    console.error('[gap-scorer] saveGapScore error:', error.message);
    return false;
  }

  return true;
}
