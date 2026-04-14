/**
 * lib/digest-generator.ts
 * Generates a personalised weekly intelligence digest for a creator using Claude.
 *
 * Flow:
 *  1. Load user, channel snapshot, videos (best + worst), competitors from DB
 *  2. Calculate fresh gap score via calculateGapScore
 *  3. Load viral videos + uncovered topics from trend-detector
 *  4. Derive posting day pattern from published_at dates
 *  5. Assemble structured prompt payload
 *  6. Call Claude Sonnet 4.6 (max_tokens: 1500)
 *  7. On API failure or short response (<200 chars), generate fallback digest
 *  8. Parse response into sections + structured VideoIdea objects
 *  9. Save to digests table
 * 10. Return DigestResult
 *
 * Run test:
 *   RUN_DIGEST_TEST=true npx tsx --env-file=.env.local lib/digest-generator.ts
 *
 * Run multi-niche test:
 *   RUN_NICHE_TEST=true npx tsx --env-file=.env.local lib/digest-generator.ts
 */

import Anthropic from '@anthropic-ai/sdk';
import { createServiceClient } from '@/lib/supabase';
import { getUser, getChannelSnapshots, getVideos, getWorstVideos, getCompetitorMetricsFromDB } from '@/lib/db';
import { calculateGapScore } from '@/lib/gap-scorer';
import { getTrendingInNiche, findUncoveredTopics } from '@/lib/trend-detector';
import type { DigestResult, DigestVideoIdea, UncoveredTopic, ViralVideo, Video } from '@/types';

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
 * Determine the most common day of week for publishing based on video published_at dates.
 * Returns "unknown" if no dated videos are available.
 */
function getMostFrequentPostingDay(videos: Video[]): string {
  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const dayCounts: Record<string, number> = {};

  for (const v of videos) {
    if (!v.published_at) continue;
    const day = dayNames[new Date(v.published_at).getDay()];
    dayCounts[day] = (dayCounts[day] ?? 0) + 1;
  }

  const entries = Object.entries(dayCounts);
  if (entries.length === 0) return 'unknown';
  return entries.reduce((best, curr) => (curr[1] > best[1] ? curr : best))[0];
}

/**
 * Parse the "## Your 3 video ideas" section into DigestVideoIdea objects.
 *
 * Claude now uses a structured block per idea:
 *   **Title:** ...
 *   **Why now:** ...
 *   **Angle:** ...
 *   **Estimated opportunity:** high|medium|low
 *
 * Falls back to numbered-list parsing if structured fields are absent.
 */
function parseVideoIdeas(ideasSection: string): DigestVideoIdea[] {
  if (!ideasSection) return [];

  // Primary: split on numbered idea headers (1. / **1.** / ### 1. etc.)
  // Each idea block may start with "**1.**" or "1." followed by a title or newline
  const ideaBlocks: string[] = [];

  // Split on patterns like: \n1. or \n**1. or \n### 1.
  const blockSplit = ideasSection.split(/\n(?=\*{0,2}\d+[\.\)]\s|\#{1,3}\s*\d+[\.\)])/m).filter(Boolean);

  if (blockSplit.length >= 2) {
    ideaBlocks.push(...blockSplit);
  } else {
    // Try splitting on "---" separators Claude sometimes uses
    ideaBlocks.push(...ideasSection.split(/\n---+\n/).filter(Boolean));
  }

  const ideas: DigestVideoIdea[] = [];

  for (const block of ideaBlocks.slice(0, 3)) {
    // Extract structured fields
    const titleMatch = block.match(/\*{0,2}Title\*{0,2}[:\s]+(.+)/i);
    const whyMatch = block.match(/\*{0,2}Why now\*{0,2}[:\s]+(.+)/i);
    const angleMatch = block.match(/\*{0,2}Angle\*{0,2}[:\s]+(.+)/i);
    const oppMatch = block.match(/\*{0,2}Estimated opportunity\*{0,2}[:\s]+(high|medium|low)/i);

    if (titleMatch) {
      const title = titleMatch[1].replace(/\*+/g, '').trim();
      const parts: string[] = [];
      if (whyMatch) parts.push(`Why now: ${whyMatch[1].trim()}`);
      if (angleMatch) parts.push(`Angle: ${angleMatch[1].trim()}`);
      const opportunityLabel = oppMatch ? oppMatch[1].toLowerCase() : null;
      const opportunityScore = opportunityLabel === 'high' ? 85 : opportunityLabel === 'medium' ? 55 : opportunityLabel === 'low' ? 25 : null;

      ideas.push({ title, opportunityScore, reasoning: parts.join(' | ') });
      continue;
    }

    // Fallback: plain numbered line
    const lines = block.split('\n').map((l) => l.trim()).filter(Boolean);
    if (lines.length === 0) continue;
    const titleLine = lines[0].replace(/^\*{0,2}\d+[\.\)]\s*\*{0,2}/, '').replace(/\*+/g, '').trim();
    const reasoning = lines.slice(1).join(' ').trim();
    const scoreMatch = block.match(/(?:score|opportunity)[:\s]*(\d{1,3})/i);
    ideas.push({
      title: titleLine,
      opportunityScore: scoreMatch ? parseInt(scoreMatch[1], 10) : null,
      reasoning,
    });
  }

  // If block splitting produced nothing, fall back to regex extraction per-idea number
  if (ideas.length === 0) {
    for (let i = 1; i <= 3; i++) {
      const ideaRegex = new RegExp(
        `\\*{0,2}${i}[\\.\\)]\\s*\\*{0,2}"?([^"\\n*]+)"?\\*{0,2}([\\s\\S]*?)(?=\\*{0,2}${i + 1}[\\.\\)]|$)`,
        'i',
      );
      const match = ideaRegex.exec(ideasSection);
      if (!match) continue;
      const title = match[1].trim().replace(/\*+/g, '');
      const body = match[2].trim();
      const scoreMatch = body.match(/(?:score|opportunity)[:\s]*(\d{1,3})/i);
      ideas.push({ title, opportunityScore: scoreMatch ? parseInt(scoreMatch[1], 10) : null, reasoning: body });
    }
  }

  return ideas.slice(0, 3);
}

// ---------------------------------------------------------------------------
// Fallback digest generator (no Claude call)
// ---------------------------------------------------------------------------

/**
 * Generates a minimal template-based digest when the Claude API is unavailable
 * or returns an unusably short response. Always shows gap score + top 3 ideas.
 */
function generateFallbackDigest(
  creatorName: string,
  nicheId: string,
  overallGapScore: number,
  primaryBottleneck: string,
  revenueGapMonthly: number,
  uncoveredTopics: UncoveredTopic[],
  viralVideos: ViralVideo[],
): string {
  const nicheDisplay = nicheId.charAt(0).toUpperCase() + nicheId.slice(1);

  const topViralLine = viralVideos.length > 0
    ? `"${viralVideos[0].title}" on ${viralVideos[0].channelName} is performing ${viralVideos[0].performanceVsAvg.toFixed(1)}x above average with ${viralVideos[0].viewCount.toLocaleString()} views.`
    : 'No viral competitor videos detected this week.';

  const ideasSection = uncoveredTopics.slice(0, 3).map((t, i) => {
    return [
      `${i + 1}.`,
      `**Title:** ${t.suggestedAngle || t.topic}`,
      `**Why now:** ${t.competitorCoverage} competitor(s) covered this topic — you haven't yet.`,
      `**Angle:** ${t.suggestedAngle}`,
      `**Estimated opportunity:** ${t.searchDemandEstimate}`,
    ].join('\n');
  }).join('\n\n');

  return [
    `## This week`,
    `${creatorName} is operating in the ${nicheDisplay} niche with a gap score of ${overallGapScore}/100 against Tier 1 competitors. The biggest opportunity right now is ${primaryBottleneck.toLowerCase()}, with an estimated $${Math.round(revenueGapMonthly)}/month being left on the table.`,
    ``,
    `## What your competitors did`,
    topViralLine + ' Check the competitor videos section for the full picture.',
    ``,
    `## Your 3 video ideas`,
    ideasSection || '(Run a competitor sync to unlock topic gap analysis.)',
    ``,
    `## One thing to change this week`,
    `Focus on ${primaryBottleneck.toLowerCase()}. Based on your gap score of ${overallGapScore}/100, this single metric change has the highest revenue impact — closing it could be worth $${Math.round(revenueGapMonthly / 2)}/month or more.`,
    ``,
    `*(This digest was generated in fallback mode — the AI service was temporarily unavailable. Data is based on your current gap score.)*`,
  ].join('\n');
}

// ---------------------------------------------------------------------------
// DigestContext — internal payload for Claude prompt assembly
// ---------------------------------------------------------------------------

interface DigestContext {
  creatorName: string;
  niche: string;
  channelStats: {
    subscriberCount: number;
    avgViewsPerVideo: number;
    ctr: string;
    avgWatchTime: string;
    uploadsPerMonth: string;
    estimatedMonthlyRevenue: number;
  };
  bestVideos: Array<{ title: string; views: number }>;
  worstVideos: Array<{ title: string; views: number }>;
  postingDayPattern: string;
  overallGapScore: number;
  gapBreakdown: {
    views: string;
    ctr: string;
    watchTime: string;
    uploadFrequency: string;
  };
  biggestOpportunity: string;
  revenueGap: {
    userMonthly: number;
    competitorAvg: number;
    gapMonthly: number;
  };
  topCompetitors: Array<{
    name: string;
    subscribers: number;
    avgViews: number;
    uploadsPerMonth: number;
  }>;
  viralVideosThisWeek: Array<{
    title: string;
    channelName: string;
    viewCount: number;
    performanceVsAvg: number;
  }>;
  uncoveredTopics: Array<{
    topic: string;
    competitorCoverage: number;
    searchDemand: string;
    suggestedAngle: string;
  }>;
}

// ---------------------------------------------------------------------------
// callClaudeForDigest — isolated Claude API call (makes testing easier)
// ---------------------------------------------------------------------------

async function callClaudeForDigest(
  context: DigestContext,
): Promise<{ rawMarkdown: string; inputTokens: number; outputTokens: number; elapsedMs: number; usedFallback: boolean }> {
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const systemPrompt = `You are a senior YouTube growth analyst writing a personalized weekly intelligence briefing for a specific creator. You have access to their exact channel data and their competitor data.

Rules:
- Always use the creator's channel name by name — never "your channel" or "the channel"
- Reference their actual best and worst video titles — never say "your recent videos"
- Reference actual competitor channel names — never say "your competitors"
- Write in second person ("you", "your") — never third person
- Be direct and specific — no fluff, no generic advice
- Every recommendation must cite a specific number from the data
- Tone: sharp, knowledgeable friend — not corporate, not cheerleader
- Never use phrases like "it's important to", "you should consider", "one key takeaway is"
- For finance/business/education niches: reference CPM, revenue, monetization context
- For gaming/entertainment niches: reference upload frequency, view velocity, subscriber growth
- For cooking/beauty/fitness niches: reference retention, watch time, thumbnail performance

Your response must follow this exact structure with these exact headers:

## This week
(2-3 sentences on what happened to their channel this week — cite specific numbers from the data. Reference their best and worst videos by title.)

## What your competitors did
(2-3 sentences on what moved in the niche this week — reference actual competitor names and viral video titles)

## Your 3 video ideas
For each idea, use this exact format:

1.
**Title:** [specific title using a proven format from your niche]
**Why now:** [one sentence citing a specific data point from the context]
**Angle:** [what makes this different from what competitors already did]
**Estimated opportunity:** [high/medium/low based on gap data and search demand]

2.
**Title:** ...
**Why now:** ...
**Angle:** ...
**Estimated opportunity:** ...

3.
**Title:** ...
**Why now:** ...
**Angle:** ...
**Estimated opportunity:** ...

## One thing to change this week
(One specific, actionable recommendation. Name the exact metric, the exact gap, and the exact action to take. One sentence only.)`;

  const userPrompt = `Here is this week's data for ${context.creatorName}:\n${JSON.stringify(context, null, 2)}`;

  const t0 = Date.now();

  try {
    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1500,
      temperature: 0.7,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
    });

    const elapsedMs = Date.now() - t0;
    const rawMarkdown = message.content[0].type === 'text' ? message.content[0].text.trim() : '';
    const inputTokens = message.usage.input_tokens;
    const outputTokens = message.usage.output_tokens;

    // Treat responses under 200 chars as failed (API returned garbage)
    if (rawMarkdown.length < 200) {
      console.warn(`[digest-generator] Claude response too short (${rawMarkdown.length} chars) — switching to fallback`);
      return { rawMarkdown: '', inputTokens, outputTokens, elapsedMs, usedFallback: true };
    }

    return { rawMarkdown, inputTokens, outputTokens, elapsedMs, usedFallback: false };
  } catch (err) {
    const elapsedMs = Date.now() - t0;
    console.error('[digest-generator] Claude API error — switching to fallback:', err);
    return { rawMarkdown: '', inputTokens: 0, outputTokens: 0, elapsedMs, usedFallback: true };
  }
}

// ---------------------------------------------------------------------------
// Main — generateDigest
// ---------------------------------------------------------------------------

export async function generateDigest(userId: string): Promise<DigestResult> {
  const generatedAt = new Date().toISOString();
  const supabase = createServiceClient();

  // -------------------------------------------------------------------------
  // Step 1: Load user data from DB (best + worst videos in parallel)
  // -------------------------------------------------------------------------
  const [user, snapshots, bestVideos, worstVideos, competitorMetrics] = await Promise.all([
    getUser(userId),
    getChannelSnapshots(userId, 30),
    getVideos(userId, 10),           // sorted views DESC — best performers
    getWorstVideos(userId, 3),       // sorted views ASC  — worst performers
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
    bestVideos.length > 0
      ? Math.round(bestVideos.reduce((sum, v) => sum + (v.view_count ?? 0), 0) / bestVideos.length)
      : 0;

  const avgCtr =
    bestVideos.filter((v) => v.ctr !== null).length > 0
      ? bestVideos.filter((v) => v.ctr !== null).reduce((sum, v) => sum + (v.ctr ?? 0), 0) /
        bestVideos.filter((v) => v.ctr !== null).length
      : 0;

  const avgWatchSeconds =
    bestVideos.filter((v) => v.avg_view_duration_seconds !== null).length > 0
      ? Math.round(
          bestVideos
            .filter((v) => v.avg_view_duration_seconds !== null)
            .reduce((sum, v) => sum + (v.avg_view_duration_seconds ?? 0), 0) /
            bestVideos.filter((v) => v.avg_view_duration_seconds !== null).length,
        )
      : 0;

  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const recentUploads = bestVideos.filter(
    (v) => v.published_at && new Date(v.published_at) >= thirtyDaysAgo,
  ).length;
  const uploadsPerMonth = recentUploads > 0 ? recentUploads : bestVideos.length / 3;

  const userMetrics = {
    avgViewsPerVideo,
    ctr: Math.round(avgCtr * 10000) / 10000,
    avgViewDurationSeconds: avgWatchSeconds,
    uploadsPerMonth: Math.round(uploadsPerMonth * 10) / 10,
    subscriberCount: latestSnapshot?.subscriber_count ?? 0,
    nicheId: user.niche_id ?? 'entertainment',
    recentVideoTitles: bestVideos
      .slice(0, 10)
      .map((v) => v.title)
      .filter((t): t is string => !!t),
  };

  const gapScore = calculateGapScore(userMetrics, competitorMetrics);

  // -------------------------------------------------------------------------
  // Step 3: Load intelligence data from trend-detector
  // -------------------------------------------------------------------------
  const { data: compRows } = await supabase
    .from('competitors')
    .select('id')
    .eq('user_id', userId)
    .eq('is_active', true);

  const competitorIds = (compRows ?? []).map((r: { id: string }) => r.id);
  const allCompetitorTitles = competitorMetrics.flatMap((c) => c.recentVideoTitles);

  const [viralVideos, uncoveredTopics] = await Promise.all([
    getTrendingInNiche(competitorIds, 5),
    findUncoveredTopics(userMetrics.recentVideoTitles, allCompetitorTitles),
  ]);

  // -------------------------------------------------------------------------
  // Step 4: Derive posting day pattern
  // -------------------------------------------------------------------------
  const postingDayPattern = getMostFrequentPostingDay(bestVideos);

  // -------------------------------------------------------------------------
  // Step 5: Assemble structured prompt payload
  // -------------------------------------------------------------------------
  const creatorName = user.name ?? 'your channel';

  const top3Best = bestVideos.slice(0, 3).map((v) => ({
    title: v.title ?? '(untitled)',
    views: v.view_count ?? 0,
  }));

  const top3Worst = worstVideos.slice(0, 3).map((v) => ({
    title: v.title ?? '(untitled)',
    views: v.view_count ?? 0,
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

  const context: DigestContext = {
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
    bestVideos: top3Best,
    worstVideos: top3Worst,
    postingDayPattern,
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
    topCompetitors,
    viralVideosThisWeek: topViralVideos,
    uncoveredTopics: topUncoveredTopics,
  };

  // -------------------------------------------------------------------------
  // Step 6: Call Claude — with fallback on failure or short response
  // -------------------------------------------------------------------------
  const { rawMarkdown: claudeMarkdown, inputTokens, outputTokens, elapsedMs, usedFallback } =
    await callClaudeForDigest(context);

  // Cost tracking
  const costPerDigest = (inputTokens / 1_000_000) * 3 + (outputTokens / 1_000_000) * 15;
  console.log(
    `[digest-generator] Claude usage — Input: ${inputTokens} tokens, Output: ${outputTokens} tokens, ` +
      `Elapsed: ${elapsedMs}ms, Estimated cost: $${costPerDigest.toFixed(5)}, Fallback: ${usedFallback}`,
  );
  if (inputTokens > 0) {
    console.log(`[digest-generator] At 100 users/week this would cost: $${(costPerDigest * 100).toFixed(2)}`);
  }

  // Use fallback template if Claude failed
  const rawMarkdown = usedFallback
    ? generateFallbackDigest(
        creatorName,
        user.niche_id ?? 'general',
        gapScore.overallScore,
        gapScore.primaryBottleneck,
        gapScore.revenueGap.gapMonthly,
        uncoveredTopics,
        viralVideos,
      )
    : claudeMarkdown;

  // -------------------------------------------------------------------------
  // Step 7: Parse sections
  // -------------------------------------------------------------------------
  const sections = {
    thisWeek: extractSection(rawMarkdown, 'This week'),
    competitorMoves: extractSection(rawMarkdown, 'What your competitors did'),
    videoIdeas: extractSection(rawMarkdown, 'Your 3 video ideas'),
    oneChange: extractSection(rawMarkdown, 'One thing to change this week'),
  };

  const videoIdeasParsed = parseVideoIdeas(sections.videoIdeas);

  // -------------------------------------------------------------------------
  // Step 8: Save to digests table
  // -------------------------------------------------------------------------
  const weekStart = new Date();
  weekStart.setDate(weekStart.getDate() - weekStart.getDay());
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
      usedFallback,
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
  // Step 9: Return DigestResult
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
// Multi-niche test helper — calls Claude directly with hardcoded data
// ---------------------------------------------------------------------------

async function testNicheDigest(
  label: string,
  context: DigestContext,
  expectKeywords: string[],
): Promise<void> {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`NICHE TEST: ${label}`);
  console.log('='.repeat(60));

  const { rawMarkdown, usedFallback, elapsedMs } = await callClaudeForDigest(context);

  if (!rawMarkdown) {
    console.log('RESULT: Fallback triggered (Claude unavailable or short response)');
    return;
  }

  console.log(`Elapsed: ${elapsedMs}ms | Fallback: ${usedFallback}`);
  console.log('\n--- Raw Digest ---\n');
  console.log(rawMarkdown);

  console.log('\n--- Keyword checks ---');
  for (const kw of expectKeywords) {
    const found = rawMarkdown.toLowerCase().includes(kw.toLowerCase());
    console.log(`${found ? 'PASS' : 'FAIL'}: contains "${kw}"`);
  }
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

// ---------------------------------------------------------------------------
// NICHE TEST — run via: RUN_NICHE_TEST=true npx tsx --env-file=.env.local lib/digest-generator.ts
// Tests digest quality for 3 different niches with hardcoded data.
// ---------------------------------------------------------------------------

if (process.env.RUN_NICHE_TEST === 'true') {
  (async () => {
    console.log('=== Multi-Niche Digest Quality Test ===\n');

    // -----------------------------------------------------------------
    // Test 1: Finance channel — 45K subs, low CTR, high-CPM niche
    // -----------------------------------------------------------------
    const financeContext: DigestContext = {
      creatorName: 'MoneyClarity',
      niche: 'finance',
      channelStats: {
        subscriberCount: 45_000,
        avgViewsPerVideo: 8_400,
        ctr: '1.8%',
        avgWatchTime: '7m 12s',
        uploadsPerMonth: '3.0',
        estimatedMonthlyRevenue: 320,
      },
      bestVideos: [
        { title: 'How I Saved $10,000 in One Year', views: 52_000 },
        { title: 'Roth IRA Explained for Beginners', views: 34_200 },
        { title: 'My Monthly Budget Breakdown', views: 29_800 },
      ],
      worstVideos: [
        { title: 'Q&A: Your Personal Finance Questions Answered', views: 1_200 },
        { title: 'Checking In — Channel Update', views: 980 },
        { title: 'What I Bought at Costco This Month', views: 2_100 },
      ],
      postingDayPattern: 'Tuesday',
      overallGapScore: 62,
      gapBreakdown: {
        views: 'Your avg views (8,400) are 57% below Finance With Sarah (19,600)',
        ctr: 'Your CTR (1.8%) is 44% below Tier 1 average (3.2%)',
        watchTime: 'Your avg watch time (7m 12s) is within 15% of Tier 1 — strong',
        uploadFrequency: 'You post 3x/month vs Tier 1 average 6x/month',
      },
      biggestOpportunity: 'Your thumbnail CTR is 44% below Tier 1 average — fixing this alone could double your impressions-to-views conversion',
      revenueGap: {
        userMonthly: 320,
        competitorAvg: 1_840,
        gapMonthly: 1_520,
      },
      topCompetitors: [
        { name: 'Finance With Sarah', subscribers: 112_000, avgViews: 19_600, uploadsPerMonth: 6 },
        { name: 'Money With Marcus', subscribers: 89_000, avgViews: 15_200, uploadsPerMonth: 5 },
        { name: 'Smart Money Moves', subscribers: 67_000, avgViews: 11_800, uploadsPerMonth: 4 },
      ],
      viralVideosThisWeek: [
        { title: 'I Invested $1,000 in 10 Different Stocks — Here\'s What Happened', channelName: 'Finance With Sarah', viewCount: 184_000, performanceVsAvg: 9.4 },
        { title: 'Why Your 401k Is Silently Losing You Money', channelName: 'Money With Marcus', viewCount: 67_200, performanceVsAvg: 4.4 },
      ],
      uncoveredTopics: [
        { topic: 'passive income with dividend stocks', competitorCoverage: 3, searchDemand: 'high', suggestedAngle: 'How I built $200/month passive income starting with $5,000 in dividend ETFs' },
        { topic: 'house hacking and real estate investing', competitorCoverage: 2, searchDemand: 'high', suggestedAngle: 'I house hacked my first duplex at 28 — here\'s exactly how I paid down my mortgage' },
        { topic: 'tax-loss harvesting for beginners', competitorCoverage: 2, searchDemand: 'medium', suggestedAngle: 'The $2,000 tax deduction most investors don\'t take — tax-loss harvesting explained' },
      ],
    };

    // -----------------------------------------------------------------
    // Test 2: Gaming channel — 80K subs, high views, low-CPM niche
    // -----------------------------------------------------------------
    const gamingContext: DigestContext = {
      creatorName: 'PixelRush',
      niche: 'gaming',
      channelStats: {
        subscriberCount: 80_000,
        avgViewsPerVideo: 24_000,
        ctr: '4.2%',
        avgWatchTime: '8m 45s',
        uploadsPerMonth: '4.0',
        estimatedMonthlyRevenue: 480,
      },
      bestVideos: [
        { title: 'I Survived 100 Days in Hardcore Minecraft — Full Story', views: 312_000 },
        { title: 'The BEST Elden Ring Build Nobody Is Talking About', views: 98_000 },
        { title: 'I Played Every Resident Evil Game in Order — Ranked', views: 54_000 },
      ],
      worstVideos: [
        { title: 'My Gaming Setup Tour 2024', views: 8_200 },
        { title: 'Playing a Game I\'ve Never Heard Of', views: 6_700 },
        { title: 'Viewer Game Recommendations — Let\'s Play', views: 5_100 },
      ],
      postingDayPattern: 'Saturday',
      overallGapScore: 48,
      gapBreakdown: {
        views: 'Your avg views (24,000) are 22% below Tier 1 average (30,700)',
        ctr: 'Your CTR (4.2%) matches Tier 1 average — strong performance',
        watchTime: 'Your avg watch time (8m 45s) is 18% below Tier 1 (10m 40s)',
        uploadFrequency: 'You post 4x/month vs Tier 1 average 12x/month — biggest gap',
      },
      biggestOpportunity: 'Upload frequency is your biggest gap — Tier 1 competitors post 12x/month vs your 4x, suppressing your browse feed and suggested video ranking significantly',
      revenueGap: {
        userMonthly: 480,
        competitorAvg: 1_140,
        gapMonthly: 660,
      },
      topCompetitors: [
        { name: 'NightOwlGames', subscribers: 210_000, avgViews: 35_400, uploadsPerMonth: 14 },
        { name: 'CriticalHit', subscribers: 145_000, avgViews: 29_800, uploadsPerMonth: 11 },
        { name: 'SpeedRun Society', subscribers: 98_000, avgViews: 27_000, uploadsPerMonth: 10 },
      ],
      viralVideosThisWeek: [
        { title: 'Beating Elden Ring With Only Starting Equipment — No Deaths', channelName: 'NightOwlGames', viewCount: 1_200_000, performanceVsAvg: 33.9 },
        { title: 'I Let AI Design My Minecraft House — It Was Terrible', channelName: 'CriticalHit', viewCount: 340_000, performanceVsAvg: 11.4 },
      ],
      uncoveredTopics: [
        { topic: 'AI-generated gaming challenges', competitorCoverage: 3, searchDemand: 'high', suggestedAngle: 'I let ChatGPT build my entire Minecraft base — then tried to survive in it' },
        { topic: 'impossible challenge runs', competitorCoverage: 4, searchDemand: 'high', suggestedAngle: 'Beating Dark Souls using only the starting sword — a no-upgrade challenge run' },
        { topic: 'gaming history deep dives', competitorCoverage: 2, searchDemand: 'medium', suggestedAngle: 'The forgotten game that invented the battle royale genre — 10 years before PUBG' },
      ],
    };

    // -----------------------------------------------------------------
    // Test 3: Cooking channel — 22K subs, good retention, medium-CPM
    // -----------------------------------------------------------------
    const cookingContext: DigestContext = {
      creatorName: 'PlateIt Right',
      niche: 'cooking',
      channelStats: {
        subscriberCount: 22_000,
        avgViewsPerVideo: 11_200,
        ctr: '3.6%',
        avgWatchTime: '9m 22s',
        uploadsPerMonth: '5.0',
        estimatedMonthlyRevenue: 290,
      },
      bestVideos: [
        { title: 'I Made Gordon Ramsay\'s Beef Wellington — Honest Review', views: 87_000 },
        { title: '30-Minute Meals That Actually Taste Good', views: 54_000 },
        { title: 'The One Pan Pasta Trick Italian Chefs Don\'t Want You to Know', views: 41_000 },
      ],
      worstVideos: [
        { title: 'My Kitchen Gadget Collection', views: 2_100 },
        { title: 'Grocery Haul — What I Bought This Week', views: 1_800 },
        { title: 'Testing Weird Kitchen TikToks', views: 3_200 },
      ],
      postingDayPattern: 'Wednesday',
      overallGapScore: 54,
      gapBreakdown: {
        views: 'Your avg views (11,200) are 38% below Tier 1 average (18,000)',
        ctr: 'Your CTR (3.6%) is 25% below Tier 1 average (4.8%)',
        watchTime: 'Your avg watch time (9m 22s) is 8% below Tier 1 — nearly at parity',
        uploadFrequency: 'You post 5x/month vs Tier 1 average 8x/month',
      },
      biggestOpportunity: 'Your views gap (38% below Tier 1) is the primary drag — your retention is strong at 9m 22s, meaning the recipe content works but discoverability is the bottleneck',
      revenueGap: {
        userMonthly: 290,
        competitorAvg: 870,
        gapMonthly: 580,
      },
      topCompetitors: [
        { name: 'Chef\'s Kitchen', subscribers: 58_000, avgViews: 20_400, uploadsPerMonth: 9 },
        { name: 'Weeknight Wonders', subscribers: 41_000, avgViews: 17_200, uploadsPerMonth: 8 },
        { name: 'Home Plate Cooking', subscribers: 29_000, avgViews: 16_400, uploadsPerMonth: 7 },
      ],
      viralVideosThisWeek: [
        { title: 'I Ate at 5 Michelin Star Restaurants — Honest Ranking', channelName: "Chef's Kitchen", viewCount: 420_000, performanceVsAvg: 20.6 },
        { title: 'The $5 Dinner That Made Me Stop Ordering Takeout', channelName: 'Weeknight Wonders', viewCount: 180_000, performanceVsAvg: 10.5 },
      ],
      uncoveredTopics: [
        { topic: 'restaurant-quality meals at home on a budget', competitorCoverage: 3, searchDemand: 'high', suggestedAngle: 'I recreated a $42 restaurant steak dinner for $9 at home — the exact technique' },
        { topic: 'meal prep for the full week in one session', competitorCoverage: 2, searchDemand: 'high', suggestedAngle: 'I prep all 21 meals on Sunday in 2 hours — full system revealed' },
        { topic: 'one-ingredient upgrades to basic dishes', competitorCoverage: 2, searchDemand: 'medium', suggestedAngle: 'Adding miso to butter changed how I cook forever — the one-ingredient upgrade list' },
      ],
    };

    // Run all 3 niche tests
    await testNicheDigest(
      'Finance (45K subs, high CPM, low CTR)',
      financeContext,
      ['cpm', 'revenue', 'ctr', '$', 'monetiz'],
    );

    await testNicheDigest(
      'Gaming (80K subs, low CPM, low upload frequency)',
      gamingContext,
      ['upload', 'frequenc', 'post', 'views', 'browse'],
    );

    await testNicheDigest(
      'Cooking (22K subs, good retention, medium CPM)',
      cookingContext,
      ['retention', 'watch time', 'discoverabilit', 'thumbnail', 'views'],
    );

    console.log('\n=== Multi-Niche Test Complete ===');
  })();
}
