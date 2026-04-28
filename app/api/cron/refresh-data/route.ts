/**
 * app/api/cron/refresh-data/route.ts
 * GET /api/cron/refresh-data
 *
 * Runs every day at 3:00 AM UTC (schedule: "0 3 * * *").
 * For each active user runs TWO independent blocks:
 *
 * BLOCK 1 — User's own channel sync (POST /api/sync, requires OAuth)
 *   Failure here does NOT affect Block 2.
 *
 * BLOCK 2 — Competitor data sync (YouTube DATA API, public, no OAuth)
 *   Always runs regardless of Block 1 outcome.
 *   Each competitor has its own try/catch — one failure never blocks others.
 *
 * Security: requires Authorization: Bearer <CRON_SECRET> header.
 */

import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { saveCompetitorSnapshot, updateCompetitorMetrics, getRecentCompetitorVideos } from '@/lib/db'

function parseDuration(duration: string): number {
  const match = duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/)
  if (!match) return 0
  return parseInt(match[1] || '0') * 3600 + parseInt(match[2] || '0') * 60 + parseInt(match[3] || '0')
}

interface CompetitorVideoRow {
  view_count: number | null
  duration_seconds: number | null
  velocity_score: number | null
  published_at: string | null
}

function calculateCompetitorMetrics(
  recentVideos: CompetitorVideoRow[],
  allVideoCount: number | null,
) {
  if (recentVideos.length === 0) {
    return {
      video_count: allVideoCount ?? 0,
      avg_views_per_video: 0,
      avg_video_length_seconds: 0,
      upload_frequency_30d: 0,
      velocity_score_avg: 0,
    }
  }

  const avg_views_per_video =
    recentVideos.reduce((sum, v) => sum + (v.view_count ?? 0), 0) / recentVideos.length

  const avg_video_length_seconds =
    recentVideos.reduce((sum, v) => sum + (v.duration_seconds ?? 0), 0) / recentVideos.length

  // Videos per month from the 30-day window
  const upload_frequency_30d = recentVideos.length

  const velocityVideos = recentVideos.filter((v) => v.velocity_score != null)
  const velocity_score_avg =
    velocityVideos.length > 0
      ? velocityVideos.reduce((sum, v) => sum + (v.velocity_score ?? 0), 0) / velocityVideos.length
      : 0

  return {
    video_count: allVideoCount ?? recentVideos.length,
    avg_views_per_video: Math.round(avg_views_per_video),
    avg_video_length_seconds: Math.round(avg_video_length_seconds),
    upload_frequency_30d,
    velocity_score_avg: Math.round(velocity_score_avg * 10) / 10,
  }
}

async function syncCompetitorVideos(
  supabase: ReturnType<typeof createServiceClient>,
  competitorId: string,
  youtubeChannelId: string,
): Promise<{ success: boolean; count: number; subscriberCount: number | null; totalViews: number | null }> {
  try {
    // Fetch channel stats to get subscriber count and total views
    const channelUrl = new URL('https://www.googleapis.com/youtube/v3/channels')
    channelUrl.searchParams.set('part', 'statistics')
    channelUrl.searchParams.set('id', youtubeChannelId)
    channelUrl.searchParams.set('key', process.env.YOUTUBE_API_KEY!)

    const channelRes = await fetch(channelUrl.toString())
    let subscriberCount: number | null = null
    let totalViews: number | null = null

    if (channelRes.ok) {
      const channelData = await channelRes.json()
      const stats = channelData.items?.[0]?.statistics
      if (stats) {
        subscriberCount = parseInt(stats.subscriberCount || '0') || null
        totalViews = parseInt(stats.viewCount || '0') || null
      }
    }

    const videosUrl = new URL('https://www.googleapis.com/youtube/v3/search')
    videosUrl.searchParams.set('part', 'snippet')
    videosUrl.searchParams.set('channelId', youtubeChannelId)
    videosUrl.searchParams.set('order', 'date')
    videosUrl.searchParams.set('type', 'video')
    videosUrl.searchParams.set('maxResults', '10')
    videosUrl.searchParams.set('key', process.env.YOUTUBE_API_KEY!)

    const videosRes = await fetch(videosUrl.toString())
    if (!videosRes.ok) return { success: false, count: 0, subscriberCount, totalViews }

    const videosData = await videosRes.json()
    const videoIds = (videosData.items || [])
      .map((v: Record<string, unknown>) => (v.id as Record<string, unknown>)?.videoId)
      .filter(Boolean) as string[]

    if (videoIds.length === 0) return { success: true, count: 0, subscriberCount, totalViews }

    const statsUrl = new URL('https://www.googleapis.com/youtube/v3/videos')
    statsUrl.searchParams.set('part', 'snippet,statistics,contentDetails')
    statsUrl.searchParams.set('id', videoIds.join(','))
    statsUrl.searchParams.set('key', process.env.YOUTUBE_API_KEY!)

    const statsRes = await fetch(statsUrl.toString())
    if (!statsRes.ok) return { success: false, count: 0, subscriberCount, totalViews }

    const statsData = await statsRes.json()
    const videos = (statsData.items || []).map((v: Record<string, unknown>) => {
      const snippet = v.snippet as Record<string, unknown>
      const stats = v.statistics as Record<string, unknown>
      const content = v.contentDetails as Record<string, unknown>
      const thumbs = snippet.thumbnails as Record<string, Record<string, string>>
      const viewCount = parseInt((stats.viewCount as string) || '0')
      const publishedAt = snippet.publishedAt as string
      const durationSecs = parseDuration((content.duration as string) || '')

      // Compute velocity score: views / hours since published, capped at 48h window
      const hoursOld = (Date.now() - new Date(publishedAt).getTime()) / 3_600_000
      const velocityScore = hoursOld > 0 && hoursOld <= 48 ? Math.round((viewCount / hoursOld) * 10) / 10 : null

      return {
        competitor_id: competitorId,
        youtube_video_id: v.id as string,
        title: snippet.title as string,
        thumbnail_url: thumbs?.high?.url || thumbs?.default?.url || '',
        published_at: publishedAt,
        view_count: viewCount,
        like_count: parseInt((stats.likeCount as string) || '0'),
        comment_count: parseInt((stats.commentCount as string) || '0'),
        duration_seconds: durationSecs,
        velocity_score: velocityScore,
        synced_at: new Date().toISOString(),
      }
    })

    const { error } = await supabase
      .from('competitor_videos')
      .upsert(videos, { onConflict: 'youtube_video_id' })

    if (error) {
      console.error(`[syncCompetitorVideos] Upsert error for ${competitorId}:`, error.message)
      return { success: false, count: 0, subscriberCount, totalViews }
    }

    return { success: true, count: videos.length, subscriberCount, totalViews }
  } catch (err) {
    console.error(`[syncCompetitorVideos] Error for ${competitorId}:`, err)
    return { success: false, count: 0, subscriberCount: null, totalViews: null }
  }
}

export async function GET(request: Request) {
  const startMs = Date.now()

  // ── Auth check ─────────────────────────────────────────────────────────────
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createServiceClient()
  console.log('[cron/refresh-data] Starting daily refresh')

  // ── Load eligible users ────────────────────────────────────────────────────
  const { data: users, error } = await supabase
    .from('users')
    .select('id')
    .eq('onboarding_completed', true)
    .in('subscription_status', ['on_trial', 'active', 'past_due'])
    .not('youtube_access_token', 'is', null)

  if (error) {
    console.error('[cron/refresh-data] Failed to load users:', error.message)
    return NextResponse.json({ error: 'Failed to load users' }, { status: 500 })
  }

  const userList = users ?? []
  console.log(`[cron/refresh-data] Found ${userList.length} active users`)

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'
  let succeeded = 0
  let failed = 0
  let totalSnapshotsWritten = 0

  for (const user of userList) {
    // ── BLOCK 1: User's own channel sync ──────────────────────────────────────
    // Requires user OAuth token. Failure here is logged but NEVER stops Block 2.
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
        console.error(
          `[cron/refresh-data] User channel sync failed for ${user.id}: HTTP ${res.status} — ${body}`
        )
        failed++
        // DO NOT throw — fall through to Block 2
      } else {
        console.log(`[cron/refresh-data] User ${user.id}: channel sync succeeded`)
        succeeded++
      }
    } catch (err) {
      console.error(`[cron/refresh-data] User channel sync error for ${user.id}:`, err)
      failed++
      // DO NOT continue — fall through to Block 2
    }

    // ── BLOCK 2: Competitor data sync ─────────────────────────────────────────
    // Uses YouTube DATA API (public, no OAuth). Always runs regardless of Block 1.
    // Each competitor has its own try/catch — one failure never blocks others.
    try {
      const { data: userCompetitors, error: compErr } = await supabase
        .from('competitors')
        .select('id, youtube_channel_id, channel_name, video_count')
        .eq('user_id', user.id)
        .eq('is_active', true)

      if (compErr) throw compErr

      let competitorCount = 0

      for (const comp of userCompetitors ?? []) {
        try {
          // Skip channels with invalid YouTube IDs — real IDs start with 'UC' and are 24 chars
          if (
            !comp.youtube_channel_id ||
            !comp.youtube_channel_id.startsWith('UC') ||
            comp.youtube_channel_id.length !== 24
          ) {
            console.log(
              `[cron/refresh-data] Skipping channel with invalid ID: ${comp.channel_name} (${comp.youtube_channel_id})`
            )
            continue
          }

          const syncResult = await syncCompetitorVideos(supabase, comp.id, comp.youtube_channel_id)

          if (!syncResult.success) {
            console.warn(`[cron/refresh-data]   ${comp.channel_name}: sync failed — skipping snapshot`)
            continue
          }

          // Compute metrics from videos published in last 30 days
          const recentVideos = await getRecentCompetitorVideos(comp.id, 30)
          const metrics = calculateCompetitorMetrics(recentVideos, comp.video_count ?? null)

          // Update metric columns on the competitors row
          await updateCompetitorMetrics(comp.id, {
            ...(syncResult.subscriberCount != null ? { subscriber_count: syncResult.subscriberCount } : {}),
            ...(syncResult.totalViews != null ? { total_views: syncResult.totalViews } : {}),
            video_count: metrics.video_count,
            avg_views_per_video: metrics.avg_views_per_video,
            avg_video_length_seconds: metrics.avg_video_length_seconds,
            upload_frequency_30d: metrics.upload_frequency_30d,
            last_synced_at: new Date().toISOString(),
          })

          // Write today's competitor_snapshots row — only if we have a real subscriber count
          if (syncResult.subscriberCount != null) {
            await saveCompetitorSnapshot(comp.id, {
              subscriber_count: syncResult.subscriberCount,
              ...(syncResult.totalViews != null ? { total_views: syncResult.totalViews } : {}),
              video_count: metrics.video_count,
              avg_views_per_video: metrics.avg_views_per_video,
              avg_video_length_seconds: metrics.avg_video_length_seconds,
              upload_frequency_30d: metrics.upload_frequency_30d,
              velocity_score_avg: metrics.velocity_score_avg,
            })
            totalSnapshotsWritten++
            console.log(`[cron/refresh-data]   ${comp.channel_name}: ${syncResult.count} videos, snapshot written`)
          } else {
            console.warn(`[cron/refresh-data]   ${comp.channel_name}: no subscriber_count — snapshot skipped`)
          }

          competitorCount++
        } catch (compErr) {
          console.error(
            `[cron/refresh-data] Failed to sync competitor ${comp.channel_name} (${comp.id}):`,
            compErr
          )
          // Continue to next competitor — one failure never blocks others
        }
      }

      console.log(
        `[cron/refresh-data] User ${user.id}: synced ${competitorCount} competitors`
      )

      // Wipe per-user insights cache after competitor data is refreshed
      await supabase
        .from('competitors')
        .update({ insights: null, insights_generated_at: null })
        .eq('user_id', user.id)
    } catch (blockErr) {
      console.error(
        `[cron/refresh-data] Competitor sync block failed for user ${user.id}:`,
        blockErr
      )
    }

    // Throttle between users to avoid rate limits
    if (userList.indexOf(user) < userList.length - 1) {
      await new Promise((resolve) => setTimeout(resolve, 1000))
    }
  }

  const elapsed = Date.now() - startMs
  console.log(`[cron/refresh-data] Completed in ${elapsed}ms — succeeded: ${succeeded}, failed: ${failed}, snapshots: ${totalSnapshotsWritten}`)

  return NextResponse.json({
    processed: userList.length,
    succeeded,
    failed,
    snapshots_written: totalSnapshotsWritten,
    elapsed_ms: elapsed,
  })
}
