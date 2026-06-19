/**
 * lib/niche-engine.ts
 * Niche detection (via Claude) and competitor discovery (via YouTube search).
 *
 * Two expensive operations:
 *   - detectNiche: calls claude-sonnet-4-6, costs ~$0.001 per call. Cached in DB.
 *   - findCompetitors: 101 YouTube Data API quota units per call (100 search + 1 channels).
 *
 * Always pass userId to detectNiche so the result is cached and we skip Claude on repeat calls.
 *
 * Phase 3 (2026-06-09) — taxonomy migrated from a hardcoded 12-niche list to the
 * 31-niche taxonomy in lib/niches.ts. The Claude prompt was rewritten. The silent
 * confidence-0 fallback to 'entertainment' was removed entirely: when Claude cannot
 * classify confidently, detectNiche now returns nicheSlug=null and
 * requiresManualSelection=true so that callers can surface the manual picker UI.
 */

import { config } from 'dotenv'
config({ path: '.env.local', override: true })

import Anthropic from '@anthropic-ai/sdk';
import { createServiceClient } from '@/lib/supabase';
import { getCompetitorFullProfile, getRecentVideos } from '@/lib/youtube-data';
import { calculateCompetitorMetrics } from '@/lib/competitor-metrics';
import { updateCompetitorMetrics, saveCompetitorSnapshot } from '@/lib/db';
import { detectSubNiche } from '@/lib/sub-niche-detector';
import { logError } from '@/lib/logger';
import {
  VALID_NICHE_SLUGS,
  type ValidNicheSlug,
  isValidNicheSlug,
  getNicheBySlug,
  getSubNicheBySlug,
  getDisplayName,
  NICHES,
} from '@/lib/niches';
import type { NicheResult, CompetitorCandidate } from '@/types';

const BASE_URL = 'https://www.googleapis.com/youtube/v3';

// Manual-selection sentinel stored in users.niche_id when the user picks "Other".
// Not a valid taxonomy slug — handled as a special case in the cache path and in
// saveManualNicheSelection's validation. Downstream slug-keyed lookups treat
// 'other' the same as an unknown slug (i.e. fall through to fallback behaviour).
export const NICHE_OTHER_SENTINEL = 'other';

// Claude confidence threshold — anything strictly below this is treated as
// "uncertain" and surfaces the manual picker instead of writing to the DB.
const CONFIDENCE_THRESHOLD = 0.6;

function apiKey(): string {
  const key = process.env.YOUTUBE_API_KEY;
  if (!key) throw new Error('YOUTUBE_API_KEY is not set');
  return key;
}

// ---------------------------------------------------------------------------
// Legacy exports — DO NOT USE in new code.
//
// lib/competitor-matcher.ts and lib/dominator-finder.ts still import these
// and use them to type their internal slug→name maps with the old 12-niche
// taxonomy. They will be migrated to the new lib/niches.ts API in Phase 4,
// at which point this block can be deleted.
//
// New code MUST import VALID_NICHE_SLUGS / ValidNicheSlug / isValidNicheSlug
// from lib/niches.ts instead.
// ---------------------------------------------------------------------------

export const VALID_NICHE_IDS = [
  'finance', 'tech', 'gaming', 'cooking', 'fitness',
  'beauty', 'travel', 'education', 'business', 'entertainment', 'diy', 'vlog',
] as const;

export type ValidNicheId = (typeof VALID_NICHE_IDS)[number];

// ---------------------------------------------------------------------------
// Function 1 — detectNiche
// ---------------------------------------------------------------------------

/**
 * Classifies a YouTube creator into one of 31 niches using Claude.
 * Pass userId to enable DB caching — the Claude call is skipped if niche_id
 * is already stored for that user and the stored slug is still valid.
 *
 * Returns NicheResult with nicheSlug=null and requiresManualSelection=true
 * whenever Claude returns confidence below the threshold OR an unknown slug.
 * In that case, NOTHING is written to the DB — the caller is responsible for
 * surfacing the manual picker UI.
 *
 * @quota 0 units (YouTube) / ~1500 Claude input + 400 output tokens per call
 * @param videoTitles  User's last 20 video titles
 * @param descriptions User's last 20 video descriptions (partial text is fine)
 * @param userId       If provided: checks DB cache first, saves result on confident classification
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

      const storedSlug = data?.niche_id ?? null;

      if (storedSlug === NICHE_OTHER_SENTINEL) {
        // User has explicitly chosen "Other" via the manual picker. Treat as a
        // settled state — no need to re-classify, no picker required.
        console.log(
          `[niche-engine] detectNiche: cache hit — manual "other" selection for user ${userId}`,
        );
        return {
          nicheSlug: null,
          confidence: 1,
          reasoning: 'User manually selected "Other".',
          requiresManualSelection: false,
          source: 'cache',
        };
      }

      if (storedSlug && isValidNicheSlug(storedSlug)) {
        console.log(
          `[niche-engine] detectNiche: cache hit — "${storedSlug}" for user ${userId}`,
        );
        return {
          nicheSlug: storedSlug,
          confidence: 1,
          reasoning: 'Loaded from cache.',
          requiresManualSelection: false,
          source: 'cache',
        };
      }

      if (storedSlug) {
        // Stale or unknown slug from a previous taxonomy version. Don't trust
        // it — fall through to Claude classification.
        console.warn(
          `[niche-engine] detectNiche: stored niche_id "${storedSlug}" is not in the current taxonomy — ignoring cache and re-classifying`,
        );
        void logError({
          userId,
          route: 'lib/niche-engine/detectNiche',
          error: `Stored niche_id "${storedSlug}" is not in the current taxonomy`,
          details: { stored_niche_id: storedSlug },
          severity: 'warn',
        });
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

  const prompt = buildClassificationPrompt(titlesText, descriptionsText);

  // --- Call Claude ---
  try {
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 400,
      temperature: 0.2, // low temperature — this is classification, not creative writing
      messages: [{ role: 'user', content: prompt }],
    });

    const rawText =
      message.content[0].type === 'text' ? message.content[0].text.trim() : '';

    let parsed: { nicheSlug?: string | null; confidence?: number; reasoning?: string };
    try {
      parsed = JSON.parse(rawText);
    } catch {
      console.error('[niche-engine] detectNiche: failed to parse Claude JSON:', rawText);
      void logError({
        userId: userId ?? null,
        route: 'lib/niche-engine/detectNiche',
        error: 'Claude returned non-JSON response',
        details: { raw_response_preview: rawText.slice(0, 500) },
        severity: 'warn',
      });
      return failureResult('Failed to parse Claude response');
    }

    const rawConfidence =
      typeof parsed.confidence === 'number' ? parsed.confidence : 0;
    const confidence = Math.max(0, Math.min(1, rawConfidence));
    const reasoning = typeof parsed.reasoning === 'string' ? parsed.reasoning : '';

    // Normalise the slug: null or unknown values both end up as null.
    const candidateSlug =
      typeof parsed.nicheSlug === 'string' && isValidNicheSlug(parsed.nicheSlug)
        ? parsed.nicheSlug
        : null;

    if (typeof parsed.nicheSlug === 'string' && !isValidNicheSlug(parsed.nicheSlug)) {
      console.warn(
        `[niche-engine] detectNiche: Claude returned unknown nicheSlug "${parsed.nicheSlug}" — treating as null`,
      );
      void logError({
        userId: userId ?? null,
        route: 'lib/niche-engine/detectNiche',
        error: 'Claude returned unknown nicheSlug',
        details: { returned_slug: parsed.nicheSlug, confidence },
        severity: 'warn',
      });
    }

    const confident = candidateSlug !== null && confidence >= CONFIDENCE_THRESHOLD;

    if (!confident) {
      console.log(
        `[niche-engine] detectNiche: low-confidence classification — slug=${candidateSlug ?? 'null'}, confidence=${confidence}. Skipping DB write; manual selection required.`,
      );
      return {
        nicheSlug: null,
        confidence,
        reasoning: reasoning || 'Claude could not classify confidently.',
        requiresManualSelection: true,
        source: 'failure',
      };
    }

    // Confident classification — persist to DB if userId was provided.
    if (userId) {
      await saveDetectedNiche(userId, candidateSlug);
    }

    console.log(
      `[niche-engine] detectNiche: classified as "${candidateSlug}" (confidence: ${confidence})`,
    );

    return {
      nicheSlug: candidateSlug,
      confidence,
      reasoning,
      requiresManualSelection: false,
      source: 'claude',
    };
  } catch (err) {
    console.error('[niche-engine] detectNiche: Claude API error:', err);
    void logError({
      userId: userId ?? null,
      route: 'lib/niche-engine/detectNiche',
      error: err instanceof Error ? err.message : String(err),
      details: { error_stack: err instanceof Error ? err.stack : undefined },
    });
    return failureResult('Claude API error');
  }
}

function failureResult(reason: string): NicheResult {
  return {
    nicheSlug: null,
    confidence: 0,
    reasoning: reason,
    requiresManualSelection: true,
    source: 'failure',
  };
}

// ---------------------------------------------------------------------------
// Prompt builder — kept as a named function so the integration tests and the
// in-file test block can assert against the exact string template if needed.
// ---------------------------------------------------------------------------

function buildClassificationPrompt(titlesText: string, descriptionsText: string): string {
  const nicheList = NICHES.map((n) => {
    return `- ${n.displayName} [slug: ${n.slug}] — ${describeNiche(n.slug)}`;
  }).join('\n');

  return `You are classifying a YouTube channel into exactly one niche from a fixed taxonomy of 31 niches.

Here is the complete list. Each entry is: <displayName> [slug: <slug>] — <one-line description>.

${nicheList}

You MUST return exactly one of these 31 slug values, or null if you cannot classify confidently.

Confidence calibration:
- 0.9+   — The titles are unambiguously in one niche. Example: 5 of 5 titles are clearly about cryptocurrency → finance_crypto with 0.95.
- 0.6–0.8 — Most titles point to one niche but there is some noise or cross-over. Still pick a slug.
- 0.4–0.6 — The signal is mixed. Do NOT pick a niche at this level — return "nicheSlug": null.
- 0.0–0.3 — Titles are too generic, vague, or personal to identify a niche. Return "nicheSlug": null.

If you are uncertain, return "nicheSlug": null with a low confidence. Do NOT default to a fallback niche — the caller will surface a manual picker to the user.

Video titles to classify:
${titlesText || '(no titles available)'}

Recent descriptions (partial):
${descriptionsText || '(no descriptions available)'}

Respond with ONLY a JSON object — no other text, no markdown fences:
{
  "nicheSlug": "<one of the 31 slugs above OR null>",
  "confidence": <number between 0.0 and 1.0>,
  "reasoning": "<one sentence explaining the classification or why you cannot classify>"
}`;
}

// Per-slug one-line descriptions used in the Claude prompt. Kept in this file
// rather than in lib/niches.ts because the wording is tuned for classification,
// not UI display, and we want it co-located with the prompt template.
function describeNiche(slug: ValidNicheSlug): string {
  switch (slug) {
    case 'animals':
      return 'pets, pet training, animal rescue, wildlife, veterinary content.';
    case 'arts_culture':
      return 'visual arts, performing arts, photography, architecture, literature, art history.';
    case 'automotive':
      return 'car reviews, maintenance, motorsports, EVs, motorcycles, classic cars.';
    case 'beauty_makeup':
      return 'makeup tutorials, skincare, hair care, fragrances, GRWM, beauty trends.';
    case 'business_startups':
      return 'entrepreneurship, freelancing, leadership, VC, productivity, corporate culture.';
    case 'ecommerce':
      return 'dropshipping, Amazon FBA, Shopify, D2C brands, print-on-demand.';
    case 'education':
      return 'language learning, STEM, online courses, study tips, educational documentaries.';
    case 'entertainment_comedy':
      return 'comedy sketches, reaction videos, pranks, ASMR, vlogs, movie/TV reviews.';
    case 'fashion':
      return 'outfit inspiration, fashion hauls, sustainable fashion, men\'s/women\'s fashion, styling.';
    case 'finance_crypto':
      return 'personal finance, investing, crypto, NFTs, fintech, real estate investing, retirement planning.';
    case 'fitness':
      return 'workouts, gym, HIIT, yoga, weight loss, running, nutrition & supplements.';
    case 'food_drink_cooking':
      return 'recipes, baking, food reviews, mukbangs, restaurant vlogs, world cuisines.';
    case 'gaming':
      return 'game reviews, walkthroughs, specific titles (Minecraft, Fortnite, GTA, Pokemon, etc.), esports, streaming.';
    case 'health':
      return 'mental health, nutrition, disease prevention, wellness, holistic medicine, women\'s/men\'s health.';
    case 'home_diy':
      return 'home improvement, gardening, interior design, woodworking, plumbing, sustainable living.';
    case 'humanities':
      return 'philosophy, psychology, history, sociology, religion, linguistics, political science.';
    case 'magic_paranormal':
      return 'magic tricks, ghost hunting, unexplained mysteries, supernatural stories.';
    case 'motivation_self_improvement':
      return 'motivational talks, goal setting, mindfulness, life coaching, self-care.';
    case 'music':
      return 'pop, rock, hip-hop, classical, jazz, K-pop, Latin, music production, performances & covers.';
    case 'nature_outdoors':
      return 'hiking, fishing, camping, bushcraft, water sports, nature photography.';
    case 'news_politics':
      return 'global politics, political commentary, economic analysis, regional politics (UK, EU, Asia, Latin America, etc.).';
    case 'news_politics_us':
      return 'US-specific political commentary (immigration, healthcare, legal, religion, etc.). ONLY use this if the channel is clearly US-focused.';
    case 'podcast':
      return 'long-form podcast episodes across topics (interviews, comedy, news, sports). Pick this when the channel\'s primary format is podcast episodes regardless of subject.';
    case 'product_reviews':
      return 'dedicated product reviews across categories (tech, beauty, kitchen, sports gear, baby, pet supplies, etc.).';
    case 'relationships_family':
      return 'dating advice, marriage, parenting, family vlogs, fertility/pregnancy, LGBTQ+ relationships.';
    case 'sales_marketing':
      return 'digital marketing, branding, SEO, growth hacking, content marketing, B2B/B2C strategy, email marketing.';
    case 'social_media':
      return 'growing on Instagram/TikTok/LinkedIn/YouTube, personal branding, influencer marketing, content creation strategy.';
    case 'sports':
      return 'NFL, NBA, soccer, motorsports, sports commentary, athlete training, sports highlights.';
    case 'tech_ai_software':
      return 'AI, programming, cybersecurity, gadgets, robotics, SaaS, smart home, VR/AR.';
    case 'travel':
      return 'travel vlogs, destinations, budget travel, road trips, cruises, luxury travel.';
    case 'video_essays':
      return 'long-form analytical essays on film, history, internet culture, true crime, science explainers.';
  }
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
 * @param nicheSlug     One of the 31 valid niche slugs (or a raw query string)
 * @param userSubCount  User's current subscriber count
 * @param userChannelId User's own channel ID (excluded from results)
 * @returns Up to 5 CompetitorCandidate objects sorted by subscriber count ascending
 */
export async function findCompetitors(
  nicheSlug: string,
  userSubCount: number,
  userChannelId: string,
): Promise<CompetitorCandidate[]> {
  const nicheDef = isValidNicheSlug(nicheSlug) ? getNicheBySlug(nicheSlug) : undefined;
  const query = nicheDef?.searchQuery ?? nicheSlug;

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
 * Persists a Claude-detected niche slug to the users table.
 * Called automatically by detectNiche when confidence >= threshold and slug is valid.
 *
 * Runtime validation: unknown slugs are refused with a logged error rather than
 * silently writing garbage to the DB. Use saveManualNicheSelection for the
 * separate "user manually picked Other" code path.
 *
 * @returns true on success, false on error or invalid slug
 */
export async function saveDetectedNiche(userId: string, nicheSlug: string): Promise<boolean> {
  if (!isValidNicheSlug(nicheSlug)) {
    console.error(`[niche-engine] saveDetectedNiche: refusing to save unknown slug "${nicheSlug}"`);
    void logError({
      userId,
      route: 'lib/niche-engine/saveDetectedNiche',
      error: `Refused to save unknown niche slug "${nicheSlug}"`,
      details: { attempted_slug: nicheSlug },
      severity: 'error',
    });
    return false;
  }

  const supabase = createServiceClient();

  const { error } = await supabase
    .from('users')
    .update({
      niche_id: nicheSlug,
      niche_detected_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', userId);

  if (error) {
    console.error('[niche-engine] saveDetectedNiche error:', error.message);
    void logError({
      userId,
      route: 'lib/niche-engine/saveDetectedNiche',
      error: error.message,
      details: { niche_slug: nicheSlug },
    });
    return false;
  }

  console.log(`[niche-engine] saveDetectedNiche: saved niche "${nicheSlug}" for user ${userId}`);
  return true;
}

// ---------------------------------------------------------------------------
// Function 3b — saveManualNicheSelection
// ---------------------------------------------------------------------------

/**
 * Writes a manual niche selection (from the picker UI) to the users table.
 *
 * nicheSlug accepts:
 *   - A valid taxonomy slug from VALID_NICHE_SLUGS (stored verbatim in niche_id), OR
 *   - The literal string 'other' (stored as NICHE_OTHER_SENTINEL in niche_id)
 *
 * options.subNicheSlug accepts:
 *   - A valid sub-slug under nicheSlug → stored in users.sub_niche directly
 *     (manual selection — no detector pass needed)
 *   - The literal 'other' → sub_niche fields are cleared so the next sync
 *     re-derives via the sub-niche detector (which will receive the description)
 *   - null/undefined → same as 'other': clear sub_niche fields
 *   - Note: if nicheSlug is 'other', subNicheSlug must be null/undefined/'other'
 *     (the new niche is freeform, so structured sub-niches don't apply yet).
 *
 * options.description is required (≥ 10 chars) when nicheSlug === 'other' OR
 * subNicheSlug === 'other'. Otherwise optional. Stored in users.niche_description
 * (replaces any prior value; pass null/empty to clear it). The 10-char floor
 * here is defence-in-depth; the API route enforces a 50-char minimum upstream.
 *
 * @returns true on success, false on validation error or DB failure
 */
export async function saveManualNicheSelection(
  userId: string,
  nicheSlug: string,
  options: {
    subNicheSlug?: string | null;
    description?: string | null;
  } = {},
): Promise<boolean> {
  if (nicheSlug !== NICHE_OTHER_SENTINEL && !isValidNicheSlug(nicheSlug)) {
    console.error(
      `[niche-engine] saveManualNicheSelection: invalid nicheSlug "${nicheSlug}" for user ${userId}`,
    );
    void logError({
      userId,
      route: 'lib/niche-engine/saveManualNicheSelection',
      error: `Invalid manual nicheSlug "${nicheSlug}"`,
      details: { attempted_slug: nicheSlug },
      severity: 'warn',
    });
    return false;
  }

  const rawSub = options.subNicheSlug ?? null;
  const subIsOther = rawSub === NICHE_OTHER_SENTINEL;
  const nicheIsOther = nicheSlug === NICHE_OTHER_SENTINEL;
  const description = typeof options.description === 'string' ? options.description.trim() : '';
  const requiresDescription = nicheIsOther || subIsOther;

  if (requiresDescription && description.length < 10) {
    console.error(
      `[niche-engine] saveManualNicheSelection: description too short for user ${userId}`,
    );
    void logError({
      userId,
      route: 'lib/niche-engine/saveManualNicheSelection',
      error: 'Manual niche description must be at least 10 characters when an "Other" branch is selected',
      details: { description_length: description.length, niche_slug: nicheSlug, sub_niche_slug: rawSub },
      severity: 'warn',
    });
    return false;
  }

  // If a real sub-slug was provided, validate it against the chosen parent.
  // Reject any sub-slug at all when the parent is 'other' — the freeform niche
  // doesn't have a structured sub-niche taxonomy attached.
  let validatedSubSlug: string | null = null;
  if (rawSub != null && rawSub !== '' && !subIsOther) {
    if (nicheIsOther) {
      console.error(
        `[niche-engine] saveManualNicheSelection: subNicheSlug "${rawSub}" not allowed with nicheSlug='other' for user ${userId}`,
      );
      void logError({
        userId,
        route: 'lib/niche-engine/saveManualNicheSelection',
        error: 'subNicheSlug not allowed when nicheSlug is "other"',
        details: { niche_slug: nicheSlug, sub_niche_slug: rawSub },
        severity: 'warn',
      });
      return false;
    }
    const sub = getSubNicheBySlug(nicheSlug, rawSub);
    if (!sub) {
      console.error(
        `[niche-engine] saveManualNicheSelection: subNicheSlug "${rawSub}" is not a valid child of "${nicheSlug}" for user ${userId}`,
      );
      void logError({
        userId,
        route: 'lib/niche-engine/saveManualNicheSelection',
        error: `subNicheSlug "${rawSub}" is not a valid child of "${nicheSlug}"`,
        details: { niche_slug: nicheSlug, sub_niche_slug: rawSub },
        severity: 'warn',
      });
      return false;
    }
    validatedSubSlug = rawSub;
  }

  const supabase = createServiceClient();

  // Stored slug is either the verbatim valid slug or the 'other' sentinel.
  const storedSlug = nicheIsOther ? NICHE_OTHER_SENTINEL : nicheSlug;

  // Build the update. Description is overwritten on every call (including being
  // cleared to null when not provided) so the row always reflects the latest
  // manual choice rather than a stale free-text value from an earlier pick.
  const nowIso = new Date().toISOString();
  const update: Record<string, unknown> = {
    niche_id: storedSlug,
    niche_description: description.length > 0 ? description : null,
    niche_detected_at: nowIso,
    updated_at: nowIso,
  };

  if (validatedSubSlug) {
    // Manual sub-niche selection: store directly. Wipe detector outputs
    // (keywords/confidence) since they correspond to an earlier auto-derived
    // sub-niche and would be misleading next to a manually-picked one.
    update.sub_niche = validatedSubSlug;
    update.sub_niche_keywords = null;
    update.sub_niche_confidence = null;
    update.sub_niche_detected_at = nowIso;
  } else {
    // Either no sub-niche was specified or 'other' was picked. Clear all
    // sub_niche fields so the sub-niche detector re-derives on the next sync.
    update.sub_niche = null;
    update.sub_niche_keywords = null;
    update.sub_niche_confidence = null;
    update.sub_niche_detected_at = null;
  }

  const { error } = await supabase.from('users').update(update).eq('id', userId);

  if (error) {
    console.error('[niche-engine] saveManualNicheSelection error:', error.message);
    void logError({
      userId,
      route: 'lib/niche-engine/saveManualNicheSelection',
      error: error.message,
      details: { niche_slug: storedSlug, sub_niche_slug: validatedSubSlug },
    });
    return false;
  }

  console.log(
    `[niche-engine] saveManualNicheSelection: saved manual selection niche="${storedSlug}" sub="${validatedSubSlug ?? '∅'}" hasDescription=${description.length > 0} for user ${userId}`,
  );
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
    if (!videos || videos.length === 0) {
      void logError({
        route: 'lib/niche-engine/meetsActivityThreshold',
        error: 'Competitor candidate failed activity threshold',
        details: {
          channel_id: channelId,
          last_30d_videos: 0,
          last_60d_videos: 0,
          reason: 'no_recent_videos',
        },
        severity: 'warn',
      });
      return false;
    }

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
      void logError({
        route: 'lib/niche-engine/meetsActivityThreshold',
        error: 'Competitor candidate failed activity threshold',
        details: {
          channel_id: channelId,
          last_30d_videos: last30,
          last_60d_videos: last60,
        },
        severity: 'warn',
      });
    }

    return passes;
  } catch (err) {
    void logError({
      route: 'lib/niche-engine/meetsActivityThreshold',
      error: err instanceof Error ? err.message : String(err),
      details: { channel_id: channelId },
      severity: 'warn',
    });
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
    void logError({
      userId,
      route: 'lib/niche-engine/assignCompetitor',
      error: err instanceof Error ? err.message : String(err),
      details: { channel_id: candidate.channelId, channel_name: candidate.channelName, tier },
      severity: 'warn',
    });
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
 * One-time orchestrator: finds up to 2 Tier 1, 2 Tier 2, and 1 Dominator
 * competitor for a user, then inserts them with full video data.
 *
 * Called from /api/sync when any tier has fewer than its target count of
 * active auto-detected competitors. Never throws — partial results are saved.
 *
 * Tier definitions (ratio = competitorSubs / userSubs):
 *   Tier 1: 0.5x – 3x   (peer comparison, target: 2 channels)
 *   Tier 2: 3x – 10x    (aspirational, target: 2 channels)
 *   Tier 3 / Dominator: >10x (niche ceiling, target: 1 channel)
 *
 * @quota ~101 (initial search) + up to 5 × 203 (full profile each) ≈ 1116 units total
 */
export async function detectAndAssignCompetitors(
  userId: string,
  nicheSlug: string | null,
  userSubscriberCount: number,
): Promise<void> {
  if (!nicheSlug || !isValidNicheSlug(nicheSlug)) {
    console.warn(
      `[niche-engine] detectAndAssignCompetitors: invalid nicheSlug "${nicheSlug}" for user ${userId} — skipping`,
    );
    return;
  }

  const supabase = createServiceClient();
  const nicheDef = getNicheBySlug(nicheSlug);
  if (!nicheDef) {
    // Defensive — isValidNicheSlug just passed, so this should never fire.
    console.warn(
      `[niche-engine] detectAndAssignCompetitors: getNicheBySlug returned undefined for valid slug "${nicheSlug}" — skipping`,
    );
    return;
  }
  const query = nicheDef.searchQuery;

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

  // Count how many active auto-detected competitors already exist per tier
  const tierCounts: Record<1 | 2 | 3, number> = { 1: 0, 2: 0, 3: 0 };
  for (const r of existingRows ?? []) {
    if (r.is_auto_detected && r.is_active && r.tier != null) {
      const t = r.tier as 1 | 2 | 3;
      if (t === 1 || t === 2 || t === 3) tierCounts[t]++;
    }
  }
  // Slots remaining per tier (Starter targets: 2 Tier1, 2 Tier2, 1 Dominator)
  const tier1Slots = Math.max(0, 2 - tierCounts[1]);
  const tier2Slots = Math.max(0, 2 - tierCounts[2]);
  const domSlots   = Math.max(0, 1 - tierCounts[3]);
  console.log(
    `[niche-engine] detectAndAssignCompetitors: existing per tier = T1:${tierCounts[1]} T2:${tierCounts[2]} Dom:${tierCounts[3]} — slots remaining = T1:${tier1Slots} T2:${tier2Slots} Dom:${domSlots}`,
  );

  console.log(
    `[niche-engine] detectAndAssignCompetitors: user ${userId}, niche "${nicheSlug}", userSubs ${userSubscriberCount}`,
  );

  const allCandidates = await searchAllChannelCandidates(query, userChannelId);

  if (allCandidates.length === 0) {
    console.warn(
      `[niche-engine] detectAndAssignCompetitors: no candidates found for query "${query}"`,
    );
    void logError({
      userId,
      route: 'lib/niche-engine/detectAndAssignCompetitors',
      error: 'Competitor search returned zero candidates',
      details: {
        niche_slug: nicheSlug,
        user_subscriber_count: userSubscriberCount,
        user_channel_id: userChannelId,
        query,
      },
      severity: 'error',
    });
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

  // Pick up to 2 active Tier 1 candidates (sorted by closeness to 2× user subs)
  const target1 = userSubscriberCount * 2;
  const sortedTier1 = [...tier1Pool].sort(
    (a, b) => Math.abs(a.subscriberCount - target1) - Math.abs(b.subscriberCount - target1),
  );
  const activeTier1: CompetitorCandidate[] = [];
  for (const candidate of sortedTier1) {
    if (activeTier1.length >= tier1Slots) break;
    const active = await meetsActivityThreshold(candidate.channelId);
    if (active) activeTier1.push(candidate);
  }

  // Pick up to 2 active Tier 2 candidates (sorted by closeness to 5× user subs)
  const target2 = userSubscriberCount * 5;
  const sortedTier2 = [...tier2Pool].sort(
    (a, b) => Math.abs(a.subscriberCount - target2) - Math.abs(b.subscriberCount - target2),
  );
  const activeTier2: CompetitorCandidate[] = [];
  for (const candidate of sortedTier2) {
    if (activeTier2.length >= tier2Slots) break;
    const active = await meetsActivityThreshold(candidate.channelId);
    if (active) activeTier2.push(candidate);
  }

  // Pick up to 1 active Dominator (largest sub count wins)
  const sortedDom = [...dominatorPool].sort((a, b) => b.subscriberCount - a.subscriberCount);
  const activeDom: CompetitorCandidate[] = [];
  for (const candidate of sortedDom) {
    if (activeDom.length >= domSlots) break;
    const active = await meetsActivityThreshold(candidate.channelId);
    if (active) activeDom.push(candidate);
  }

  if (activeTier1.length < tier1Slots)
    console.warn(
      `[niche-engine] detectAndAssignCompetitors: only ${activeTier1.length}/${tier1Slots} Tier 1 candidates found (need ${Math.round(userSubscriberCount * 0.5)}–${Math.round(userSubscriberCount * 3)} subs, ≥3 videos/30d)`,
    );
  if (activeTier2.length < tier2Slots)
    console.warn(
      `[niche-engine] detectAndAssignCompetitors: only ${activeTier2.length}/${tier2Slots} Tier 2 candidates found (need ${Math.round(userSubscriberCount * 3)}–${Math.round(userSubscriberCount * 10)} subs, ≥3 videos/30d)`,
    );
  if (activeDom.length < domSlots)
    console.warn(
      `[niche-engine] detectAndAssignCompetitors: no active Dominator candidate (need >${Math.round(userSubscriberCount * 10)} subs, ≥3 videos/30d)`,
    );

  const toAssign: { candidate: CompetitorCandidate; tier: 1 | 2 | 3 }[] = [
    ...activeTier1.map((candidate) => ({ candidate, tier: 1 as const })),
    ...activeTier2.map((candidate) => ({ candidate, tier: 2 as const })),
    ...activeDom.map((candidate)   => ({ candidate, tier: 3 as const })),
  ];

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
      void logError({
        userId,
        route: 'lib/niche-engine/detectAndAssignCompetitors',
        error: result.reason instanceof Error ? result.reason.message : String(result.reason),
        details: { tier: toAssign[i].tier, channel_name: toAssign[i].candidate.channelName },
      });
    }
  });

  const succeeded = results.filter((r) => r.status === 'fulfilled').length;
  console.log(
    `[niche-engine] detectAndAssignCompetitors: done — ${succeeded}/${toAssign.length} competitors assigned for user ${userId}`,
  );

  // Count successful per-tier assignments to determine which slots are still empty.
  const succeededByTier: Record<1 | 2 | 3, number> = { 1: 0, 2: 0, 3: 0 };
  results.forEach((result, i) => {
    if (result.status === 'fulfilled') {
      succeededByTier[toAssign[i].tier]++;
    }
  });
  const remainingT1 = Math.max(0, tier1Slots - succeededByTier[1]);
  const remainingT2 = Math.max(0, tier2Slots - succeededByTier[2]);
  const remainingDom = Math.max(0, domSlots - succeededByTier[3]);

  if (remainingT1 > 0 || remainingT2 > 0 || remainingDom > 0) {
    void logError({
      userId,
      route: 'lib/niche-engine/detectAndAssignCompetitors',
      error: 'Auto-detection finished with unfilled tiers',
      details: {
        unfilled: { t1: remainingT1, t2: remainingT2, dom: remainingDom },
        candidates_pool_size: allCandidates.length,
        eligible_pool_size: eligible.length,
        tier_pool_sizes: { t1: tier1Pool.length, t2: tier2Pool.length, dom: dominatorPool.length },
        niche_slug: nicheSlug,
        user_subscriber_count: userSubscriberCount,
      },
      severity: 'warn',
    });
  }
}

// TEST — remove before prod
// Run via: RUN_NICHE_TEST=true ANTHROPIC_API_KEY=... YOUTUBE_API_KEY=... npx tsx lib/niche-engine.ts
// Note: requires tsconfig paths plugin (e.g. tsconfig-paths) to resolve @/ aliases.
if (process.env.RUN_NICHE_TEST === 'true') {
  (async () => {
    console.log('=== Niche Engine Test ===\n');

    // Test 1: detectNiche — should return "music"
    console.log('--- Test 1: detectNiche (music titles, no userId) ---');
    const sampleTitles = [
      'Black star by radiohead',
      'are you not lonely?',
      'worldstar money joji',
      'hurts me too by faye webster',
      'echo by clairo',
    ];
    const sampleDescriptions: string[] = [];

    const nicheResult = await detectNiche(sampleTitles, sampleDescriptions);
    console.log('Result:', JSON.stringify(nicheResult, null, 2));
    console.log(
      'PASS:',
      nicheResult.nicheSlug === 'music' && !nicheResult.requiresManualSelection
        ? '✓ returned "music" with no manual-selection requirement'
        : `✗ expected nicheSlug "music" with requiresManualSelection false, got nicheSlug=${nicheResult.nicheSlug} requiresManualSelection=${nicheResult.requiresManualSelection}`,
    );
    console.log(`Display name: ${nicheResult.nicheSlug ? getDisplayName(nicheResult.nicheSlug) : '—'}`);

    // Test 2: findCompetitors — should return channels with channelId and channelName
    console.log('\n--- Test 2: findCompetitors("music", 50000, "fake_channel_id") ---');
    console.log('(costs 101 YouTube Data API quota units)');
    const competitors = await findCompetitors('music', 50000, 'fake_channel_id');
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

    // Test 3: VALID_NICHE_SLUGS sanity check
    console.log('\n--- Test 3: VALID_NICHE_SLUGS sanity ---');
    console.log(`Total slugs: ${VALID_NICHE_SLUGS.length}`);
    console.log(`Includes 'music': ${VALID_NICHE_SLUGS.includes('music' as ValidNicheSlug)}`);
    console.log(`'finance' is NOT in new taxonomy: ${!(VALID_NICHE_SLUGS as readonly string[]).includes('finance')}`);

    console.log('\n=== Test Complete ===');
  })();
}
