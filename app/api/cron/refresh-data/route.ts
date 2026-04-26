/**
 * app/api/cron/refresh-data/route.ts
 * GET /api/cron/refresh-data
 *
 * Runs every day at 3:00 AM UTC (schedule: "0 3 * * *").
 * Refreshes channel snapshots and competitor video data for all active users
 * by calling the existing POST /api/sync endpoint with a cron bypass header.
 *
 * Security: requires x-cron-secret header matching CRON_SECRET env var.
 * Never lets one user's failure stop the whole batch.
 */

import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'

function parseDuration(duration: string): number {
  const match = duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/)
  if (!match) return 0
  return parseInt(match[1] || '0') * 3600 + parseInt(match[2] || '0') * 60 + parseInt(match[3] || '0')
}

async function syncCompetitorVideos(
  supabase: ReturnType<typeof createServiceClient>,
  competitorId: string,
  youtubeChannelId: string,
): Promise<{ success: boolean; count: number }> {
  try {
    const videosUrl = new URL('https://www.googleapis.com/youtube/v3/search')
    videosUrl.searchParams.set('part', 'snippet')
    videosUrl.searchParams.set('channelId', youtubeChannelId)
    videosUrl.searchParams.set('order', 'date')
    videosUrl.searchParams.set('type', 'video')
    videosUrl.searchParams.set('maxResults', '10')
    videosUrl.searchParams.set('key', process.env.YOUTUBE_API_KEY!)

    const videosRes = await fetch(videosUrl.toString())
    if (!videosRes.ok) return { success: false, count: 0 }

    const videosData = await videosRes.json()
    const videoIds = (videosData.items || [])
      .map((v: Record<string, unknown>) => (v.id as Record<string, unknown>)?.videoId)
      .filter(Boolean) as string[]

    if (videoIds.length === 0) return { success: true, count: 0 }

    const statsUrl = new URL('https://www.googleapis.com/youtube/v3/videos')
    statsUrl.searchParams.set('part', 'snippet,statistics,contentDetails')
    statsUrl.searchParams.set('id', videoIds.join(','))
    statsUrl.searchParams.set('key', process.env.YOUTUBE_API_KEY!)

    const statsRes = await fetch(statsUrl.toString())
    if (!statsRes.ok) return { success: false, count: 0 }

    const statsData = await statsRes.json()
    const videos = (statsData.items || []).map((v: Record<string, unknown>) => {
      const snippet = v.snippet as Record<string, unknown>
      const stats = v.statistics as Record<string, unknown>
      const content = v.contentDetails as Record<string, unknown>
      const thumbs = snippet.thumbnails as Record<string, Record<string, string>>
      return {
        competitor_id: competitorId,
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
      console.error(`[syncCompetitorVideos] Upsert error for ${competitorId}:`, error.message)
      return { success: false, count: 0 }
    }

    return { success: true, count: videos.length }
  } catch (err) {
    console.error(`[syncCompetitorVideos] Error for ${competitorId}:`, err)
    return { success: false, count: 0 }
  }
}

export async function GET(request: Request) {
  // ── Auth check ─────────────────────────────────────────────────────────────
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createServiceClient()

  // ── Load eligible users ────────────────────────────────────────────────────
  const { data: users, error } = await supabase
    .from('users')
    .select('id')
    .eq('onboarding_completed', true)
    .in('subscription_status', ['trial', 'starter', 'pro'])
    .not('youtube_access_token', 'is', null)

  if (error) {
    console.error('[cron/refresh-data] Failed to load users:', error.message)
    return NextResponse.json({ error: 'Failed to load users' }, { status: 500 })
  }

  const userList = users ?? []
  console.log(`[cron/refresh-data] Processing ${userList.length} user(s)`)

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'
  let succeeded = 0
  let failed = 0

  for (const user of userList) {
    try {
      const res = await fetch(`${appUrl}/api/sync`, {
        method: 'POST',
        headers: {
          'x-cron-user-id': user.id,
          'x-cron-secret': process.env.CRON_SECRET ?? '',
        },
      })

      if (!res.ok) {
        const body = await res.text()
        throw new Error(`HTTP ${res.status}: ${body}`)
      }

      succeeded++
      console.log(`[cron/refresh-data] Synced user ${user.id}`)

      // Sync competitor videos for this user
      const { data: userCompetitors } = await supabase
        .from('competitors')
        .select('id, youtube_channel_id, channel_name')
        .eq('user_id', user.id)
        .eq('is_active', true)

      for (const comp of userCompetitors ?? []) {
        if (!comp.youtube_channel_id) continue
        const result = await syncCompetitorVideos(supabase, comp.id, comp.youtube_channel_id)
        console.log(`[cron/refresh-data]   ${comp.channel_name}: ${result.count} videos`)
      }
    } catch (err) {
      failed++
      console.error(`[cron/refresh-data] Failed for user ${user.id}:`, err)
    }

    // 1 second delay between users
    if (userList.indexOf(user) < userList.length - 1) {
      await new Promise((resolve) => setTimeout(resolve, 1000))
    }
  }

  console.log(`[cron/refresh-data] Done — succeeded: ${succeeded}, failed: ${failed}`)

  return NextResponse.json({
    processed: userList.length,
    succeeded,
    failed,
  })
}
