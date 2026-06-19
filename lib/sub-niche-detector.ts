import Anthropic from '@anthropic-ai/sdk'
import { createServiceClient } from '@/lib/supabase'
import { logError } from '@/lib/logger'

// Constructed lazily on the first call rather than at module load. The
// Anthropic SDK captures its fetch implementation at construction time —
// constructing here at load would lock in the real fetch and bypass the
// mock-fetch interceptor used by the integration tests.
function getAnthropic(): Anthropic {
  return new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
}

export interface SubNicheResult {
  sub_niche: string
  keywords: string[]
  confidence: number
}

/**
 * Detect a channel's sub-niche from video titles + optionally a user-supplied
 * niche description.
 *
 * The description input is used by /api/users/detect-sub-niche when the user
 * has manually selected `niche_id = 'other'` (or provided a freeform niche
 * description while picking a real niche). The description is appended to the
 * Claude prompt and is sufficient on its own — i.e. the ≥ 3-video minimum is
 * waived when a non-empty description is provided, so newly-onboarded users
 * who haven't synced enough videos yet still get a sub-niche result.
 */
export async function detectSubNiche(
  videos: Array<{ title: string; description?: string | null }>,
  options: { nicheDescription?: string | null } = {},
): Promise<SubNicheResult> {
  const nicheDescription =
    typeof options.nicheDescription === 'string' ? options.nicheDescription.trim() : ''
  const hasDescription = nicheDescription.length > 0
  const videoCount = videos?.length ?? 0

  // Without a description, fall back to the original ≥ 3-video minimum.
  if (!hasDescription && videoCount < 3) {
    return { sub_niche: 'General', keywords: [], confidence: 0 }
  }

  const recentVideos = (videos ?? []).slice(0, 20)

  const videoList =
    recentVideos.length === 0
      ? '(no video titles available)'
      : recentVideos
          .map(
            (v, i) =>
              `${i + 1}. "${v.title}"${v.description ? ` - ${v.description.slice(0, 150)}` : ''}`,
          )
          .join('\n')

  const descriptionBlock = hasDescription
    ? `\n\nThe creator described their channel as:\n"${nicheDescription.slice(0, 1500)}"\n\nUse this description as the primary signal when video titles are sparse or ambiguous.`
    : ''

  const prompt = `Analyze these YouTube video titles${hasDescription ? ' and the creator\'s own description' : ''} and identify the channel's PRIMARY sub-niche focus.

Videos:
${videoList}${descriptionBlock}

A sub-niche is a granular specialization within a broader niche. Examples:
- Finance → "Credit Card Rewards & Travel Hacking"
- Gaming → "Runescape PvP & Skilling Guides"
- Fitness → "Home Yoga for Beginners"
- Tech → "Apple Product Reviews"
- Cooking → "Italian Pasta Recipes"

Return ONLY valid JSON (no other text):
{
  "sub_niche": "2-5 word specific label",
  "keywords": ["keyword1", "keyword2", "keyword3", "keyword4", "keyword5"],
  "confidence": 0.85
}

Where:
- sub_niche: Specific topical focus (2-5 words)
- keywords: 3-7 most relevant topic keywords
- confidence: 0.0-1.0 (how clear the focus is; 1.0 = crystal clear pattern)

Return ONLY the JSON object, nothing else.`

  try {
    const response = await getAnthropic().messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 500,
      messages: [{ role: 'user', content: prompt }],
    })

    const textBlock = response.content.find((b) => b.type === 'text')
    if (!textBlock || textBlock.type !== 'text') {
      throw new Error('No text response from Claude')
    }

    const cleaned = textBlock.text
      .replace(/```json\s*/g, '')
      .replace(/```\s*/g, '')
      .trim()

    const parsed = JSON.parse(cleaned)

    return {
      sub_niche: parsed.sub_niche || 'General',
      keywords: Array.isArray(parsed.keywords) ? parsed.keywords : [],
      confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0.5,
    }
  } catch (error) {
    console.error('[sub-niche] Detection failed:', error)
    return { sub_niche: 'General', keywords: [], confidence: 0 }
  }
}

export type DetectAndSaveSubNicheResult =
  | { status: 'ok'; result: SubNicheResult }
  | { status: 'user_not_found' }
  | { status: 'insufficient_videos'; current: number }

/**
 * Fetch a user's recent videos, run sub-niche detection, and persist the result
 * to the users row. Mirrors the niche-detection flow (detectNiche +
 * saveDetectedNiche) so it can be called directly in-process from sync-logic
 * instead of via a self-HTTP request to the detect-sub-niche route.
 *
 * Contains no HTTP/auth logic — callers resolve the userId themselves.
 *
 * Guard (unchanged): when the user has supplied a non-empty niche_description
 * the ≥ 3-video minimum is waived; otherwise ≥ 3 videos are required.
 */
export async function detectAndSaveSubNiche(
  userId: string,
): Promise<DetectAndSaveSubNicheResult> {
  const supabase = createServiceClient()

  const { data: user } = await supabase
    .from('users')
    .select('id, youtube_channel_id, sub_niche, niche_id, niche_description')
    .eq('id', userId)
    .single()

  if (!user) {
    return { status: 'user_not_found' }
  }

  const { data: videos, error: videosError } = await supabase
    .from('videos')
    .select('title')
    .eq('user_id', user.id)
    .order('published_at', { ascending: false })
    .limit(20)

  // Capture the previously-discarded query error. A failure here (missing
  // column, RLS, type mismatch) would silently degrade `videos` to null and
  // masquerade as `insufficient_videos` below — log it loudly instead.
  if (videosError) {
    console.error('[sub-niche] video fetch failed:', videosError.message)
    void logError({
      userId,
      route: 'lib/sub-niche-detector/detectAndSaveSubNiche',
      error: videosError.message,
      details: { error_code: videosError.code },
      severity: 'warn',
    })
  }

  // Phase 7: when the user has manually picked 'other' OR supplied a
  // freeform niche_description (via the manual picker), feed the description
  // into the sub-niche detector. The description is sufficient on its own,
  // so the ≥ 3-video minimum is waived in that case. Otherwise we still
  // need ≥ 3 video titles for the detector to have any signal.
  const hasDescription =
    typeof user.niche_description === 'string' && user.niche_description.trim().length > 0

  if (!hasDescription && (!videos || videos.length < 3)) {
    return { status: 'insufficient_videos', current: videos?.length ?? 0 }
  }

  const result = await detectSubNiche(videos ?? [], {
    nicheDescription: hasDescription ? user.niche_description : null,
  })

  const { error: updateError } = await supabase
    .from('users')
    .update({
      sub_niche: result.sub_niche,
      sub_niche_keywords: result.keywords,
      sub_niche_confidence: result.confidence,
      sub_niche_detected_at: new Date().toISOString(),
    })
    .eq('id', user.id)

  // Capture the previously-discarded update result so an RLS/type/constraint
  // failure logs instead of silently no-op-ing while we still return 'ok'.
  if (updateError) {
    console.error('[sub-niche] users update failed:', updateError.message)
    void logError({
      userId,
      route: 'lib/sub-niche-detector/detectAndSaveSubNiche',
      error: updateError.message,
      details: { error_code: updateError.code },
      severity: 'warn',
    })
  }

  return { status: 'ok', result }
}

// Calculate similarity between two sub-niches (0-1 score)
export function calculateSubNicheSimilarity(
  user: { sub_niche?: string | null; sub_niche_keywords?: string[] | null },
  competitor: { sub_niche?: string | null; sub_niche_keywords?: string[] | null },
): number {
  if (!user.sub_niche || !competitor.sub_niche) {
    return 0.5 // Neutral when data is missing
  }

  if (user.sub_niche.toLowerCase() === competitor.sub_niche.toLowerCase()) {
    return 1.0
  }

  const userKeywords = new Set(
    (user.sub_niche_keywords || []).map((k) => k.toLowerCase()),
  )
  const compKeywords = new Set(
    (competitor.sub_niche_keywords || []).map((k) => k.toLowerCase()),
  )

  if (userKeywords.size === 0 || compKeywords.size === 0) {
    return 0.3
  }

  const intersection = Array.from(userKeywords).filter((k) => compKeywords.has(k))
  const union = new Set([...Array.from(userKeywords), ...Array.from(compKeywords)])

  return intersection.length / union.size
}

// Match score label for UI display
export function getMatchLabel(score: number): {
  label: string
  color: 'green' | 'yellow' | 'gray'
} {
  if (score >= 0.7) return { label: 'Good match', color: 'green' }
  if (score >= 0.4) return { label: 'Moderate match', color: 'yellow' }
  return { label: 'Different focus', color: 'gray' }
}
