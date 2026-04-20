import { createServiceClient } from '@/lib/supabase'
import { detectSubNiche } from './sub-niche-detector'

export interface SearchedChannelData {
  channel_id: string
  channel_name: string
  channel_description: string
  channel_thumbnail: string
  subscriber_count: number
  total_views: number
  video_count: number
  published_at: string
  country: string | null
  niche_id: string | null
  sub_niche: string | null
  sub_niche_keywords: string[]
  recent_videos: Array<{
    video_id: string
    title: string
    description: string
    published_at: string
    view_count: number
    like_count: number
    comment_count: number
    duration_seconds: number
    thumbnail: string
  }>
  cached: boolean
}

export async function normalizeChannelInput(
  input: string,
): Promise<{ channel_id: string | null; error?: string }> {
  const trimmed = input.trim()

  if (!trimmed) {
    return { channel_id: null, error: 'Empty input' }
  }

  if (/^UC[a-zA-Z0-9_-]{22}$/.test(trimmed)) {
    return { channel_id: trimmed }
  }

  const handleMatch = trimmed.match(/^@([a-zA-Z0-9_\-.]+)$/)
  if (handleMatch) {
    return resolveHandleToChannelId(handleMatch[1])
  }

  const urlPatterns = [
    /youtube\.com\/channel\/(UC[a-zA-Z0-9_-]{22})/,
    /youtube\.com\/@([a-zA-Z0-9_\-.]+)/,
    /youtube\.com\/c\/([a-zA-Z0-9_\-.]+)/,
    /youtube\.com\/user\/([a-zA-Z0-9_\-.]+)/,
    /youtu\.be\/@([a-zA-Z0-9_\-.]+)/,
  ]

  for (const pattern of urlPatterns) {
    const match = trimmed.match(pattern)
    if (match) {
      if (match[1].startsWith('UC')) {
        return { channel_id: match[1] }
      }
      return resolveHandleToChannelId(match[1])
    }
  }

  return searchChannelByName(trimmed)
}

async function resolveHandleToChannelId(
  handle: string,
): Promise<{ channel_id: string | null; error?: string }> {
  try {
    const url = new URL('https://www.googleapis.com/youtube/v3/channels')
    url.searchParams.set('part', 'id')
    url.searchParams.set('forHandle', handle)
    url.searchParams.set('key', process.env.YOUTUBE_API_KEY!)

    const res = await fetch(url.toString())
    if (!res.ok) return { channel_id: null, error: 'YouTube API error' }

    const data = await res.json()
    if (data.items && data.items.length > 0) {
      return { channel_id: data.items[0].id }
    }

    return searchChannelByName(handle)
  } catch {
    return { channel_id: null, error: 'Failed to resolve handle' }
  }
}

async function searchChannelByName(
  name: string,
): Promise<{ channel_id: string | null; error?: string }> {
  try {
    const url = new URL('https://www.googleapis.com/youtube/v3/search')
    url.searchParams.set('part', 'snippet')
    url.searchParams.set('type', 'channel')
    url.searchParams.set('q', name)
    url.searchParams.set('maxResults', '1')
    url.searchParams.set('key', process.env.YOUTUBE_API_KEY!)

    const res = await fetch(url.toString())
    if (!res.ok) return { channel_id: null, error: 'YouTube API error' }

    const data = await res.json()
    if (data.items && data.items.length > 0) {
      return { channel_id: data.items[0].snippet.channelId }
    }

    return { channel_id: null, error: 'Channel not found' }
  } catch {
    return { channel_id: null, error: 'Search failed' }
  }
}

export async function getChannelData(
  channelId: string,
  useCache: boolean = true,
): Promise<SearchedChannelData | null> {
  const supabase = createServiceClient()

  if (useCache) {
    const { data: cached } = await supabase
      .from('searched_channels_cache')
      .select('*')
      .eq('channel_id', channelId)
      .gt('expires_at', new Date().toISOString())
      .single()

    if (cached) {
      await supabase
        .from('searched_channels_cache')
        .update({ search_count: (cached.search_count || 1) + 1 })
        .eq('channel_id', channelId)

      return {
        ...(cached.channel_data as SearchedChannelData),
        cached: true,
      }
    }
  }

  const channelData = await fetchChannelFromYouTube(channelId)
  if (!channelData) return null

  await supabase.from('searched_channels_cache').upsert(
    {
      channel_id: channelId,
      channel_name: channelData.channel_name,
      channel_data: channelData,
      sub_niche: channelData.sub_niche,
      sub_niche_keywords: channelData.sub_niche_keywords,
      cached_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      search_count: 1,
    },
    { onConflict: 'channel_id' },
  )

  return { ...channelData, cached: false }
}

async function fetchChannelFromYouTube(channelId: string): Promise<SearchedChannelData | null> {
  try {
    const channelUrl = new URL('https://www.googleapis.com/youtube/v3/channels')
    channelUrl.searchParams.set('part', 'snippet,statistics,contentDetails')
    channelUrl.searchParams.set('id', channelId)
    channelUrl.searchParams.set('key', process.env.YOUTUBE_API_KEY!)

    const channelRes = await fetch(channelUrl.toString())
    if (!channelRes.ok) return null

    const channelData = await channelRes.json()
    const channel = channelData.items?.[0]
    if (!channel) return null

    const videosUrl = new URL('https://www.googleapis.com/youtube/v3/search')
    videosUrl.searchParams.set('part', 'snippet')
    videosUrl.searchParams.set('channelId', channelId)
    videosUrl.searchParams.set('order', 'date')
    videosUrl.searchParams.set('type', 'video')
    videosUrl.searchParams.set('maxResults', '30')
    videosUrl.searchParams.set('key', process.env.YOUTUBE_API_KEY!)

    const videosRes = await fetch(videosUrl.toString())
    let recentVideos: SearchedChannelData['recent_videos'] = []

    if (videosRes.ok) {
      const videosData = await videosRes.json()
      const videoIds = (videosData.items || [])
        .map((v: Record<string, unknown>) => {
          const id = v.id as Record<string, string>
          return id.videoId
        })
        .filter(Boolean)

      if (videoIds.length > 0) {
        const statsUrl = new URL('https://www.googleapis.com/youtube/v3/videos')
        statsUrl.searchParams.set('part', 'snippet,statistics,contentDetails')
        statsUrl.searchParams.set('id', videoIds.join(','))
        statsUrl.searchParams.set('key', process.env.YOUTUBE_API_KEY!)

        const statsRes = await fetch(statsUrl.toString())
        if (statsRes.ok) {
          const statsData = await statsRes.json()
          recentVideos = (statsData.items || []).map((v: Record<string, unknown>) => {
            const snippet = v.snippet as Record<string, unknown>
            const statistics = v.statistics as Record<string, string>
            const contentDetails = v.contentDetails as Record<string, string>
            const thumbnails = snippet.thumbnails as Record<string, { url: string }> | undefined
            return {
              video_id: v.id as string,
              title: snippet.title as string,
              description: (snippet.description as string) || '',
              published_at: snippet.publishedAt as string,
              view_count: parseInt(statistics.viewCount || '0'),
              like_count: parseInt(statistics.likeCount || '0'),
              comment_count: parseInt(statistics.commentCount || '0'),
              duration_seconds: parseDuration(contentDetails.duration || ''),
              thumbnail: thumbnails?.high?.url || thumbnails?.default?.url || '',
            }
          })
        }
      }
    }

    const subNiche =
      recentVideos.length >= 3
        ? await detectSubNiche(
            recentVideos.slice(0, 20).map((v) => ({
              title: v.title,
              description: v.description,
            })),
          )
        : { sub_niche: 'General', keywords: [], confidence: 0 }

    const snippet = channel.snippet as Record<string, unknown>
    const statistics = channel.statistics as Record<string, string>
    const thumbnails = snippet.thumbnails as Record<string, { url: string }> | undefined

    return {
      channel_id: channel.id as string,
      channel_name: snippet.title as string,
      channel_description: (snippet.description as string) || '',
      channel_thumbnail: thumbnails?.high?.url || thumbnails?.default?.url || '',
      subscriber_count: parseInt(statistics.subscriberCount || '0'),
      total_views: parseInt(statistics.viewCount || '0'),
      video_count: parseInt(statistics.videoCount || '0'),
      published_at: snippet.publishedAt as string,
      country: (snippet.country as string) || null,
      niche_id: null,
      sub_niche: subNiche.sub_niche,
      sub_niche_keywords: subNiche.keywords,
      recent_videos: recentVideos,
      cached: false,
    }
  } catch (error) {
    console.error('[channel-search] Fetch failed:', error)
    return null
  }
}

function parseDuration(duration: string): number {
  const match = duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/)
  if (!match) return 0
  const hours = parseInt(match[1] || '0')
  const minutes = parseInt(match[2] || '0')
  const seconds = parseInt(match[3] || '0')
  return hours * 3600 + minutes * 60 + seconds
}
