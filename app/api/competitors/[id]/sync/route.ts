import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { createServiceClient } from '@/lib/supabase'
import { logError } from '@/lib/logger'

function parseDuration(duration: string): number {
  const match = duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/)
  if (!match) return 0
  return parseInt(match[1] || '0') * 3600 + parseInt(match[2] || '0') * 60 + parseInt(match[3] || '0')
}

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = await params
    const supabase = createServiceClient()

    const { data: competitor } = await supabase
      .from('competitors')
      .select('id, youtube_channel_id, channel_name, user_id')
      .eq('id', id)
      .eq('user_id', session.user.id)
      .single()

    if (!competitor) {
      return NextResponse.json({ error: 'Competitor not found' }, { status: 404 })
    }

    const videosUrl = new URL('https://www.googleapis.com/youtube/v3/search')
    videosUrl.searchParams.set('part', 'snippet')
    videosUrl.searchParams.set('channelId', competitor.youtube_channel_id)
    videosUrl.searchParams.set('order', 'date')
    videosUrl.searchParams.set('type', 'video')
    videosUrl.searchParams.set('maxResults', '10')
    videosUrl.searchParams.set('key', process.env.YOUTUBE_API_KEY!)

    const videosRes = await fetch(videosUrl.toString())
    if (!videosRes.ok) {
      return NextResponse.json({ error: 'Failed to fetch videos from YouTube' }, { status: 500 })
    }

    const videosData = await videosRes.json()
    const videoIds = (videosData.items || [])
      .map((v: Record<string, unknown>) => (v.id as Record<string, unknown>)?.videoId)
      .filter(Boolean) as string[]

    if (videoIds.length === 0) {
      return NextResponse.json({ success: true, count: 0, message: 'No videos found' })
    }

    const statsUrl = new URL('https://www.googleapis.com/youtube/v3/videos')
    statsUrl.searchParams.set('part', 'snippet,statistics,contentDetails')
    statsUrl.searchParams.set('id', videoIds.join(','))
    statsUrl.searchParams.set('key', process.env.YOUTUBE_API_KEY!)

    const statsRes = await fetch(statsUrl.toString())
    if (!statsRes.ok) {
      return NextResponse.json({ error: 'Failed to fetch video stats' }, { status: 500 })
    }

    const statsData = await statsRes.json()
    const videos = (statsData.items || []).map((v: Record<string, unknown>) => {
      const snippet = v.snippet as Record<string, unknown>
      const stats = v.statistics as Record<string, unknown>
      const content = v.contentDetails as Record<string, unknown>
      const thumbs = snippet.thumbnails as Record<string, Record<string, string>>
      return {
        competitor_id: id,
        youtube_video_id: v.id as string,
        title: snippet.title as string,
        thumbnail_url: thumbs?.high?.url || thumbs?.default?.url || '',
        published_at: snippet.publishedAt as string,
        view_count: parseInt((stats.viewCount as string) || '0'),
        like_count: parseInt((stats.likeCount as string) || '0'),
        comment_count: parseInt((stats.commentCount as string) || '0'),
        duration_seconds: parseDuration((content.duration as string) || ''),
        synced_at: new Date().toISOString(),
      }
    })

    const { error } = await supabase
      .from('competitor_videos')
      .upsert(videos, { onConflict: 'youtube_video_id' })

    if (error) {
      console.error('[competitors/[id]/sync] DB error:', error.message)
      void logError({
        userId: session.user.id,
        route: 'api/competitors/[id]/sync',
        error: error.message,
        details: { competitor_id: id, channel_name: competitor.channel_name },
      })
      return NextResponse.json({ error: 'Failed to save videos' }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      count: videos.length,
      message: `Synced ${videos.length} videos for ${competitor.channel_name}`,
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error)
    console.error('[competitors/[id]/sync] Unexpected error:', error)
    void logError({
      userId: undefined,
      route: 'api/competitors/[id]/sync',
      error: message,
      details: { error_stack: error instanceof Error ? error.stack : undefined },
    })
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
