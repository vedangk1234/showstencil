/**
 * lib/niche-engine.ts
 * Niche detection (via Claude) and competitor discovery (via YouTube search).
 *
 * Two expensive operations:
 *   - detectNiche: calls claude-sonnet-4-6, costs ~$0.001 per call. Cached in DB.
 *   - findCompetitors: 101 YouTube Data API quota units per call (100 search + 1 channels).
 *
 * Always pass userId to detectNiche so the result is cached and we skip Claude on repeat calls.
 */

import { config } from 'dotenv'
config({ path: '.env.local', override: true })

import Anthropic from '@anthropic-ai/sdk';
import { createServiceClient } from '@/lib/supabase';
import { getCompetitorFullProfile, getRecentVideos } from '@/lib/youtube-data';
import { calculateCompetitorMetrics } from '@/lib/competitor-metrics';
import { updateCompetitorMetrics, saveCompetitorSnapshot } from '@/lib/db';
import { detectSubNiche } from '@/lib/sub-niche-detector';
import type { NicheResult, CompetitorCandidate } from '@/types';

const BASE_URL = 'https://www.googleapis.com/youtube/v3';

function apiKey(): string {
  const key = process.env.YOUTUBE_API_KEY;
  if (!key) throw new Error('YOUTUBE_API_KEY is not set');
  return key;
}

// ---------------------------------------------------------------------------
// Niche metadata
// ---------------------------------------------------------------------------

const VALID_NICHE_IDS = [
  'finance', 'tech', 'gaming', 'cooking', 'fitness',
  'beauty', 'travel', 'education', 'business', 'entertainment', 'diy', 'vlog',
] as const;

type ValidNicheId = (typeof VALID_NICHE_IDS)[number];

function isValidNicheId(id: string): id is ValidNicheId {
  return VALID_NICHE_IDS.includes(id as ValidNicheId);
}

const NICHE_DISPLAY_NAMES: Record<ValidNicheId, string> = {
  finance:       'Personal Finance',
  tech:          'Technology',
  gaming:        'Gaming',
  cooking:       'Cooking',
  fitness:       'Fitness',
  beauty:        'Beauty',
  travel:        'Travel',
  education:     'Education',
  business:      'Business',
  entertainment: 'Entertainment',
  diy:           'DIY',
  vlog:          'Vlog',
};

// Search queries calibrated to find US-based relevant channels.
const NICHE_SEARCH_QUERIES: Record<ValidNicheId, string> = {
  finance:       'personal finance investing money USA',
  tech:          'technology software programming USA',
  gaming:        'gaming youtube USA',
  cooking:       'cooking recipes food USA',
  fitness:       'fitness workout health USA',
  beauty:        'beauty makeup skincare USA',
  travel:        'travel vlog USA',
  education:     'education learning USA',
  business:      'business entrepreneur USA',
  entertainment: 'entertainment youtube USA',
  diy:           'DIY home improvement USA',
  vlog:          'vlog daily life USA',
};

// ---------------------------------------------------------------------------
// Function 1 — detectNiche
// ---------------------------------------------------------------------------

/**
 * Classifies a YouTube creator into one of 12 niches using Claude.
 * Pass userId to enable DB caching — the Claude call is skipped if niche_id
 * is already stored for that user.
 *
 * @quota 0 units (YouTube) / ~500 Claude input tokens per call
 * @param videoTitles  User's last 20 video titles
 * @param descriptions User's last 20 video descriptions (partial text is fine)
 * @param userId       If provided: checks DB cache first, saves result after classification
 */
export async function detectNiche(
  videoTitles: string[],
  descriptions: string[],
  userId?: string,
): Promise<NicheResult> {
  // --- Cache check ---
  if (userId) {
    try {
      const supabase = createServiceClient();
      const { data } = await supabase
        .from('users')
        .select('niche_id')
        .eq('id', userId)
        .single();

      if (data?.niche_id && isValidNicheId(data.niche_id)) {
        console.log(
          `[niche-engine] detectNiche: cache hit — "${data.niche_id}" for user ${userId}`,
        );
        return {
          nicheId: data.niche_id,
          nicheName: NICHE_DISPLAY_NAMES[data.niche_id],
          confidence: 1,
          reasoning: 'Loaded from cache.',
        };
      }
    } catch (err) {
      // Cache miss errors are non-fatal — fall through to Claude
      console.warn('[niche-engine] detectNiche: cache check failed, falling through to Claude:', err);
    }
  }

  // --- Build Claude prompt ---
  const titlesText = videoTitles
    .slice(0, 20)
    .map((t, i) => `${i + 1}. ${t}`)
    .join('\n');

  const descriptionsText = descriptions
    .slice(0, 5)
    .map((d, i) => `${i + 1}. ${d.slice(0, 200)}`)
    .join('\n');

  const prompt = `You are classifying a YouTube channel into exactly one niche based on their video titles and descriptions.

Valid niche IDs — you MUST return exactly one of these 12 values:
- finance    (personal finance, investing, budgeting, money, stocks, crypto, taxes)
- tech       (technology, gadgets, software, programming, AI, reviews, unboxing)
- gaming     (video games, walkthroughs, gaming news, esports, game reviews)
- cooking    (recipes, food, meal prep, baking, restaurant reviews, cuisine)
- fitness    (workouts, exercise, gym, nutrition, weight loss, yoga, running)
- beauty     (makeup, skincare, hair, fashion, style, tutorials, product reviews)
- travel     (travel vlogs, destinations, hotels, flights, adventures, tourism)
- education  (tutorials, explainers, how-to, science, history, languages, skills)
- business   (entrepreneurship, startups, marketing, productivity, career, real estate)
- entertainment (comedy, skits, reaction videos, news commentary, celebrity)
- diy        (home improvement, crafts, woodworking, repairs, making things)
- vlog       (daily life, personal stories, lifestyle, family, behind the scenes)

Example videos per niche to calibrate your judgment:
- finance: "How I Saved $50K in 2 Years" / "Best Index Funds for Beginners" / "My Roth IRA Strategy"
- tech: "iPhone 16 Pro Review" / "I Built a PC for $500" / "ChatGPT vs Claude: Full Comparison"
- gaming: "Elden Ring Full Walkthrough" / "Best Weapons in Fortnite Season 5" / "I Hit Grandmaster in League"
- cooking: "Gordon Ramsay's Butter Chicken Recipe" / "30 Minute Dinner Ideas" / "I Made Julia Child's Boeuf Bourguignon"
- fitness: "Full Body Workout No Equipment" / "What I Eat in a Day (Cutting)" / "How I Lost 30 Pounds in 6 Months"
- beauty: "Full Glam Makeup Tutorial" / "My 10-Step Korean Skincare Routine" / "Drugstore Dupes for High-End Products"
- travel: "7 Days in Japan on $100/Day" / "Hidden Gems in Southeast Asia" / "Honest Review: Maldives Overwater Bungalow"
- education: "Why the Roman Empire Actually Fell" / "Learn Python in 1 Hour" / "How Black Holes Actually Work"
- business: "How I Built a $10K/Month Side Hustle" / "What VCs Actually Look For" / "Best Productivity Apps for 2024"
- entertainment: "I Tried Every McDonald's Menu Item" / "Reacting to Viral TikToks" / "Worst Movies on Netflix Ranked"
- diy: "Building a Garden Shed from Scratch" / "How to Rewire a Light Switch" / "Epoxy Resin Table Build"
- vlog: "Day in My Life as a Software Engineer" / "Moving to NYC: Week 1" / "Our Pregnancy Announcement"

Video titles to classify:
${titlesText}

Recent descriptions (partial):
${descriptionsText}

Respond with ONLY a JSON object — no other text, no markdown fences:
{
  "nicheId": "<one of the 12 valid niche IDs>",
  "confidence": <number between 0 and 1>,
  "reasoning": "<one sentence explaining the classification>"
}`;

  // --- Call Claude ---
  try {
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 256,
      temperature: 0.2, // low temperature — this is classification, not creative writing
      messages: [{ role: 'user', content: prompt }],
    });

    const rawText =
      message.content[0].type === 'text' ? message.content[0].text.trim() : '';

    let parsed: { nicheId: string; confidence: number; reasoning: string };
    try {
      parsed = JSON.parse(rawText);
    } catch {
      console.error('[niche-engine] detectNiche: failed to parse Claude JSON:', rawText);
      return defaultNiche('Failed to parse Claude response');
    }

    // Validate and normalise
    const nicheId: ValidNicheId = isValidNicheId(parsed.nicheId)
      ? parsed.nicheId
      : 'entertainment';

    if (!isValidNicheId(parsed.nicheId)) {
      console.warn(
        `[niche-engine] detectNiche: Claude returned unknown nicheId "${parsed.nicheId}", defaulting to "entertainment"`,
      );
    }

    const result: NicheResult = {
      nicheId,
      nicheName: NICHE_DISPLAY_NAMES[nicheId],
      confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0.5,
      reasoning: parsed.reasoning ?? '',
    };

    console.log(
      `[niche-engine] detectNiche: classified as "${nicheId}" (confidence: ${result.confidence})`,
    );

    // Persist to DB if userId provided
    if (userId) {
      await saveDetectedNiche(userId, nicheId);
    }

    return result;
  } catch (err) {
    console.error('[niche-engine] detectNiche: Claude API error:', err);
    return defaultNiche('Claude API error');
  }
}

function defaultNiche(reason: string): NicheResult {
  return {
    nicheId: 'entertainment',
    nicheName: NICHE_DISPLAY_NAMES.entertainment,
    confidence: 0,
    reasoning: `Defaulted to entertainment: ${reason}`,
  };
}

// ---------------------------------------------------------------------------
// Function 2 — findCompetitors
// ---------------------------------------------------------------------------

/**
 * Finds YouTube channels in the same niche within a subscriber range.
 * Primary range: 0.5x–3x user's sub count.
 * If no results, widens to 0.2x–5x and retries once.
 *
 * AUTO-DETECTION IS ONE-TIME: This function is called exactly once per user —
 * during the initial onboarding sync when no auto-detected competitors exist yet.
 * After that, the daily refresh-data cron updates competitor data in-place.
 * No API route re-runs findCompetitors for existing users.
 *
 * @quota 101 YouTube Data API units per attempt (100 search.list + 1 channels.list)
 * @param nicheId       One of the 12 valid niche IDs
 * @param userSubCount  User's current subscriber count
 * @param userChannelId User's own channel ID (excluded from results)
 * @returns Up to 5 CompetitorCandidate objects sorted by subscriber count ascending
 */
export async function findCompetitors(
  nicheId: string,
  userSubCount: number,
  userChannelId: string,
): Promise<CompetitorCandidate[]> {
  const query =
    isValidNicheId(nicheId) ? NICHE_SEARCH_QUERIES[nicheId] : nicheId;

  const minSubs = Math.round(userSubCount * 0.5);
  const maxSubs = Math.round(userSubCount * 3);

  console.log(
    `[niche-engine] findCompetitors: searching "${query}", sub range ${minSubs}–${maxSubs}`,
  );

  const results = await searchChannelsInRange(query, userChannelId, minSubs, maxSubs);

  if (results.length > 0) return results;

  // Widen and retry once
  const wideMin = Math.round(userSubCount * 0.2);
  const wideMax = Math.round(userSubCount * 5);
  console.log(
    `[niche-engine] findCompetitors: no results in primary range — widening to ${wideMin}–${wideMax}`,
  );

  return searchChannelsInRange(query, userChannelId, wideMin, wideMax);
}

async function searchChannelsInRange(
  query: string,
  excludeChannelId: string,
  minSubs: number,
  maxSubs: number,
): Promise<CompetitorCandidate[]> {
  // Step 1 — search.list: 100 quota units
  const searchUrl = new URL(`${BASE_URL}/search`);
  searchUrl.searchParams.set('key', apiKey());
  searchUrl.searchParams.set('part', 'snippet');
  searchUrl.searchParams.set('type', 'channel');
  searchUrl.searchParams.set('q', query);
  searchUrl.searchParams.set('maxResults', '20');
  searchUrl.searchParams.set('relevanceLanguage', 'en');

  let channelIds: string[] = [];

  try {
    const searchRes = await fetch(searchUrl.toString());
    if (!searchRes.ok) {
      console.error(
        `[niche-engine] searchChannelsInRange: search.list HTTP ${searchRes.status}`,
      );
      return [];
    }

    const searchData = await searchRes.json();
    channelIds = ((searchData.items ?? []) as { id: { channelId: string } }[])
      .map((item) => item.id.channelId)
      .filter((id) => id && id !== excludeChannelId);
  } catch (err) {
    console.error('[niche-engine] searchChannelsInRange: search.list error:', err);
    return [];
  }

  if (channelIds.length === 0) return [];

  // Step 2 — channels.list: 1 quota unit (fetches subscriber counts)
  const channelsUrl = new URL(`${BASE_URL}/channels`);
  channelsUrl.searchParams.set('key', apiKey());
  channelsUrl.searchParams.set('part', 'snippet,statistics');
  channelsUrl.searchParams.set('id', channelIds.join(','));

  try {
    const channelsRes = await fetch(channelsUrl.toString());
    if (!channelsRes.ok) {
      console.error(
        `[niche-engine] searchChannelsInRange: channels.list HTTP ${channelsRes.status}`,
      );
      return [];
    }

    const channelsData = await channelsRes.json();
    const candidates: CompetitorCandidate[] = [];

    for (const item of channelsData.items ?? []) {
      if (item.id === excludeChannelId) continue;

      const subCount = parseInt(item.statistics?.subscriberCount ?? '0', 10);
      if (subCount < minSubs || subCount > maxSubs) continue;

      candidates.push({
        channelId: item.id,
        channelName: item.snippet?.title ?? '',
        subscriberCount: subCount,
        thumbnailUrl: item.snippet?.thumbnails?.default?.url ?? '',
      });
    }

    // Sort ascending by subscriber count, return top 5
    return candidates.sort((a, b) => a.subscriberCount - b.subscriberCount).slice(0, 5);
  } catch (err) {
    console.error('[niche-engine] searchChannelsInRange: channels.list error:', err);
    return [];
  }
}

// ---------------------------------------------------------------------------
// Function 3 — saveDetectedNiche
// ---------------------------------------------------------------------------

/**
 * Persists a detected niche to the users table.
 * Called automatically by detectNiche when userId is provided.
 *
 * @returns true on success, false on error
 */
export async function saveDetectedNiche(userId: string, nicheId: string): Promise<boolean> {
  const supabase = createServiceClient();

  const { error } = await supabase
    .from('users')
    .update({
      niche_id: nicheId,
      niche_detected_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', userId);

  if (error) {
    console.error('[niche-engine] saveDetectedNiche error:', error.message);
    return false;
  }

  console.log(`[niche-engine] saveDetectedNiche: saved niche "${nicheId}" for user ${userId}`);
  return true;
}

// ---------------------------------------------------------------------------
// Function 4 — searchAllChannelCandidates (internal)
// ---------------------------------------------------------------------------

// Substrings that indicate a non-US channel when found in title or description.
const NON_US_INDICATORS = [
  'australia', 'australian', 'uk ', 'united kingdom', 'british',
  'canada', 'canadian', 'india', 'indian', 'nz ', 'new zealand',
  'sgd', 'aud ', 'gbp ', 'inr ', 'cad ',
];

function isLikelyUSChannel(item: {
  snippet?: { title?: string; description?: string };
}): boolean {
  const text = [
    item.snippet?.title ?? '',
    item.snippet?.description ?? '',
  ].join(' ').toLowerCase();
  return !NON_US_INDICATORS.some((indicator) => text.includes(indicator));
}

/**
 * Searches YouTube for channels matching the query without sub count filtering.
 * Returns all results so detectAndAssignCompetitors can classify them into tiers.
 * US region and language filters are applied; falls back to unfiltered if no US
 * channels survive the geography check.
 *
 * @quota 101 units (100 search.list + 1 channels.list)
 */
async function searchAllChannelCandidates(
  query: string,
  excludeChannelId: string,
): Promise<CompetitorCandidate[]> {
  const searchUrl = new URL(`${BASE_URL}/search`);
  searchUrl.searchParams.set('key', apiKey());
  searchUrl.searchParams.set('part', 'snippet');
  searchUrl.searchParams.set('type', 'channel');
  searchUrl.searchParams.set('q', query);
  searchUrl.searchParams.set('maxResults', '50');
  searchUrl.searchParams.set('regionCode', 'US');
  searchUrl.searchParams.set('relevanceLanguage', 'en');

  let channelIds: string[] = [];

  try {
    const searchRes = await fetch(searchUrl.toString());
    if (!searchRes.ok) {
      console.error(`[niche-engine] searchAllChannelCandidates: search.list HTTP ${searchRes.status}`);
      return [];
    }
    const searchData = await searchRes.json();
    channelIds = ((searchData.items ?? []) as { id: { channelId: string } }[])
      .map((item) => item.id.channelId)
      .filter((id) => id && id !== excludeChannelId);
  } catch (err) {
    console.error('[niche-engine] searchAllChannelCandidates: search.list error:', err);
    return [];
  }

  if (channelIds.length === 0) return [];

  const channelsUrl = new URL(`${BASE_URL}/channels`);
  channelsUrl.searchParams.set('key', apiKey());
  channelsUrl.searchParams.set('part', 'snippet,statistics');
  channelsUrl.searchParams.set('id', channelIds.join(','));

  try {
    const channelsRes = await fetch(channelsUrl.toString());
    if (!channelsRes.ok) {
      console.error(`[niche-engine] searchAllChannelCandidates: channels.list HTTP ${channelsRes.status}`);
      return [];
    }
    const channelsData = await channelsRes.json();

    type RawChannelItem = {
      id: string;
      snippet?: { title?: string; description?: string; thumbnails?: { default?: { url?: string } } };
      statistics?: { subscriberCount?: string };
    };
    const allItems: RawChannelItem[] = (channelsData.items ?? []).filter(
      (item: RawChannelItem) => item.id !== excludeChannelId,
    );

    const usItems = allItems.filter(isLikelyUSChannel);

    // Fall back to all items if geography filter removed everything
    const selectedItems = usItems.length > 0 ? usItems : allItems;
    if (usItems.length === 0 && allItems.length > 0) {
      console.warn(
        `[niche-engine] searchAllChannelCandidates: US filter removed all ${allItems.length} candidates — falling back to unfiltered`,
      );
    } else {
      console.log(
        `[niche-engine] searchAllChannelCandidates: ${usItems.length}/${allItems.length} candidates passed US filter`,
      );
    }

    const candidates: CompetitorCandidate[] = selectedItems.map((item) => ({
      channelId: item.id,
      channelName: item.snippet?.title ?? '',
      subscriberCount: parseInt(item.statistics?.subscriberCount ?? '0', 10),
      thumbnailUrl: item.snippet?.thumbnails?.default?.url ?? '',
    }));

    console.log(`[niche-engine] searchAllChannelCandidates: returning ${candidates.length} candidates`);
    return candidates;
  } catch (err) {
    console.error('[niche-engine] searchAllChannelCandidates: channels.list error:', err);
    return [];
  }
}

// ---------------------------------------------------------------------------
// Activity threshold check (internal)
// ---------------------------------------------------------------------------

/**
 * Returns true only if the channel has published ≥3 videos in the last 30 days
 * AND ≥6 videos in the last 60 days. Inactive channels are never assigned.
 *
 * @quota ~200 units (getRecentVideos makes 2 × search.list calls)
 */
async function meetsActivityThreshold(channelId: string): Promise<boolean> {
  try {
    const videos = await getRecentVideos(channelId, 20);
    if (!videos || videos.length === 0) return false;

    const now = Date.now();
    const thirtyDaysAgo = now - 30 * 24 * 60 * 60 * 1000;
    const sixtyDaysAgo = now - 60 * 24 * 60 * 60 * 1000;

    const last30 = videos.filter(
      (v) => new Date(v.publishedAt).getTime() >= thirtyDaysAgo,
    ).length;

    const last60 = videos.filter(
      (v) => new Date(v.publishedAt).getTime() >= sixtyDaysAgo,
    ).length;

    const passes = last30 >= 3 && last60 >= 6;

    if (!passes) {
      console.log(
        `[niche-engine] ${channelId} failed activity check: ` +
          `${last30} videos in 30d (need 3), ${last60} videos in 60d (need 6)`,
      );
    }

    return passes;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Function 5 — assignCompetitor (internal)
// ---------------------------------------------------------------------------

/**
 * Inserts one competitor row, fetches their full YouTube profile, inserts their
 * videos, and saves metrics + snapshot. Mirrors the pipeline in track/route.ts.
 *
 * @quota ~203 units (getCompetitorFullProfile)
 */
async function assignCompetitor(
  userId: string,
  candidate: CompetitorCandidate,
  tier: 1 | 2 | 3,
): Promise<void> {
  const supabase = createServiceClient();

  const { data: newCompetitor, error } = await supabase
    .from('competitors')
    .insert({
      user_id: userId,
      youtube_channel_id: candidate.channelId,
      channel_name: candidate.channelName,
      channel_thumbnail: candidate.thumbnailUrl,
      subscriber_count: candidate.subscriberCount,
      total_views: null,
      tier,
      is_auto_detected: true,
      is_active: true,
      is_dominator: tier === 3,
      is_searched: false,
      last_synced_at: new Date().toISOString(),
    })
    .select('id')
    .single();

  if (error) {
    throw new Error(`DB insert failed for "${candidate.channelName}": ${error.message}`);
  }

  const competitorId = newCompetitor.id;
  console.log(
    `[niche-engine] assignCompetitor: inserted Tier ${tier} "${candidate.channelName}" (${candidate.subscriberCount} subs) id=${competitorId}`,
  );

  let fullProfile: Awaited<ReturnType<typeof getCompetitorFullProfile>> | null = null;
  try {
    fullProfile = await getCompetitorFullProfile(candidate.channelId);
  } catch (err) {
    console.error(
      `[niche-engine] assignCompetitor: getCompetitorFullProfile failed for "${candidate.channelName}":`,
      err,
    );
  }

  if (!fullProfile) {
    console.warn(
      `[niche-engine] assignCompetitor: no profile for "${candidate.channelName}" — row inserted, data will sync overnight`,
    );
    return;
  }

  const velocityMap = new Map(fullProfile.velocityData.videos.map((v) => [v.videoId, v]));
  const channelAvgViews = fullProfile.velocityData.channelAvgViews;

  const videoRows = fullProfile.recentVideos.map((video) => {
    const vel = velocityMap.get(video.videoId);
    const performanceVsAvg =
      channelAvgViews > 0
        ? Math.round((video.viewCount / channelAvgViews) * 100) / 100
        : 1;
    return {
      competitor_id: competitorId,
      youtube_video_id: video.videoId,
      title: video.title,
      published_at: video.publishedAt,
      view_count: video.viewCount,
      like_count: video.likeCount,
      comment_count: video.commentCount,
      duration_seconds: video.duration,
      thumbnail_url: video.thumbnailHighRes || video.thumbnailDefault || null,
      velocity_score: vel?.velocityScore ?? null,
      performance_vs_avg: performanceVsAvg,
      is_viral: vel?.isViral ?? false,
    };
  });

  if (videoRows.length > 0) {
    await supabase.from('competitor_videos').delete().eq('competitor_id', competitorId);
    const { error: videoError } = await supabase.from('competitor_videos').insert(videoRows);
    if (videoError) {
      console.error(
        `[niche-engine] assignCompetitor: video insert failed for "${candidate.channelName}":`,
        videoError.message,
      );
    } else {
      console.log(
        `[niche-engine] assignCompetitor: inserted ${videoRows.length} videos for "${candidate.channelName}"`,
      );
    }
  }

  // Detect sub-niche immediately from saved video titles
  if (videoRows.length >= 3) {
    try {
      const videoTitles = videoRows.map((v) => ({ title: v.title ?? '', description: null }));
      const subNicheResult = await detectSubNiche(videoTitles);
      if (subNicheResult && subNicheResult.sub_niche !== 'General') {
        await supabase
          .from('competitors')
          .update({
            sub_niche: subNicheResult.sub_niche,
            sub_niche_keywords: subNicheResult.keywords,
            sub_niche_match_score: subNicheResult.confidence,
          })
          .eq('id', competitorId);
        console.log(
          `[niche-engine] assignCompetitor: sub-niche detected for "${candidate.channelName}": ${subNicheResult.sub_niche}`,
        );
      }
    } catch (err) {
      console.error('[niche-engine] assignCompetitor: sub-niche detection failed:', err);
      // Never block competitor assignment because of sub-niche failure
    }
  }

  const metrics = calculateCompetitorMetrics(videoRows, fullProfile.channel.videoCount);

  await updateCompetitorMetrics(competitorId, {
    video_count: metrics.video_count,
    avg_views_per_video: metrics.avg_views_per_video,
    avg_video_length_seconds: metrics.avg_video_length_seconds,
    upload_frequency_30d: metrics.upload_frequency_30d,
    subscriber_count: fullProfile.channel.subscriberCount,
    total_views: fullProfile.channel.totalViews,
    last_synced_at: new Date().toISOString(),
  });

  await saveCompetitorSnapshot(competitorId, {
    subscriber_count: fullProfile.channel.subscriberCount,
    total_views: fullProfile.channel.totalViews,
    video_count: metrics.video_count,
    avg_views_per_video: metrics.avg_views_per_video,
    avg_video_length_seconds: metrics.avg_video_length_seconds,
    upload_frequency_30d: metrics.upload_frequency_30d,
    velocity_score_avg: metrics.velocity_score_avg,
  });

  console.log(
    `[niche-engine] assignCompetitor: Tier ${tier} "${candidate.channelName}" fully populated — ${videoRows.length} videos, metrics saved`,
  );
}

// ---------------------------------------------------------------------------
// Function 6 — detectAndAssignCompetitors (exported)
// ---------------------------------------------------------------------------

/**
 * One-time orchestrator: finds exactly 1 Tier 1, 1 Tier 2, and 1 Dominator
 * competitor for a user, then inserts them with full video data.
 *
 * Called from /api/sync when the user has 0 active auto-detected competitors.
 * Never throws — partial results are saved and logged.
 *
 * Tier definitions (ratio = competitorSubs / userSubs):
 *   Tier 1: 0.5x – 3x   (peer comparison)
 *   Tier 2: 3x – 10x    (aspirational)
 *   Tier 3 / Dominator: >10x (niche ceiling)
 *
 * @quota ~101 (initial search) + up to 3 × 203 (full profile each) ≈ 710 units total
 */
export async function detectAndAssignCompetitors(
  userId: string,
  nicheId: string | null,
  userSubscriberCount: number,
): Promise<void> {
  if (!nicheId || !isValidNicheId(nicheId)) {
    console.warn(
      `[niche-engine] detectAndAssignCompetitors: invalid nicheId "${nicheId}" for user ${userId} — skipping`,
    );
    return;
  }

  const supabase = createServiceClient();
  const query = NICHE_SEARCH_QUERIES[nicheId];

  const { data: userData } = await supabase
    .from('users')
    .select('youtube_channel_id')
    .eq('id', userId)
    .single();

  const userChannelId = userData?.youtube_channel_id ?? '';

  const { data: existingRows } = await supabase
    .from('competitors')
    .select('youtube_channel_id, tier, is_auto_detected, is_active')
    .eq('user_id', userId);

  const existingChannelIds = new Set(
    (existingRows ?? []).map((r) => r.youtube_channel_id as string),
  );

  // Which tiers are already covered by active auto-detected competitors
  const filledTiers = new Set(
    (existingRows ?? [])
      .filter((r) => r.is_auto_detected && r.is_active && r.tier != null)
      .map((r) => r.tier as number),
  );
  console.log(`[niche-engine] detectAndAssignCompetitors: filled tiers = [${[...filledTiers].join(',')}]`);

  console.log(
    `[niche-engine] detectAndAssignCompetitors: user ${userId}, niche "${nicheId}", userSubs ${userSubscriberCount}`,
  );

  const allCandidates = await searchAllChannelCandidates(query, userChannelId);

  if (allCandidates.length === 0) {
    console.warn(
      `[niche-engine] detectAndAssignCompetitors: no candidates found for query "${query}"`,
    );
    return;
  }

  const eligible = allCandidates.filter(
    (c) =>
      c.channelId !== userChannelId &&
      !existingChannelIds.has(c.channelId) &&
      c.subscriberCount >= 1000,
  );

  const tier1Pool = eligible.filter((c) => {
    const ratio = c.subscriberCount / userSubscriberCount;
    return ratio >= 0.5 && ratio <= 3;
  });
  const tier2Pool = eligible.filter((c) => {
    const ratio = c.subscriberCount / userSubscriberCount;
    return ratio > 3 && ratio <= 10;
  });
  const dominatorPool = eligible.filter(
    (c) => c.subscriberCount / userSubscriberCount > 10,
  );

  const target1 = userSubscriberCount * 2;
  const sortedTier1 = [...tier1Pool].sort(
    (a, b) => Math.abs(a.subscriberCount - target1) - Math.abs(b.subscriberCount - target1),
  );
  let bestTier1: CompetitorCandidate | null = null;
  for (const candidate of sortedTier1) {
    const active = await meetsActivityThreshold(candidate.channelId);
    if (active) { bestTier1 = candidate; break; }
  }

  const target2 = userSubscriberCount * 5;
  const sortedTier2 = [...tier2Pool].sort(
    (a, b) => Math.abs(a.subscriberCount - target2) - Math.abs(b.subscriberCount - target2),
  );
  let bestTier2: CompetitorCandidate | null = null;
  for (const candidate of sortedTier2) {
    const active = await meetsActivityThreshold(candidate.channelId);
    if (active) { bestTier2 = candidate; break; }
  }

  const sortedDom = [...dominatorPool].sort((a, b) => b.subscriberCount - a.subscriberCount);
  let bestDom: CompetitorCandidate | null = null;
  for (const candidate of sortedDom) {
    const active = await meetsActivityThreshold(candidate.channelId);
    if (active) { bestDom = candidate; break; }
  }

  if (!bestTier1)
    console.warn(
      `[niche-engine] detectAndAssignCompetitors: no active Tier 1 candidate (need ${Math.round(userSubscriberCount * 0.5)}–${Math.round(userSubscriberCount * 3)} subs, ≥3 videos/30d)`,
    );
  if (!bestTier2)
    console.warn(
      `[niche-engine] detectAndAssignCompetitors: no active Tier 2 candidate (need ${Math.round(userSubscriberCount * 3)}–${Math.round(userSubscriberCount * 10)} subs, ≥3 videos/30d)`,
    );
  if (!bestDom)
    console.warn(
      `[niche-engine] detectAndAssignCompetitors: no active Dominator candidate (need >${Math.round(userSubscriberCount * 10)} subs, ≥3 videos/30d)`,
    );

  const toAssign: { candidate: CompetitorCandidate; tier: 1 | 2 | 3 }[] = [];
  if (bestTier1 && !filledTiers.has(1)) toAssign.push({ candidate: bestTier1, tier: 1 });
  if (bestTier2 && !filledTiers.has(2)) toAssign.push({ candidate: bestTier2, tier: 2 });
  if (bestDom && !filledTiers.has(3)) toAssign.push({ candidate: bestDom, tier: 3 });

  if (toAssign.length === 0) {
    console.warn(
      `[niche-engine] detectAndAssignCompetitors: no candidates in any tier for user ${userId}`,
    );
    return;
  }

  console.log(
    `[niche-engine] detectAndAssignCompetitors: assigning ${toAssign.length} competitors — ${toAssign.map((x) => `Tier${x.tier}: ${x.candidate.channelName} (${x.candidate.subscriberCount} subs)`).join(', ')}`,
  );

  const results = await Promise.allSettled(
    toAssign.map(({ candidate, tier }) => assignCompetitor(userId, candidate, tier)),
  );

  results.forEach((result, i) => {
    if (result.status === 'rejected') {
      console.error(
        `[niche-engine] detectAndAssignCompetitors: Tier ${toAssign[i].tier} assignment failed:`,
        result.reason,
      );
    }
  });

  const succeeded = results.filter((r) => r.status === 'fulfilled').length;
  console.log(
    `[niche-engine] detectAndAssignCompetitors: done — ${succeeded}/${toAssign.length} competitors assigned for user ${userId}`,
  );

  // Fire-and-forget: trigger refresh-data immediately so videos, metrics, and snapshots
  // populate for all new competitors without waiting for the 3am cron.
  // Never blocks the sync response — errors are logged only.
  if (succeeded > 0) {
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';
    const cronSecret = process.env.CRON_SECRET ?? '';
    fetch(`${appUrl}/api/cron/refresh-data`, {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${cronSecret}` },
    }).then((res) => {
      console.log(`[niche-engine] Immediate competitor sync triggered: ${res.status}`);
    }).catch((err) => {
      console.error(`[niche-engine] Failed to trigger immediate competitor sync:`, err);
    });
  }
}

// TEST — remove before prod
// Run via: RUN_NICHE_TEST=true ANTHROPIC_API_KEY=... YOUTUBE_API_KEY=... npx tsx lib/niche-engine.ts
// Note: requires tsconfig paths plugin (e.g. tsconfig-paths) to resolve @/ aliases.
if (process.env.RUN_NICHE_TEST === 'true') {
  (async () => {
    console.log('=== Niche Engine Test ===\n');

    // Test 1: detectNiche — should return "finance"
    console.log('--- Test 1: detectNiche (finance titles, no userId) ---');
    const sampleTitles = [
      'How I Invested My First $1,000 in Index Funds',
      'Roth IRA vs Traditional IRA: Which Is Better in 2024?',
      'I Paid Off $40,000 in Student Loans in 18 Months',
      'The 50/30/20 Budget Rule Explained',
      'How to Build a 6-Month Emergency Fund Fast',
    ];
    const sampleDescriptions = [
      'In this video I break down exactly how I started investing with just $1,000...',
      'The age-old debate: Roth vs Traditional. I run the actual numbers for different income levels...',
      'My aggressive debt payoff journey — every sacrifice I made and whether it was worth it...',
      'Simple budgeting that actually works for most people starting from zero...',
      'Step by step guide to building your emergency fund even on a tight budget...',
    ];

    const nicheResult = await detectNiche(sampleTitles, sampleDescriptions);
    console.log('Result:', JSON.stringify(nicheResult, null, 2));
    console.log(
      'PASS:',
      nicheResult.nicheId === 'finance' ? '✓ returned "finance"' : `✗ expected "finance", got "${nicheResult.nicheId}"`,
    );

    // Test 2: findCompetitors — should return channels with channelId and channelName
    console.log('\n--- Test 2: findCompetitors("finance", 50000, "fake_channel_id") ---');
    console.log('(costs 101 YouTube Data API quota units)');
    const competitors = await findCompetitors('finance', 50000, 'fake_channel_id');
    console.log(`Found ${competitors.length} competitor(s)`);
    if (competitors.length > 0) {
      console.log('First result:', JSON.stringify(competitors[0], null, 2));
      const first = competitors[0];
      console.log(
        'PASS:',
        first.channelId && first.channelName
          ? '✓ has channelId and channelName'
          : '✗ missing channelId or channelName',
      );
    } else {
      console.log('No competitors found — check YOUTUBE_API_KEY and quota, or widen sub range.');
    }

    console.log('\n=== Test Complete ===');
  })();
}
