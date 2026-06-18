import { detectSubNiche, calculateSubNicheSimilarity } from './sub-niche-detector'
import type { SubNicheResult } from './sub-niche-detector'
import { getNicheBySlug } from './niches'
import { logError } from './logger'

export type Tier = 1 | 2 | 3

// Calculate tier from subscriber ratio
export function calculateTier(userSubs: number, competitorSubs: number): Tier {
  if (userSubs <= 0 || competitorSubs <= 0) return 1
  const ratio = competitorSubs / userSubs
  if (ratio <= 3) return 1
  if (ratio <= 10) return 2
  return 3
}

export interface CompetitorMatch {
  channelId: string
  channelName: string
  subscriberCount: number
  totalViews: number
  thumbnail?: string
  tier: Tier
  sub_niche?: string
  sub_niche_keywords?: string[]
  match_score: number
}

// Phase 4 (2026-06-10) — the per-niche NICHE_SEARCH_TERMS map was deleted.
// Every value in that map was identical to the slug itself, and lib/niches.ts
// already owns the authoritative per-niche YouTube search phrase. Look it up
// directly via getNicheBySlug(slug)?.searchQuery — one source of truth.

// Find best competitors for a specific tier slot
export async function findBestCompetitorsForTier(
  userSubs: number,
  userSubNiche: SubNicheResult | null,
  userNicheId: string,
  tier: 1 | 2,
  count: number,
): Promise<CompetitorMatch[]> {
  const subsMin = tier === 1 ? userSubs * 1 : userSubs * 3
  const subsMax = tier === 1 ? userSubs * 3 : userSubs * 10

  console.log(`[matcher] Finding tier ${tier} competitors (${subsMin}–${subsMax} subs)`)

  // Prefer the sub-niche search term when available — it returns more
  // relevant competitors than the broad niche query. Fall back to the
  // canonical per-niche searchQuery in lib/niches.ts. If neither is available
  // (unknown slug), log a warn and skip the search entirely rather than
  // returning generic matches.
  const nicheQuery = getNicheBySlug(userNicheId)?.searchQuery
const subNicheQuery = userSubNiche?.sub_niche && userSubNiche.sub_niche !== 'other'
  ? userSubNiche.sub_niche
  : null
const searchQuery = subNicheQuery || nicheQuery
  if (!searchQuery) {
    void logError({
      route: 'lib/competitor-matcher/findBestCompetitorsForTier',
      error: 'No search query available — unknown niche slug and no sub-niche',
      details: { niche_id: userNicheId, tier },
      severity: 'warn',
    })
    return []
  }

  const url = new URL('https://www.googleapis.com/youtube/v3/search')
  url.searchParams.set('part', 'snippet')
  url.searchParams.set('type', 'channel')
  url.searchParams.set('q', searchQuery)
  url.searchParams.set('regionCode', 'US')
  url.searchParams.set('maxResults', '50')
  url.searchParams.set('key', process.env.YOUTUBE_API_KEY!)

  const res = await fetch(url.toString())
  if (!res.ok) return []

  const data = await res.json()
  const channelIds = (data.items || []).map(
    (i: Record<string, unknown>) => (i.snippet as Record<string, string>).channelId,
  )

  if (channelIds.length === 0) return []

  const statsUrl = new URL('https://www.googleapis.com/youtube/v3/channels')
  statsUrl.searchParams.set('part', 'snippet,statistics')
  statsUrl.searchParams.set('id', channelIds.join(','))
  statsUrl.searchParams.set('key', process.env.YOUTUBE_API_KEY!)

  const statsRes = await fetch(statsUrl.toString())
  if (!statsRes.ok) return []

  const statsData = await statsRes.json()

  const inRange = (statsData.items || []).filter((ch: Record<string, unknown>) => {
    const stats = ch.statistics as Record<string, string>
    const subs = parseInt(stats.subscriberCount || '0')
    return subs >= subsMin && subs <= subsMax
  })

  if (inRange.length === 0) return []

  const topCandidates = inRange.slice(0, 15)
  const enriched: CompetitorMatch[] = []

  for (const channel of topCandidates) {
    const stats = channel.statistics as Record<string, string>
    const snippet = channel.snippet as Record<string, unknown>
    const thumbnails = snippet.thumbnails as Record<string, { url: string }> | undefined

    const videosUrl = new URL('https://www.googleapis.com/youtube/v3/search')
    videosUrl.searchParams.set('part', 'snippet')
    videosUrl.searchParams.set('channelId', channel.id as string)
    videosUrl.searchParams.set('order', 'date')
    videosUrl.searchParams.set('type', 'video')
    videosUrl.searchParams.set('maxResults', '10')
    videosUrl.searchParams.set('key', process.env.YOUTUBE_API_KEY!)

    let subNiche: SubNicheResult = { sub_niche: 'General', keywords: [], confidence: 0 }

    try {
      const vRes = await fetch(videosUrl.toString())
      if (vRes.ok) {
        const vData = await vRes.json()
        const videos = (vData.items || []).map((v: Record<string, unknown>) => {
          const vs = v.snippet as Record<string, string>
          return { title: vs.title, description: vs.description }
        })
        subNiche = await detectSubNiche(videos)
      }
    } catch (err) {
      console.error('[matcher] Sub-niche enrichment failed:', err)
    }

    const matchScore = userSubNiche
      ? calculateSubNicheSimilarity(
          { sub_niche: userSubNiche.sub_niche, sub_niche_keywords: userSubNiche.keywords },
          { sub_niche: subNiche.sub_niche, sub_niche_keywords: subNiche.keywords },
        )
      : 0.5

    enriched.push({
      channelId: channel.id as string,
      channelName: snippet.title as string,
      subscriberCount: parseInt(stats.subscriberCount || '0'),
      totalViews: parseInt(stats.viewCount || '0'),
      thumbnail: thumbnails?.default?.url,
      tier,
      sub_niche: subNiche.sub_niche,
      sub_niche_keywords: subNiche.keywords,
      match_score: matchScore,
    })

    if (enriched.length >= count * 2) break
  }

  return enriched.sort((a, b) => b.match_score - a.match_score).slice(0, count)
}
