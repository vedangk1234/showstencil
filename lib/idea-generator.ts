/**
 * lib/idea-generator.ts
 * Generates 3 ranked video ideas for a creator using gap scores,
 * trending competitor videos, and uncovered topics.
 *
 * Requires the `ideas` table in Supabase — provision once with:
 *
 *   CREATE TABLE ideas (
 *     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 *     user_id UUID REFERENCES users(id) ON DELETE CASCADE,
 *     generated_at TIMESTAMPTZ NOT NULL,
 *     niche_id TEXT,
 *     gap_score_at_generation INTEGER,
 *     ideas JSONB NOT NULL,
 *     created_at TIMESTAMPTZ DEFAULT NOW()
 *   );
 *
 * Run test:
 *   $env:RUN_IDEA_TEST="true"; npx tsx --env-file=.env.local lib/idea-generator.ts
 */

import Anthropic from '@anthropic-ai/sdk';
import { createServiceClient } from '@/lib/supabase';
import { getUser, getChannelSnapshots, getVideos, getCompetitorMetricsFromDB } from '@/lib/db';
import { calculateGapScore } from '@/lib/gap-scorer';
import { findUncoveredTopics, getTrendingInNiche } from '@/lib/trend-detector';
import type { GeneratedVideoIdea, IdeaResult, GapScoreResult, UncoveredTopic, ViralVideo } from '@/types';

// ---------------------------------------------------------------------------
// Token cost — Claude Sonnet 4.6 pricing (USD per token)
// ---------------------------------------------------------------------------

const COST_PER_INPUT_TOKEN = 3 / 1_000_000;   // $3 per 1M input tokens
const COST_PER_OUTPUT_TOKEN = 15 / 1_000_000;  // $15 per 1M output tokens

// ---------------------------------------------------------------------------
// Helper — getOrCalculateGapScore
// ---------------------------------------------------------------------------

/**
 * Returns the most recent gap score from the DB if generated in the last 7 days.
 * Falls back to calculating a fresh score from competitor metrics.
 * Returns null if no competitor data is available — callers handle this gracefully.
 */
export async function getOrCalculateGapScore(userId: string): Promise<GapScoreResult | null> {
  const supabase = createServiceClient();

  // Check for a recent score (within 7 days)
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  const { data: recentScore } = await supabase
    .from('gap_scores')
    .select('*')
    .eq('user_id', userId)
    .gte('calculated_at', sevenDaysAgo.toISOString())
    .order('calculated_at', { ascending: false })
    .limit(1)
    .single();

  if (recentScore) {
    // Reconstruct a lightweight GapScoreResult from the stored row
    return {
      overallScore: recentScore.overall_score ?? 0,
      tier1Score: recentScore.overall_score ?? 0,
      tier2Score: 0,
      breakdown: {
        viewsGap: { userValue: 0, competitorAvg: 0, gapPercent: 0, score: recentScore.views_gap_score ?? 0, label: '' },
        ctrGap: { userValue: 0, competitorAvg: 0, gapPercent: 0, score: recentScore.ctr_gap_score ?? 0, label: '' },
        watchTimeGap: { userValue: 0, competitorAvg: 0, gapPercent: 0, score: recentScore.watch_time_gap_score ?? 0, label: '' },
        uploadFrequencyGap: { userValue: 0, competitorAvg: 0, gapPercent: 0, score: recentScore.upload_frequency_gap_score ?? 0, label: '' },
      },
      topCompetitor: '',
      biggestOpportunity: 'views',
      primaryBottleneck: recentScore.primary_bottleneck ?? '',
      revenueGap: {
        userMonthlyEstimate: 0,
        tier1AvgMonthly: 0,
        gapMonthly: recentScore.estimated_revenue_gap ?? 0,
        annualGap: (recentScore.estimated_revenue_gap ?? 0) * 12,
        cpmUsed: 0,
      },
      calculatedAt: recentScore.calculated_at,
    };
  }

  // No recent score — calculate fresh from DB competitor metrics
  try {
    const [snapshots, competitorMetrics] = await Promise.all([
      getChannelSnapshots(userId, 30),
      getCompetitorMetricsFromDB(userId),
    ]);

    if (competitorMetrics.length === 0) return null;

    const latestSnapshot = snapshots[snapshots.length - 1];
    if (!latestSnapshot) return null;

    const userMetrics = {
      avgViewsPerVideo: latestSnapshot.avg_views_per_video ?? 0,
      ctr: latestSnapshot.avg_ctr ?? 0,
      avgViewDurationSeconds: latestSnapshot.avg_view_duration_seconds ?? 360,
      uploadsPerMonth: 4, // conservative default
      subscriberCount: latestSnapshot.subscriber_count ?? 0,
      nicheId: competitorMetrics[0]?.channelId ? '' : '',
      recentVideoTitles: [],
    };

    // Resolve niche from user row
    const user = await getUser(userId);
    userMetrics.nicheId = user?.niche_id ?? '';

    return calculateGapScore(userMetrics, competitorMetrics);
  } catch (err) {
    console.error('[idea-generator] getOrCalculateGapScore fallback failed:', err);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Helper — parseVideoIdeas
// ---------------------------------------------------------------------------

/**
 * Parse Claude's structured idea blocks into GeneratedVideoIdea objects.
 *
 * Expected format per idea:
 *   **Title:** ...
 *   **Score:** 0-100
 *   **Why now:** ...
 *   **Angle:** ...
 *   **Format:** ...
 *   **Estimated length:** ...
 *
 * Strategy: split on **Title:** occurrences since that field always appears.
 * Falls back to numbered-block split if that yields too few results.
 */
function parseVideoIdeas(rawText: string, generatedAt: string): GeneratedVideoIdea[] {
  if (!rawText) return [];

  const ideas: GeneratedVideoIdea[] = [];

  // Extract a single-line field value after **Field:** marker
  const getField = (block: string, field: string): string => {
    const regex = new RegExp(`\\*\\*${field}:\\*\\*[\\s]*(.*?)(?=\\n\\*\\*|\\n\\n|$)`, 'is');
    const m = regex.exec(block);
    return m ? m[1].trim() : '';
  };

  // Primary: split on each **Title:** occurrence — most robust because every idea has one
  // We re-attach "**Title:**" prefix to each block after splitting
  const titleSplitBlocks = rawText.split(/(?=\*\*Title:\*\*)/i).filter((b) => b.includes('**Title:**'));

  // Also try splitting on numbered lines in case Claude used "1.\n**Title:**..." format
  const numberedBlocks = rawText
    .split(/\n\s*(?:\*\*)?(?:[123])[.)]\s*(?:\*\*)?/)
    .filter((b) => b.includes('**Title:**'));

  // Use whichever split produced more blocks (at least 1)
  const blocks = titleSplitBlocks.length >= numberedBlocks.length ? titleSplitBlocks : numberedBlocks;

  for (const block of blocks) {
    if (ideas.length >= 3) break;

    const title = getField(block, 'Title');
    if (!title) continue;

    const scoreStr = getField(block, 'Score');
    const score = Math.min(100, Math.max(0, parseInt(scoreStr, 10) || 50));

    ideas.push({
      rank: ideas.length + 1,
      title,
      score,
      whyNow: getField(block, 'Why now'),
      angle: getField(block, 'Angle'),
      format: getField(block, 'Format') || 'tutorial',
      estimatedLength: getField(block, 'Estimated length') || '10-15 minutes',
      generatedAt,
    });
  }

  return ideas;
}

// ---------------------------------------------------------------------------
// Helper — saveIdeas
// ---------------------------------------------------------------------------

/**
 * Saves the idea set to the `ideas` table and prunes rows older than 4 weeks
 * for this user. Returns true on success.
 */
async function saveIdeas(result: IdeaResult): Promise<boolean> {
  const supabase = createServiceClient();

  const { error: insertError } = await supabase.from('ideas').insert({
    user_id: result.userId,
    generated_at: result.generatedAt,
    niche_id: result.nicheId,
    gap_score_at_generation: result.inputGapScore,
    ideas: result.ideas,
  });

  if (insertError) {
    console.error('[idea-generator] saveIdeas insert error:', insertError.message);
    return false;
  }

  // Prune rows older than 4 weeks for this user
  const fourWeeksAgo = new Date();
  fourWeeksAgo.setDate(fourWeeksAgo.getDate() - 28);

  const { error: pruneError } = await supabase
    .from('ideas')
    .delete()
    .eq('user_id', result.userId)
    .lt('generated_at', fourWeeksAgo.toISOString());

  if (pruneError) {
    // Non-fatal — log but don't fail the whole operation
    console.warn('[idea-generator] saveIdeas prune warning:', pruneError.message);
  }

  return true;
}

// ---------------------------------------------------------------------------
// Main — generateVideoIdeas
// ---------------------------------------------------------------------------

/**
 * Generates 3 ranked video ideas for a creator.
 *
 * Data sources loaded in parallel:
 *   - User row (channel name, niche_id)
 *   - Latest gap score (DB cache or freshly calculated)
 *   - Active competitors (for uncovered topics + viral videos)
 *   - User's last 10 videos (titles for topic gap input)
 *   - User's best 3 videos (by view count, for style reference)
 *
 * Falls back gracefully when gap score or competitor data is unavailable —
 * ideas are still generated using uncovered topics and viral video data.
 *
 * @returns IdeaResult with 3 ranked ideas and cost metadata
 */
export async function generateVideoIdeas(userId: string): Promise<IdeaResult> {
  const generatedAt = new Date().toISOString();

  // ---------------------------------------------------------------------------
  // Step 1 — Load base data in parallel
  // ---------------------------------------------------------------------------

  const [user, snapshots, allVideos] = await Promise.all([
    getUser(userId),
    getChannelSnapshots(userId, 30),
    getVideos(userId, 10),
  ]);

  const nicheId = user?.niche_id ?? '';
  const channelName = user?.name ?? 'Your Channel';
  const latestSnapshot = snapshots[snapshots.length - 1];
  const subscriberCount = latestSnapshot?.subscriber_count ?? 0;

  // Fetch competitor IDs for trend functions
  const supabase = createServiceClient();
  const { data: competitorRows } = await supabase
    .from('competitors')
    .select('id')
    .eq('user_id', userId)
    .eq('is_active', true);

  const competitorIds = (competitorRows ?? []).map((r: { id: string }) => r.id);

  // ---------------------------------------------------------------------------
  // Step 2 — Load gap score + trend data in parallel
  // ---------------------------------------------------------------------------

  const userVideoTitles = allVideos.map((v) => v.title).filter((t): t is string => !!t);
  const bestVideos = allVideos.slice(0, 3).map((v) => ({ title: v.title ?? '', views: v.view_count ?? 0 }));

  // Gather competitor video titles for uncovered topics call
  const { data: competitorVideos } = await supabase
    .from('competitor_videos')
    .select('title')
    .in('competitor_id', competitorIds.length > 0 ? competitorIds : ['00000000-0000-0000-0000-000000000000'])
    .order('published_at', { ascending: false })
    .limit(60);

  const competitorVideoTitles = (competitorVideos ?? [])
    .map((v: { title: string | null }) => v.title)
    .filter((t): t is string => !!t);

  const [gapScore, uncoveredTopics, viralVideos] = await Promise.all([
    getOrCalculateGapScore(userId),
    userVideoTitles.length > 0 && competitorVideoTitles.length > 0
      ? findUncoveredTopics(userVideoTitles, competitorVideoTitles)
      : Promise.resolve([] as UncoveredTopic[]),
    competitorIds.length > 0
      ? getTrendingInNiche(competitorIds, 3)
      : Promise.resolve([] as ViralVideo[]),
  ]);

  const overallGapScore = gapScore?.overallScore ?? 0;
  const primaryBottleneck = gapScore?.primaryBottleneck ?? '';
  const revenueGapMonthly = gapScore?.revenueGap.gapMonthly ?? 0;

  // ---------------------------------------------------------------------------
  // Step 3 — Build Claude payload
  // ---------------------------------------------------------------------------

  const payload = {
    channelName,
    nicheId: nicheId || 'general',
    subscriberCount,
    overallGapScore,
    biggestOpportunity: primaryBottleneck,
    revenueGapMonthly: Math.round(revenueGapMonthly),
    uncoveredTopics: uncoveredTopics.slice(0, 5),
    viralVideos: viralVideos.slice(0, 3).map((v) => ({
      title: v.title,
      channelName: v.channelName,
      viewCount: v.viewCount,
      performanceVsAvg: v.performanceVsAvg,
    })),
    userBestVideos: bestVideos,
    userRecentTitles: userVideoTitles.slice(0, 10),
  };

  // ---------------------------------------------------------------------------
  // Step 4 — Call Claude
  // ---------------------------------------------------------------------------

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const systemPrompt = `You are a YouTube content strategist generating video ideas for a specific creator. You have access to their performance data, what their competitors are doing, and what topics are trending in their niche.

Rules:
- Each idea must be specific — not "make a video about investing" but a real title a real creator would actually publish
- Every idea must cite a specific data point from the provided data (a competitor view count, an uncovered topic, a gap metric)
- Score each idea 0-100 based on: topic demand (is it trending?), competition gap (are competitors doing this but not the user?), and fit (does it match the user's best performing content style?)
- Ideas must be ranked highest score first
- Tone: direct and specific — like a strategist who has studied this niche for years, not a generic content coach

For each idea provide:
**Title:** [specific publishable YouTube title]
**Score:** [0-100]
**Why now:** [one sentence citing specific data — competitor views, uncovered topic coverage count, or gap metric]
**Angle:** [what makes this different from what competitors already did]
**Format:** [recommended video format: tutorial / documentary / listicle / case study / opinion / challenge]
**Estimated length:** [recommended video length based on niche data]`;

  const userPrompt = `Generate 3 ranked video ideas for this creator: ${JSON.stringify(payload)}`;

  let rawText = '';
  let inputTokens = 0;
  let outputTokens = 0;

  try {
    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1000,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
    });

    rawText = message.content[0].type === 'text' ? message.content[0].text : '';
    inputTokens = message.usage.input_tokens;
    outputTokens = message.usage.output_tokens;
  } catch (err) {
    console.error('[idea-generator] Claude API error:', err);
  }

  // ---------------------------------------------------------------------------
  // Step 5 — Parse ideas
  // ---------------------------------------------------------------------------

  let ideas = parseVideoIdeas(rawText, generatedAt);

  // If parsing yielded nothing, log the raw response to help debug
  if (ideas.length === 0 && rawText) {
    console.warn('[idea-generator] Could not parse ideas from Claude response. Raw:\n', rawText.slice(0, 400));
  }

  // Fallback: if we got fewer than 3 ideas, fill from uncovered topics
  while (ideas.length < 3 && uncoveredTopics.length > ideas.length) {
    const topic = uncoveredTopics[ideas.length];
    ideas.push({
      rank: ideas.length + 1,
      title: topic.suggestedAngle || `${topic.topic} — explained`,
      score: topic.searchDemandEstimate === 'high' ? 70 : topic.searchDemandEstimate === 'medium' ? 50 : 30,
      whyNow: `${topic.competitorCoverage} competitor(s) have covered this topic but you haven't yet.`,
      angle: topic.suggestedAngle,
      format: 'tutorial',
      estimatedLength: '10-15 minutes',
      generatedAt,
    });
  }

  // Re-sort by score descending and re-rank
  ideas = ideas.sort((a, b) => b.score - a.score).map((idea, i) => ({ ...idea, rank: i + 1 }));

  // ---------------------------------------------------------------------------
  // Step 6 — Cost tracking
  // ---------------------------------------------------------------------------

  const costUsd = inputTokens * COST_PER_INPUT_TOKEN + outputTokens * COST_PER_OUTPUT_TOKEN;

  console.log(
    `[idea-generator] tokens: ${inputTokens} input / ${outputTokens} output, cost: $${costUsd.toFixed(5)}`,
  );
  console.log(
    `[idea-generator] at 100 users/week: $${(costUsd * 100).toFixed(2)}`,
  );

  // ---------------------------------------------------------------------------
  // Step 7 — Build result and save
  // ---------------------------------------------------------------------------

  const result: IdeaResult = {
    userId,
    generatedAt,
    ideas,
    nicheId: nicheId || 'general',
    inputGapScore: overallGapScore,
    tokensUsed: inputTokens + outputTokens,
    costUsd: Math.round(costUsd * 1_000_000) / 1_000_000, // round to 6 decimal places
  };

  await saveIdeas(result);

  return result;
}

// ---------------------------------------------------------------------------
// TEST — run via:
//   $env:RUN_IDEA_TEST="true"; npx tsx --env-file=.env.local lib/idea-generator.ts
// ---------------------------------------------------------------------------

if (process.env.RUN_IDEA_TEST === 'true') {
  (async () => {
    console.log('=== Idea Generator Test ===\n');

    const userId = '848f7497-9a46-40a3-8d90-a96d1c9cf909';
    console.log(`Generating ideas for userId: ${userId}\n`);

    let result: IdeaResult;
    try {
      result = await generateVideoIdeas(userId);
    } catch (err) {
      console.error('generateVideoIdeas threw:', err);
      process.exit(1);
    }

    console.log(`Niche: ${result.nicheId}`);
    console.log(`Gap score used: ${result.inputGapScore}`);
    console.log(`Ideas generated: ${result.ideas.length}`);
    console.log(`Total tokens: ${result.tokensUsed}`);
    console.log(`Cost: $${result.costUsd.toFixed(5)}\n`);

    for (const idea of result.ideas) {
      console.log(`--- Idea ${idea.rank} (score: ${idea.score}) ---`);
      console.log(`Title:            ${idea.title}`);
      console.log(`Why now:          ${idea.whyNow}`);
      console.log(`Angle:            ${idea.angle}`);
      console.log(`Format:           ${idea.format}`);
      console.log(`Estimated length: ${idea.estimatedLength}`);
      console.log('');
    }

    // Verify a row was saved to the ideas table
    const { createServiceClient } = await import('@/lib/supabase');
    const supabase = createServiceClient();
    const { data: savedRow, error: checkError } = await supabase
      .from('ideas')
      .select('id, generated_at, niche_id, gap_score_at_generation')
      .eq('user_id', userId)
      .order('generated_at', { ascending: false })
      .limit(1)
      .single();

    if (checkError) {
      console.error('DB verify failed:', checkError.message);
      console.log('NOTE: If this is a "relation does not exist" error, run the CREATE TABLE statement at the top of this file in Supabase SQL editor.');
    } else {
      console.log('DB row confirmed:', JSON.stringify(savedRow, null, 2));
      console.log('\nPASS: row saved to ideas table');
    }

    // Quality check
    const allHaveSpecificData = result.ideas.every(
      (idea) => idea.whyNow && idea.whyNow.length > 20,
    );
    const allHaveScores = result.ideas.every((idea) => idea.score >= 0 && idea.score <= 100);
    const scoresInRange = result.ideas.every((idea) => idea.score >= 10);

    console.log('\n--- Quality checks ---');
    console.log(`All ideas have why-now data:   ${allHaveSpecificData ? 'PASS' : 'FAIL'}`);
    console.log(`All ideas have valid scores:   ${allHaveScores ? 'PASS' : 'FAIL'}`);
    console.log(`Scores >= 10 (non-trivial):    ${scoresInRange ? 'PASS' : 'FAIL'}`);

    if (!allHaveSpecificData) {
      console.log('\nNOTE: Some ideas are too generic. The payload may not include enough competitor data.');
      console.log('Check that competitor_videos table has rows for this user\'s competitors.');
    }

    console.log('\n=== Test Complete ===');
  })();
}
