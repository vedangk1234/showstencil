import { config } from 'dotenv'
config({ path: '.env.local', override: true })

// ---------------------------------------------------------------------------
// FILTERS — edit these before running
// ---------------------------------------------------------------------------
const CATEGORY =
  'finance' as
  | 'finance' | 'tech' | 'gaming' | 'cooking' | 'fitness'
  | 'beauty' | 'travel' | 'education' | 'business'
  | 'entertainment' | 'diy' | 'vlog'

const GENDER: 'male' | 'female' | 'any' = 'any'

const MIN_SUBS             = 10_000
const MAX_SUBS             = 500_000
const MIN_UPLOADS_LAST_MONTH = 2
const COUNTRY              = 'US'
const RESULTS_MIN          = 4
const RESULTS_MAX          = 10
// ---------------------------------------------------------------------------

const API_KEY = process.env.YOUTUBE_API_KEY
if (!API_KEY) {
  console.error('ERROR: YOUTUBE_API_KEY is not set in .env.local')
  process.exit(1)
}

const BASE_URL = 'https://www.googleapis.com/youtube/v3'

const NICHE_QUERIES: Record<string, string> = {
  finance:       'personal finance investing money tips',
  tech:          'technology review gadgets',
  gaming:        'gaming gameplay walkthrough',
  cooking:       'cooking recipes food',
  fitness:       'fitness workout exercise',
  beauty:        'beauty makeup skincare tutorial',
  travel:        'travel vlog adventure',
  education:     'educational learning tutorial',
  business:      'entrepreneur business growth strategy',
  entertainment: 'entertainment funny videos',
  diy:           'DIY crafts home improvement',
  vlog:          'daily vlog lifestyle',
}

interface ChannelItem {
  id: string
  snippet: {
    title: string
    description: string
    country?: string
  }
  statistics: {
    subscriberCount?: string
    hiddenSubscriberCount?: boolean
  }
}

interface CreatorResult {
  channelId: string
  channelName: string
  subscriberCount: number
  uploadsLastMonth: number
  url: string
  description: string
  country: string
}

async function searchChannelIds(
  query: string,
  pageToken?: string,
): Promise<{ channelIds: string[]; nextPageToken?: string }> {
  const params = new URLSearchParams({
    part: 'id',
    type: 'channel',
    q: query,
    regionCode: COUNTRY,
    relevanceLanguage: 'en',
    maxResults: '50',
    key: API_KEY!,
    ...(pageToken ? { pageToken } : {}),
  })
  const res = await fetch(`${BASE_URL}/search?${params}`)
  const data = await res.json()
  if (!res.ok) throw new Error(`search.list failed: ${data.error?.message ?? JSON.stringify(data.error)}`)
  const channelIds: string[] = (data.items ?? [])
    .map((item: { id: { channelId?: string } }) => item.id?.channelId)
    .filter(Boolean)
  return { channelIds, nextPageToken: data.nextPageToken }
}

async function fetchChannelStats(channelIds: string[]): Promise<ChannelItem[]> {
  const params = new URLSearchParams({
    part: 'snippet,statistics',
    id: channelIds.join(','),
    key: API_KEY!,
  })
  const res = await fetch(`${BASE_URL}/channels?${params}`)
  const data = await res.json()
  if (!res.ok) throw new Error(`channels.list failed: ${data.error?.message ?? JSON.stringify(data.error)}`)
  return data.items ?? []
}

async function countUploadsLastMonth(channelId: string, channelName: string): Promise<number> {
  const publishedAfter = new Date()
  publishedAfter.setDate(publishedAfter.getDate() - 30)
  const params = new URLSearchParams({
    part: 'id',
    channelId,
    type: 'video',
    publishedAfter: publishedAfter.toISOString(),
    maxResults: '50',
    key: API_KEY!,
  })
  const res = await fetch(`${BASE_URL}/search?${params}`)
  const data = await res.json()
  if (!res.ok) {
    console.warn(`    Could not fetch recent uploads for ${channelName}: ${data.error?.message}`)
    return 0
  }
  return (data.items ?? []).length
}

async function main() {
  if (GENDER !== 'any') {
    console.warn(`\n⚠  WARNING: YouTube Data API does not provide creator gender data.`)
    console.warn(`   GENDER is set to '${GENDER}' but will be ignored — all matching channels will be returned.\n`)
  }

  const query = NICHE_QUERIES[CATEGORY]
  if (!query) {
    console.error(`Unknown CATEGORY: '${CATEGORY}'. Must be one of: ${Object.keys(NICHE_QUERIES).join(', ')}`)
    process.exit(1)
  }

  console.log(`\nSearching for ${CATEGORY} creators in ${COUNTRY}`)
  console.log(`  Subs:         ${MIN_SUBS.toLocaleString()} – ${MAX_SUBS.toLocaleString()}`)
  console.log(`  Min uploads:  ${MIN_UPLOADS_LAST_MONTH}/month`)
  console.log(`  Query:        "${query}"\n`)

  const results: CreatorResult[] = []
  let nextPageToken: string | undefined
  let pagesSearched = 0
  const MAX_PAGES = 5

  outer: while (results.length < RESULTS_MAX && pagesSearched < MAX_PAGES) {
    const { channelIds, nextPageToken: newToken } = await searchChannelIds(query, nextPageToken)
    pagesSearched++
    nextPageToken = newToken

    if (channelIds.length === 0) break

    const channels = await fetchChannelStats(channelIds)

    for (const ch of channels) {
      if (results.length >= RESULTS_MAX) break outer

      if (ch.statistics.hiddenSubscriberCount) {
        console.log(`  skip  ${ch.snippet.title} — hidden subscriber count`)
        continue
      }

      // Skip channels that have explicitly set a non-US country
      if (ch.snippet.country && ch.snippet.country !== 'US') {
        console.log(`  skip  ${ch.snippet.title} — country: ${ch.snippet.country}`)
        continue
      }

      const subs = parseInt(ch.statistics.subscriberCount ?? '0', 10)
      if (subs < MIN_SUBS || subs > MAX_SUBS) {
        console.log(`  skip  ${ch.snippet.title} — ${subs.toLocaleString()} subs`)
        continue
      }

      process.stdout.write(`  check ${ch.snippet.title} (${subs.toLocaleString()} subs) — uploads... `)
      const uploads = await countUploadsLastMonth(ch.id, ch.snippet.title)

      if (uploads < MIN_UPLOADS_LAST_MONTH) {
        console.log(`${uploads} last 30d — skip`)
        continue
      }
      console.log(`${uploads} last 30d ✓`)

      results.push({
        channelId: ch.id,
        channelName: ch.snippet.title,
        subscriberCount: subs,
        uploadsLastMonth: uploads,
        url: `https://www.youtube.com/channel/${ch.id}`,
        description: (ch.snippet.description ?? '').slice(0, 100),
        country: ch.snippet.country ?? 'not set',
      })
    }

    if (!nextPageToken) break
  }

  console.log()

  if (results.length === 0) {
    console.log('No channels found matching all filters.')
    console.log('Try: increasing MAX_SUBS, decreasing MIN_SUBS, or lowering MIN_UPLOADS_LAST_MONTH.')
    return
  }

  if (results.length < RESULTS_MIN) {
    console.log(`Note: only ${results.length} channel(s) found (target minimum was ${RESULTS_MIN}). Consider loosening filters.\n`)
  }

  console.log('='.repeat(64))
  console.log(`RESULTS  ${results.length} creator${results.length === 1 ? '' : 's'} matched`)
  console.log('='.repeat(64))

  for (const [i, c] of results.entries()) {
    console.log(`\n${i + 1}. ${c.channelName}`)
    console.log(`   Subscribers:         ${c.subscriberCount.toLocaleString()}`)
    console.log(`   Uploads last 30d:    ${c.uploadsLastMonth}`)
    console.log(`   Country:             ${c.country}`)
    console.log(`   URL:                 ${c.url}`)
    console.log(`   Description:         ${c.description || '(none)'}`)
  }

  console.log()
}

main().catch((err: Error) => {
  console.error('Fatal:', err.message)
  process.exit(1)
})