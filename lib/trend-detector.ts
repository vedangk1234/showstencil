/**
 * lib/trend-detector.ts
 * Monitors competitor channels for viral videos and surfaces uncovered topics.
 *
 * Three functions:
 *   - detectViralVideos: reads pre-flagged viral videos from competitor_videos (no API calls)
 *   - findUncoveredTopics: calls claude-sonnet-4-6 to identify topic gaps (~400 Claude input tokens)
 *   - getTrendingInNiche: reads all viral videos for a set of competitor IDs, sorted by velocity
 *
 * NOTE: is_viral and velocity_score are pre-calculated at sync time in lib/db.ts
 * (saveCompetitorData). These functions only read from the DB — they do not call YouTube.
 *
 * If competitor_videos is empty (no sync has run yet), detectViralVideos and
 * getTrendingInNiche return [] — that is correct behaviour.
 */

import Anthropic from '@anthropic-ai/sdk';
import { createServiceClient } from '@/lib/supabase';
import type { ViralVideo, UncoveredTopic } from '@/types';

// ---------------------------------------------------------------------------
// Function 1 — detectViralVideos
// ---------------------------------------------------------------------------

/**
 * Reads pre-flagged viral videos from competitor_videos for the given competitor IDs.
 * is_viral is set at sync time — this function does NOT call the YouTube API.
 *
 * @param competitorIds  Array of internal competitor UUIDs (competitors.id)
 * @returns Top 10 viral videos sorted by velocity_score descending
 */
export async function detectViralVideos(competitorIds: string[]): Promise<ViralVideo[]> {
  if (competitorIds.length === 0) return [];

  const supabase = createServiceClient();

  const { data, error } = await supabase
    .from('competitor_videos')
    .select('youtube_video_id, title, view_count, velocity_score, published_at, thumbnail_url, performance_vs_avg, competitor_id, competitors(youtube_channel_id, channel_name)')
    .eq('is_viral', true)
    .in('competitor_id', competitorIds)
    .order('velocity_score', { ascending: false })
    .limit(10);

  if (error) {
    console.error('[trend-detector] detectViralVideos error:', error.message);
    return [];
  }

  if (!data || data.length === 0) return [];

  return data.map((row) => {
    const compArr = row.competitors as { youtube_channel_id: string; channel_name: string | null }[] | null;
    const comp = Array.isArray(compArr) ? compArr[0] ?? null : null;
    return {
      videoId: row.youtube_video_id,
      title: row.title ?? '',
      channelId: comp?.youtube_channel_id ?? '',
      channelName: comp?.channel_name ?? '',
      viewCount: row.view_count ?? 0,
      velocityScore: row.velocity_score ?? 0,
      publishedAt: row.published_at ?? '',
      thumbnailUrl: row.thumbnail_url ?? '',
      performanceVsAvg: row.performance_vs_avg ?? 0,
    };
  });
}

// ---------------------------------------------------------------------------
// Function 2 — findUncoveredTopics
// ---------------------------------------------------------------------------

/**
 * Calls Claude to identify topics covered by 2+ competitors that the user
 * has never addressed. Prompt is kept under 800 tokens by using only the
 * last 30 titles from each array.
 *
 * @param userVideoTitles       User's recent video titles
 * @param competitorVideoTitles Competitor video titles (all competitors combined)
 * @returns Top 5 uncovered topics with search demand estimate and suggested angle
 */
export async function findUncoveredTopics(
  userVideoTitles: string[],
  competitorVideoTitles: string[],
): Promise<UncoveredTopic[]> {
  // Cap to 30 titles each to stay under 800 prompt tokens
  const userTitles = userVideoTitles.slice(-30);
  const compTitles = competitorVideoTitles.slice(-30);

  const userList = userTitles.map((t, i) => `${i + 1}. ${t}`).join('\n');
  const compList = compTitles.map((t, i) => `${i + 1}. ${t}`).join('\n');

  const prompt = `You are a YouTube content strategist identifying topic gaps.

USER'S VIDEOS (${userTitles.length} titles):
${userList}

COMPETITOR VIDEOS (${compTitles.length} titles):
${compList}

Identify the top 5 topics that appear in 2 or more competitor titles but are COMPLETELY absent from the user's titles. For each topic, estimate search demand and suggest a unique angle the user could take.

Respond with ONLY a JSON array — no markdown, no other text:
[
  {
    "topic": "<topic phrase, e.g. passive income with index funds>",
    "competitorCoverage": <integer — how many competitor titles cover this topic>,
    "searchDemandEstimate": "<high|medium|low>",
    "suggestedAngle": "<one-sentence suggestion for the user's take>"
  }
]`;

  try {
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1024,
      temperature: 0.4,
      system: 'You are a JSON-only API. Your entire response must be a single valid JSON array. Never include explanations, reasoning, markdown, or any text outside the JSON array.',
      messages: [{ role: 'user', content: prompt }],
    });

    const rawText =
      message.content[0].type === 'text' ? message.content[0].text.trim() : '';

    let parsed: Array<{
      topic: string;
      competitorCoverage: number;
      searchDemandEstimate: string;
      suggestedAngle: string;
    }>;

    try {
      parsed = JSON.parse(rawText);
    } catch {
      // Claude sometimes prepends explanation text before the JSON array.
      // Try extracting just the [...] portion before giving up.
      const match = rawText.match(/\[[\s\S]*\]/);
      if (match) {
        try {
          parsed = JSON.parse(match[0]);
        } catch {
          console.error('[trend-detector] findUncoveredTopics: failed to parse Claude JSON (even after regex extraction). Raw response:', rawText);
          return [];
        }
      } else {
        console.error('[trend-detector] findUncoveredTopics: failed to parse Claude JSON. Raw response:', rawText);
        return [];
      }
    }

    if (!Array.isArray(parsed)) {
      console.error('[trend-detector] findUncoveredTopics: Claude did not return an array');
      return [];
    }

    const validDemand = new Set(['high', 'medium', 'low']);

    return parsed.slice(0, 5).map((item) => ({
      topic: String(item.topic ?? ''),
      competitorCoverage: typeof item.competitorCoverage === 'number' ? item.competitorCoverage : 1,
      searchDemandEstimate: validDemand.has(item.searchDemandEstimate)
        ? (item.searchDemandEstimate as 'high' | 'medium' | 'low')
        : 'medium',
      suggestedAngle: String(item.suggestedAngle ?? ''),
    }));
  } catch (err) {
    console.error('[trend-detector] findUncoveredTopics: Claude API error:', err);
    return [];
  }
}

// ---------------------------------------------------------------------------
// Function 3 — getTrendingInNiche
// ---------------------------------------------------------------------------

/**
 * Returns viral videos for a set of competitor IDs, sorted by velocity_score
 * descending. Accepts competitorIds directly so callers control the niche scope
 * (filter competitors by user niche before calling this function).
 *
 * @param competitorIds  Internal competitor UUIDs (competitors.id)
 * @param limit          Maximum number of results to return
 * @returns Viral videos sorted by velocity_score descending
 */
export async function getTrendingInNiche(
  competitorIds: string[],
  limit: number,
): Promise<ViralVideo[]> {
  if (competitorIds.length === 0) return [];

  const supabase = createServiceClient();

  const { data, error } = await supabase
    .from('competitor_videos')
    .select('youtube_video_id, title, view_count, velocity_score, published_at, thumbnail_url, performance_vs_avg, competitor_id, competitors(youtube_channel_id, channel_name)')
    .eq('is_viral', true)
    .in('competitor_id', competitorIds)
    .order('velocity_score', { ascending: false })
    .limit(limit);

  if (error) {
    console.error('[trend-detector] getTrendingInNiche error:', error.message);
    return [];
  }

  if (!data || data.length === 0) return [];

  return data.map((row) => {
    const compArr = row.competitors as { youtube_channel_id: string; channel_name: string | null }[] | null;
    const comp = Array.isArray(compArr) ? compArr[0] ?? null : null;
    return {
      videoId: row.youtube_video_id,
      title: row.title ?? '',
      channelId: comp?.youtube_channel_id ?? '',
      channelName: comp?.channel_name ?? '',
      viewCount: row.view_count ?? 0,
      velocityScore: row.velocity_score ?? 0,
      publishedAt: row.published_at ?? '',
      thumbnailUrl: row.thumbnail_url ?? '',
      performanceVsAvg: row.performance_vs_avg ?? 0,
    };
  });
}

// ---------------------------------------------------------------------------
// TEST — run via: RUN_TREND_TEST=true npx tsx --env-file=.env.local lib/trend-detector.ts
// ---------------------------------------------------------------------------

if (process.env.RUN_TREND_TEST === 'true') {
  (async () => {
    console.log('=== Trend Detector Test ===\n');

    // --- Test 1: detectViralVideos with real competitor IDs from DB ---
    console.log('--- Test 1: detectViralVideos ---');

    const supabase = createServiceClient();
    const { data: compRows } = await supabase
      .from('competitors')
      .select('id')
      .eq('is_active', true)
      .limit(20);

    const competitorIds = (compRows ?? []).map((r: { id: string }) => r.id);
    console.log(`Found ${competitorIds.length} active competitor(s) in DB`);

    const viralVideos = await detectViralVideos(competitorIds);
    console.log(`Viral videos found: ${viralVideos.length}`);
    if (viralVideos.length > 0) {
      console.log('Top viral video:', JSON.stringify(viralVideos[0], null, 2));
    } else {
      console.log('(No viral videos — competitor_videos may be empty or no videos are flagged is_viral=true)');
    }

    // --- Test 2: findUncoveredTopics with hardcoded finance titles ---
    console.log('\n--- Test 2: findUncoveredTopics ---');

    const userTitles = [
      'How I Saved $10,000 in One Year',
      'Roth IRA Explained for Beginners',
      'My Monthly Budget Breakdown',
      'How to Start Investing with $500',
      'Emergency Fund: How Much Do You Really Need?',
      'Index Funds vs ETFs: What\'s the Difference?',
      'I Tried the Cash Envelope Method for 30 Days',
      'How to Pay Off Credit Card Debt Fast',
      'My Net Worth Update at 25',
      'Best Budgeting Apps in 2024',
    ];

    const competitorTitles = [
      'How I Make $5,000/Month in Passive Income',
      'Passive Income Ideas That Actually Work in 2024',
      'My Passive Income Streams Revealed',
      'How to Build Passive Income from Scratch',
      'I Quit My Job Thanks to Passive Income',
      'Real Estate Investing for Beginners: House Hacking',
      'How I Bought My First Rental Property at 24',
      'House Hacking: The Strategy That Changed My Life',
      'Real Estate vs Stocks: Where to Put Your Money',
      'I Bought a Duplex with $10K Down',
      'High Yield Savings Accounts: Best Options Right Now',
      'Where to Park Your Emergency Fund in 2024',
      'Are High Yield Savings Accounts Worth It?',
      'Best HYSA Rates Compared',
      'I Moved My Emergency Fund to a High Yield Account',
      'How to Negotiate Your Salary (Scripts That Work)',
      'I Asked for a $20K Raise and Got It',
      'Salary Negotiation Tips Nobody Talks About',
      'Tax Loss Harvesting Explained Simply',
      'How to Lower Your Tax Bill Legally',
    ];

    const topics = await findUncoveredTopics(userTitles, competitorTitles);
    console.log(`Uncovered topics found: ${topics.length}`);
    console.log(JSON.stringify(topics, null, 2));

    if (topics.length >= 2) {
      console.log('\nPASS: ✓ returned at least 2-3 uncovered topics');
    } else {
      console.log('\nFAIL: ✗ expected at least 2 topics — check Claude response above');
    }

    console.log('\n=== Test Complete ===');
  })();
}
