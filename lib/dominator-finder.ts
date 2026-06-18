import { detectSubNiche, calculateSubNicheSimilarity } from './sub-niche-detector'
import type { SubNicheResult } from './sub-niche-detector'
import {
  isValidNicheSlug,
  getNicheBySlug,
  type ValidNicheSlug,
} from './niches'
import { logError } from './logger'

// Niche-specific dominator matching rules.
//
// Phase 4 (2026-06-10) — keyed on all 31 canonical slugs. Record<ValidNicheSlug, …>
// makes this map exhaustive at compile time: adding a niche to VALID_NICHE_SLUGS
// without an entry here is a TypeScript error.
//
// - 'sub_niche' = the Dominator must match the user's specific sub-niche
//   (vertical is too broad to share a single Dominator — gaming Minecraft
//   creators and gaming Fortnite creators have nothing in common, so we
//   require the channel-level sub-niche to overlap).
// - 'broad'     = any large channel in the same top-level niche is a useful
//   Dominator reference (the niche is coherent enough at the top level that
//   a channel's tactics generalise — e.g. all finance creators benefit from
//   watching the biggest finance channels regardless of crypto/RE/investing).
const NICHE_DOMINATOR_RULES: Record<ValidNicheSlug, 'sub_niche' | 'broad'> = {
  // Vertical-with-many-distinct-cultures → sub_niche match required
  gaming: 'sub_niche',
  fitness: 'sub_niche',
  education: 'sub_niche',
  tech_ai_software: 'sub_niche',
  music: 'sub_niche',
  sports: 'sub_niche',
  podcast: 'sub_niche',
  product_reviews: 'sub_niche',

  // Coherent verticals → broad match works
  finance_crypto: 'broad',
  business_startups: 'broad',
  sales_marketing: 'broad',
  ecommerce: 'broad',
  beauty_makeup: 'broad',
  fashion: 'broad',
  travel: 'broad',
  entertainment_comedy: 'broad',
  home_diy: 'broad',
  food_drink_cooking: 'broad',
  automotive: 'broad',
  health: 'broad',
  motivation_self_improvement: 'broad',
  relationships_family: 'broad',
  social_media: 'broad',
  humanities: 'broad',
  arts_culture: 'broad',
  nature_outdoors: 'broad',
  animals: 'broad',
  magic_paranormal: 'broad',
  video_essays: 'broad',
  news_politics: 'broad',
  news_politics_us: 'broad',
}

export interface DominatorCandidate {
  channelId: string
  channelName: string
  subscriberCount: number
  totalViews: number
  thumbnail?: string
  sub_niche?: string
  sub_niche_keywords?: string[]
  lastUploadDate?: string
}

// Find Dominator channel(s) for a user based on their niche
export async function findDominatorsForUser(
  userNicheId: string | null,
  userSubNiche: SubNicheResult | null,
  count: number, // 1 for Starter, 2 for Pro
): Promise<DominatorCandidate[]> {
  if (!userNicheId) {
    console.log('[dominator] No niche_id for user, skipping')
    return []
  }

  // Phase 4: no 'general' fallback. A generic search query returns a Dominator
  // who has nothing in common with the user's actual content, which is worse
  // than no Dominator at all. Skip the user and surface the data issue.
  if (!isValidNicheSlug(userNicheId)) {
    console.warn(
      `[dominator] Unknown niche_id "${userNicheId}" — skipping dominator assignment`,
    )
    void logError({
      route: 'lib/dominator-finder/findDominatorsForUser',
      error: 'Unknown niche_id — skipping dominator assignment',
      details: { niche_id: userNicheId },
      severity: 'warn',
    })
    return []
  }

  const nicheDef = getNicheBySlug(userNicheId)
  if (!nicheDef) {
    // isValidNicheSlug just passed, so this should never happen. Defensive log
    // and skip rather than picking a generic fallback.
    void logError({
      route: 'lib/dominator-finder/findDominatorsForUser',
      error: 'isValidNicheSlug passed but getNicheBySlug returned undefined',
      details: { niche_id: userNicheId },
      severity: 'error',
    })
    return []
  }

  const useSubNiche = NICHE_DOMINATOR_RULES[nicheDef.slug] === 'sub_niche'

  console.log(
    `[dominator] Searching ${nicheDef.slug} ("${nicheDef.searchQuery}"), use sub-niche: ${useSubNiche}`,
  )

  // Sub-niche search beats the canonical niche query for verticals with many
  // distinct cultures (gaming, music, sports, etc.). Falls back to the
  // canonical searchQuery when no sub-niche is set.
  const searchQuery =
    useSubNiche && userSubNiche?.sub_niche && userSubNiche.sub_niche !== 'other'
      ? userSubNiche.sub_niche
      : nicheDef.searchQuery

  const candidates = await searchTopChannels(searchQuery, 50)
  if (candidates.length === 0) return []

  const detailed = await getChannelDetails(candidates.map((c) => c.channelId))
  const active = await filterActiveChannels(detailed)
  const sorted = active.sort((a, b) => b.subscriberCount - a.subscriberCount)

  if (useSubNiche && userSubNiche) {
    const withSubNiche = await enrichWithSubNiche(sorted.slice(0, 10))
    const matched = withSubNiche
      .map((c) => ({
        ...c,
        matchScore: calculateSubNicheSimilarity(
          { sub_niche: userSubNiche.sub_niche, sub_niche_keywords: userSubNiche.keywords },
          { sub_niche: c.sub_niche, sub_niche_keywords: c.sub_niche_keywords },
        ),
      }))
      .sort((a, b) => b.matchScore - a.matchScore)

    return matched.slice(0, count)
  }

  return sorted.slice(0, count)
}

async function searchTopChannels(
  query: string,
  maxResults: number = 50,
): Promise<Array<{ channelId: string; channelName: string }>> {
  const url = new URL('https://www.googleapis.com/youtube/v3/search')
  url.searchParams.set('part', 'snippet')
  url.searchParams.set('type', 'channel')
  url.searchParams.set('q', query)
  url.searchParams.set('regionCode', 'US')
  url.searchParams.set('maxResults', String(maxResults))
  url.searchParams.set('order', 'viewCount')
  url.searchParams.set('key', process.env.YOUTUBE_API_KEY!)

  const res = await fetch(url.toString())
  if (!res.ok) {
    console.error('[dominator] YouTube search failed:', res.status)
    return []
  }

  const data = await res.json()
  return (data.items || []).map((item: Record<string, unknown>) => {
    const snippet = item.snippet as Record<string, unknown>
    return { channelId: snippet.channelId as string, channelName: snippet.channelTitle as string }
  })
}

async function getChannelDetails(channelIds: string[]): Promise<DominatorCandidate[]> {
  if (channelIds.length === 0) return []

  const results: DominatorCandidate[] = []

  for (let i = 0; i < channelIds.length; i += 50) {
    const batch = channelIds.slice(i, i + 50)
    const url = new URL('https://www.googleapis.com/youtube/v3/channels')
    url.searchParams.set('part', 'snippet,statistics')
    url.searchParams.set('id', batch.join(','))
    url.searchParams.set('key', process.env.YOUTUBE_API_KEY!)

    const res = await fetch(url.toString())
    if (!res.ok) continue

    const data = await res.json()
    for (const item of data.items || []) {
      const stats = item.statistics as Record<string, string>
      const snippet = item.snippet as Record<string, unknown>
      const thumbnails = snippet.thumbnails as Record<string, { url: string }> | undefined
      results.push({
        channelId: item.id as string,
        channelName: snippet.title as string,
        subscriberCount: parseInt(stats.subscriberCount || '0'),
        totalViews: parseInt(stats.viewCount || '0'),
        thumbnail: thumbnails?.default?.url,
      })
    }
  }

  return results
}

async function filterActiveChannels(
  channels: DominatorCandidate[],
): Promise<DominatorCandidate[]> {
  const active: DominatorCandidate[] = []
  const thirtyDaysAgo = new Date()
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

  const toCheck = channels
    .sort((a, b) => b.subscriberCount - a.subscriberCount)
    .slice(0, 20)

  for (const channel of toCheck) {
    const url = new URL('https://www.googleapis.com/youtube/v3/search')
    url.searchParams.set('part', 'snippet')
    url.searchParams.set('channelId', channel.channelId)
    url.searchParams.set('order', 'date')
    url.searchParams.set('type', 'video')
    url.searchParams.set('maxResults', '1')
    url.searchParams.set('key', process.env.YOUTUBE_API_KEY!)

    try {
      const res = await fetch(url.toString())
      if (!res.ok) continue
      const data = await res.json()
      const latestVideo = data.items?.[0]
      if (latestVideo) {
        const publishedAt = new Date(latestVideo.snippet.publishedAt)
        if (publishedAt > thirtyDaysAgo) {
          channel.lastUploadDate = publishedAt.toISOString()
          active.push(channel)
        }
      }
    } catch (err) {
      console.error('[dominator] Activity check failed for', channel.channelId, err)
    }

    if (active.length >= 5) break
  }

  return active
}

async function enrichWithSubNiche(
  channels: DominatorCandidate[],
): Promise<DominatorCandidate[]> {
  const enriched: DominatorCandidate[] = []

  for (const channel of channels) {
    const url = new URL('https://www.googleapis.com/youtube/v3/search')
    url.searchParams.set('part', 'snippet')
    url.searchParams.set('channelId', channel.channelId)
    url.searchParams.set('order', 'date')
    url.searchParams.set('type', 'video')
    url.searchParams.set('maxResults', '15')
    url.searchParams.set('key', process.env.YOUTUBE_API_KEY!)

    try {
      const res = await fetch(url.toString())
      if (!res.ok) {
        enriched.push(channel)
        continue
      }
      const data = await res.json()
      const videos = (data.items || []).map((v: Record<string, unknown>) => {
        const snippet = v.snippet as Record<string, string>
        return { title: snippet.title, description: snippet.description }
      })
      const subNiche = await detectSubNiche(videos)
      enriched.push({ ...channel, sub_niche: subNiche.sub_niche, sub_niche_keywords: subNiche.keywords })
    } catch (err) {
      console.error('[dominator] Sub-niche enrichment failed for', channel.channelId, err)
      enriched.push(channel)
    }
  }

  return enriched
}
