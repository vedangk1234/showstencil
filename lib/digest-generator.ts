/**
 * lib/digest-generator.ts
 * Generates a personalised weekly intelligence digest for a creator using Claude.
 *
 * Flow:
 *  1. Load user, channel snapshot, videos, competitors from DB
 *  2. Calculate fresh gap score via calculateGapScore
 *  3. Load viral videos + uncovered topics from trend-detector
 *  4. Assemble structured prompt payload
 *  5. Call Claude Sonnet 4.6 (max_tokens: 1200)
 *  6. Parse response into sections + structured VideoIdea objects
 *  7. Save to digests table
 *  8. Return DigestResult
 *
 * Run test:
 *   RUN_DIGEST_TEST=true npx tsx --env-file=.env.local lib/digest-generator.ts
 */

import Anthropic from '@anthropic-ai/sdk';
import { createServiceClient } from '@/lib/supabase';
import { getUser, getChannelSnapshots, getVideos, getCompetitorMetricsFromDB } from '@/lib/db';
import { calculateGapScore } from '@/lib/gap-scorer';
import { getTrendingInNiche, findUncoveredTopics } from '@/lib/trend-detector';
import type { DigestResult, DigestVideoIdea } from '@/types';

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Extract the content of a markdown section from Claude's response.
 * Matches everything between `## Header` and the next `##` (or end of string).
 */
function extractSection(markdown: string, header: string): string {
  const escaped = header.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(`##\\s*${escaped}\\s*\\n([\\s\\S]*?)(?=\\n##|$)`, 'i');
  const match = regex.exec(markdown);
  return match ? match[1].trim() : '';
}

/**
 * Parse the "## Your 3 video ideas" section into DigestVideoIdea objects.
 * Claude formats each idea as a numbered list item. We extract what we can.
 */
function parseVideoIdeas(ideasSection: string): DigestVideoIdea[] {
  if (!ideasSection) return [];

  // Claude may use "1." / "**1.**" / "**1. "Title"**" patterns.
  // Split on any occurrence of a bolded or plain numbered item marker.
  const items = ideasSection
    .split(/(?=\*{0,2}\d+\.\s)/m)
    .map((s) => s.trim())
    .filter(Boolean);

  // If splitting produced only one large chunk (Claude used inline numbering),
  // try splitting on the bold-number pattern directly: **1. / **2. / **3.
  const chunks =
    items.length <= 1
      ? ideasSection.split(/\*{0,2}(\d+)\.\s/).filter(Boolean)
      : items;

  // Re-parse after second split attempt: look for segments that start with a title
  // The heuristic: a segment is a new idea if it begins with a quoted title or bold text
  const ideas: DigestVideoIdea[] = [];

  // Try the cleaner approach: extract by regex for each of ideas 1, 2, 3
  for (let i = 1; i <= 3; i++) {
    // Match: **N. "Title"** or N. "Title" or **N. Title**
    const ideaRegex = new RegExp(
      `\\*{0,2}${i}\\.\\s*\\*{0,2}"?([^"\\n*]+)"?\\*{0,2}([\\s\\S]*?)(?=\\*{0,2}${i + 1}\\.|$)`,
      'i',
    );
    const match = ideaRegex.exec(ideasSection);
    if (!match) continue;

    const title = match[1].trim().replace(/\*+/g, '');
    const body = match[2].trim();

    const scoreMatch = body.match(/(?:score|opportunity)[:\s]*(\d{1,3})/i);
    const opportunityScore = scoreMatch ? parseInt(scoreMatch[1], 10) : null;

    ideas.push({ title, opportunityScore, reasoning: body });
  }

  // Fallback: if regex extraction got nothing, use raw line splits
  if (ideas.length === 0) {
    for (const item of chunks.slice(0, 3)) {
      const lines = item.split('\n').map((l) => l.trim()).filter(Boolean);
      if (lines.length === 0) continue;
      const titleLine = lines[0].replace(/^\*{0,2}\d+\.\s*\*{0,2}/, '').replace(/\*+/g, '').trim();
      const reasoning = lines.slice(1).join(' ').trim();
      const scoreMatch = item.match(/(?:score|opportunity)[:\s]*(\d{1,3})/i);
      ideas.push({
        title: titleLine,
        opportunityScore: scoreMatch ? parseInt(scoreMatch[1], 10) : null,
        reasoning,
      });
    }
  }

  return ideas.slice(0, 3);
}

// ---------------------------------------------------------------------------
// Main — generateDigest
// ---------------------------------------------------------------------------

export async function generateDigest(userId: string): Promise<DigestResult> {
  const generatedAt = new Date().toISOString();
  const supabase = createServiceClient();

  // -------------------------------------------------------------------------
  // Step 1: Load user data from DB
  // -------------------------------------------------------------------------
  const [user, snapshots, videos, competitorMetrics] = await Promise.all([
    getUser(userId),
    getChannelSnapshots(userId, 30),
    getVideos(userId, 10),
    getCompetitorMetricsFromDB(userId),
  ]);

  if (!user) {
    throw new Error(`[digest-generator] User not found: ${userId}`);
  }

  const latestSnapshot = snapshots.length > 0 ? snapshots[snapshots.length - 1] : null;

  // -------------------------------------------------------------------------
  // Step 2: Build UserMetrics and calculate fresh gap score
  // -------------------------------------------------------------------------
  const avgViewsPerVideo =
    videos.length > 0
      ? Math.round(videos.reduce((sum, v) => sum + (v.view_count ?? 0), 0) / videos.length)
      : 0;

  const avgCtr =
    videos.filter((v) => v.ctr !== null).length > 0
      ? videos.filter((v) => v.ctr !== null).reduce((sum, v) => sum + (v.ctr ?? 0), 0) /
        videos.filter((v) => v.ctr !== null).length
      : 0;

  const avgWatchSeconds =
    videos.filter((v) => v.avg_view_duration_seconds !== null).length > 0
      ? Math.round(
          videos
            .filter((v) => v.avg_view_duration_seconds !== null)
            .reduce((sum, v) => sum + (v.avg_view_duration_seconds ?? 0), 0) /
            videos.filter((v) => v.avg_view_duration_seconds !== null).length,
        )
      : 0;

  // Estimate uploads per month from video published_at dates in last 30 days
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const recentUploads = videos.filter(
    (v) => v.published_at && new Date(v.published_at) >= thirtyDaysAgo,
  ).length;
  const uploadsPerMonth = recentUploads > 0 ? recentUploads : videos.length / 3;

  const userMetrics = {
    avgViewsPerVideo,
    ctr: Math.round(avgCtr * 10000) / 10000,
    avgViewDurationSeconds: avgWatchSeconds,
    uploadsPerMonth: Math.round(uploadsPerMonth * 10) / 10,
    subscriberCount: latestSnapshot?.subscriber_count ?? 0,
    nicheId: user.niche_id ?? 'entertainment',
    recentVideoTitles: videos
      .slice(0, 10)
      .map((v) => v.title)
      .filter((t): t is string => !!t),
  };

  const gapScore = calculateGapScore(userMetrics, competitorMetrics);

  // -------------------------------------------------------------------------
  // Step 3: Load intelligence data from trend-detector
  // -------------------------------------------------------------------------

  // Fetch competitor IDs for this user
  const { data: compRows } = await supabase
    .from('competitors')
    .select('id')
    .eq('user_id', userId)
    .eq('is_active', true);

  const competitorIds = (compRows ?? []).map((r: { id: string }) => r.id);

  // Collect competitor video titles for topic gap analysis
  const allCompetitorTitles = competitorMetrics.flatMap((c) => c.recentVideoTitles);

  const [viralVideos, uncoveredTopics] = await Promise.all([
    getTrendingInNiche(competitorIds, 5),
    findUncoveredTopics(userMetrics.recentVideoTitles, allCompetitorTitles),
  ]);

  // -------------------------------------------------------------------------
  // Step 4: Assemble structured prompt payload
  // -------------------------------------------------------------------------
  const creatorName = user.name ?? 'your channel';

  const recentVideosForPrompt = videos.slice(0, 3).map((v) => ({
    title: v.title ?? '(untitled)',
    views: v.view_count ?? 0,
    ctr: v.ctr != null ? `${(v.ctr * 100).toFixed(1)}%` : 'n/a',
    watchSeconds: v.avg_view_duration_seconds ?? 0,
  }));

  const topViralVideos = viralVideos.slice(0, 3).map((v) => ({
    title: v.title,
    channelName: v.channelName,
    viewCount: v.viewCount,
    performanceVsAvg: v.performanceVsAvg,
  }));

  const topUncoveredTopics = uncoveredTopics.slice(0, 3).map((t) => ({
    topic: t.topic,
    competitorCoverage: t.competitorCoverage,
    searchDemand: t.searchDemandEstimate,
    suggestedAngle: t.suggestedAngle,
  }));

  const topCompetitors = competitorMetrics
    .filter((c) => c.tier === 1)
    .slice(0, 3)
    .map((c) => ({
      name: c.channelName,
      subscribers: c.subscriberCount,
      avgViews: c.avgViewsPerVideo,
      uploadsPerMonth: c.uploadsPerMonth,
    }));

  const payload = {
    creatorName,
    niche: user.niche_id ?? 'general',
    channelStats: {
      subscriberCount: latestSnapshot?.subscriber_count ?? 0,
      avgViewsPerVideo,
      ctr: `${(avgCtr * 100).toFixed(1)}%`,
      avgWatchTime: `${Math.floor(avgWatchSeconds / 60)}m ${avgWatchSeconds % 60}s`,
      uploadsPerMonth: uploadsPerMonth.toFixed(1),
      estimatedMonthlyRevenue: latestSnapshot?.estimated_monthly_revenue ?? 0,
    },
    overallGapScore: gapScore.overallScore,
    gapBreakdown: {
      views: gapScore.breakdown.viewsGap.label,
      ctr: gapScore.breakdown.ctrGap.label,
      watchTime: gapScore.breakdown.watchTimeGap.label,
      uploadFrequency: gapScore.breakdown.uploadFrequencyGap.label,
    },
    biggestOpportunity: gapScore.primaryBottleneck,
    revenueGap: {
      userMonthly: gapScore.revenueGap.userMonthlyEstimate,
      competitorAvg: gapScore.revenueGap.tier1AvgMonthly,
      gapMonthly: gapScore.revenueGap.gapMonthly,
    },
    recentVideos: recentVideosForPrompt,
    topCompetitors,
    viralVideosThisWeek: topViralVideos,
    uncoveredTopics: topUncoveredTopics,
  };

  // -------------------------------------------------------------------------
  // Step 5: Call Claude Sonnet 4.6
  // -------------------------------------------------------------------------
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const systemPrompt = `You are a senior YouTube growth analyst writing a personalized weekly intelligence briefing for a specific creator. You have access to their exact channel data and their competitor data.

Rules:
- Always use the creator's channel name in the first sentence
- Reference their actual video titles — never say "your recent videos"
- Reference actual competitor channel names — never say "your competitors"
- Write in second person ("you", "your channel") — never third person
- Be direct and specific — no fluff, no generic advice
- Every recommendation must cite a specific number from the data
- Tone: sharp, knowledgeable friend — not corporate, not cheerleader
- Never use phrases like "it's important to", "you should consider", "one key takeaway is" — just state the finding and the action directly

Your response must follow this exact structure with these exact headers:
## This week
## What your competitors did
## Your 3 video ideas
## One thing to change this week`;

  const userPrompt = `Here is this week's data for ${creatorName}: ${JSON.stringify(payload, null, 2)}`;

  const t0 = Date.now();

  const message = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1200,
    temperature: 0.7,
    system: systemPrompt,
    messages: [{ role: 'user', content: userPrompt }],
  });

  const elapsedMs = Date.now() - t0;

  const rawMarkdown =
    message.content[0].type === 'text' ? message.content[0].text.trim() : '';

  // -------------------------------------------------------------------------
  // Cost tracking
  // -------------------------------------------------------------------------
  const inputTokens = message.usage.input_tokens;
  const outputTokens = message.usage.output_tokens;
  // Sonnet 4.6: $3/M input, $15/M output (as of knowledge cutoff)
  const costPerDigest = (inputTokens / 1_000_000) * 3 + (outputTokens / 1_000_000) * 15;

  console.log(
    `[digest-generator] Claude usage — Input: ${inputTokens} tokens, Output: ${outputTokens} tokens, ` +
      `Elapsed: ${elapsedMs}ms, Estimated cost: $${costPerDigest.toFixed(5)}`,
  );
  console.log(
    `[digest-generator] At 100 users/week this would cost: $${(costPerDigest * 100).toFixed(2)}`,
  );

  // -------------------------------------------------------------------------
  // Step 6: Parse sections
  // -------------------------------------------------------------------------
  const sections = {
    thisWeek: extractSection(rawMarkdown, 'This week'),
    competitorMoves: extractSection(rawMarkdown, "What your competitors did"),
    videoIdeas: extractSection(rawMarkdown, 'Your 3 video ideas'),
    oneChange: extractSection(rawMarkdown, 'One thing to change this week'),
  };

  const videoIdeasParsed = parseVideoIdeas(sections.videoIdeas);

  // -------------------------------------------------------------------------
  // Step 7: Save to digests table
  // -------------------------------------------------------------------------
  const weekStart = new Date();
  weekStart.setDate(weekStart.getDate() - weekStart.getDay()); // Sunday of this week
  const weekStartDate = weekStart.toISOString().slice(0, 10);

  const { error: digestError } = await supabase.from('digests').insert({
    user_id: userId,
    week_start_date: weekStartDate,
    content: rawMarkdown,
    video_ideas: videoIdeasParsed,
    key_metrics: {
      overallGapScore: gapScore.overallScore,
      avgViews: avgViewsPerVideo,
      ctr: avgCtr,
      avgWatchSeconds,
      uploadsPerMonth,
      revenueGap: gapScore.revenueGap.gapMonthly,
      generatedAt,
    },
    created_at: generatedAt,
  });

  if (digestError) {
    console.error('[digest-generator] Failed to save digest:', digestError.message);
  } else {
    console.log('[digest-generator] Digest saved to DB for week starting', weekStartDate);
  }

  // -------------------------------------------------------------------------
  // Step 8: Return DigestResult
  // -------------------------------------------------------------------------
  return {
    userId,
    generatedAt,
    overallGapScore: gapScore.overallScore,
    sections,
    rawMarkdown,
    videoIdeasParsed,
  };
}

// ---------------------------------------------------------------------------
// TEST — run via: RUN_DIGEST_TEST=true npx tsx --env-file=.env.local lib/digest-generator.ts
// ---------------------------------------------------------------------------

if (process.env.RUN_DIGEST_TEST === 'true') {
  (async () => {
    console.log('=== Digest Generator Test ===\n');

    const userId = '848f7497-9a46-40a3-8d90-a96d1c9cf909';
    console.log(`Generating digest for userId: ${userId}\n`);

    try {
      const result = await generateDigest(userId);

      console.log('--- DigestResult ---');
      console.log('userId:', result.userId);
      console.log('generatedAt:', result.generatedAt);
      console.log('overallGapScore:', result.overallGapScore);
      console.log('\n--- Sections ---');
      console.log('thisWeek length:', result.sections.thisWeek.length, 'chars');
      console.log('competitorMoves length:', result.sections.competitorMoves.length, 'chars');
      console.log('videoIdeas length:', result.sections.videoIdeas.length, 'chars');
      console.log('oneChange length:', result.sections.oneChange.length, 'chars');

      console.log('\n--- Raw Markdown ---\n');
      console.log(result.rawMarkdown);

      console.log('\n--- Parsed Video Ideas ---');
      console.log(JSON.stringify(result.videoIdeasParsed, null, 2));

      // Validation checks
      const allSectionsNonEmpty = Object.values(result.sections).every((s) => s.length > 0);
      console.log('\n--- Validation ---');
      console.log(allSectionsNonEmpty ? 'PASS: all 4 sections have content' : 'FAIL: one or more sections are empty');
      console.log(result.videoIdeasParsed.length >= 1 ? `PASS: parsed ${result.videoIdeasParsed.length} video ideas` : 'FAIL: no video ideas parsed');
    } catch (err) {
      console.error('FAIL: generateDigest threw an error:', err);
    }

    console.log('\n=== Test Complete ===');
  })();
}
