/**
 * app/api/cron/trend-detection/route.ts
 * GET /api/cron/trend-detection
 *
 * Runs every 6 hours: 0:00, 6:00, 12:00, 18:00 UTC (schedule: "0 0,6,12,18 * * *").
 * Checks all competitor channels for viral videos and updates velocity scores.
 *
 * Flow per competitor:
 *   1. Fetch last 5 videos via getRecentVideos (YouTube Data API)
 *   2. Fetch view counts via getVideoDetails
 *   3. Calculate velocity = viewCount / hoursOld
 *   4. Compare against viral threshold = (channelAvgViews / 48) * 3
 *   5. Upsert competitor_videos rows with updated velocity_score + is_viral
 *
 * Security: requires x-cron-secret header matching CRON_SECRET env var.
 */

import { NextResponse } from 'next/server'
import { assertCron } from '@/lib/cron-auth'
import { createServiceClient } from '@/lib/supabase'
import { getRecentVideos, getVideoDetails } from '@/lib/youtube-data'
import { upsertCompetitorVideos, type CompetitorVideoUpsertRow } from '@/lib/db-videos'
import { logError } from '@/lib/logger'

export async function GET(request: Request) {
  // ── Auth check ─────────────────────────────────────────────────────────────
  const denied = assertCron(request)
  if (denied) return denied

  const supabase = createServiceClient()

  // ── Load all active competitors ────────────────────────────────────────────
  const { data: competitors, error } = await supabase
    .from('competitors')
    .select('id, youtube_channel_id, channel_name')
    .eq('is_active', true)

  if (error) {
    console.error('[cron/trend-detection] Failed to load competitors:', error.message)
    void logError({
      route: 'cron/trend-detection',
      error: error.message,
    })
    return NextResponse.json({ error: 'Failed to load competitors' }, { status: 500 })
  }

  const competitorList = competitors ?? []
  console.log(`[cron/trend-detection] Checking ${competitorList.length} competitor(s)`)

  let channelsChecked = 0
  let viralVideosFound = 0

  for (const competitor of competitorList) {
    if (
      !competitor.youtube_channel_id ||
      !competitor.youtube_channel_id.startsWith('UC') ||
      competitor.youtube_channel_id.length !== 24
    ) {
      console.log(`[cron/trend-detection] Skipping fake channel: ${competitor.channel_name}`)
      continue
    }

    try {
      // ── Fetch last 5 videos from YouTube ──────────────────────────────────
      const summaries = await getRecentVideos(competitor.youtube_channel_id, 5)
      if (summaries.length === 0) {
        channelsChecked++
        continue
      }

      const videoIds = summaries.map((v) => v.videoId)

      // ── Fetch view counts via Data API ─────────────────────────────────────
      const details = await getVideoDetails(videoIds)
      if (details.length === 0) {
        channelsChecked++
        continue
      }

      // Build lookup: videoId → detail
      const detailMap = new Map(details.map((d) => [d.videoId, d]))

      // ── Calculate channel average views from existing competitor_videos ────
      const { data: existingVideos } = await supabase
        .from('competitor_videos')
        .select('view_count')
        .eq('competitor_id', competitor.id)

      const existingViewCounts = (existingVideos ?? [])
        .map((v) => v.view_count as number)
        .filter((n) => typeof n === 'number' && n > 0)

      const channelAvgViews =
        existingViewCounts.length > 0
          ? existingViewCounts.reduce((sum, n) => sum + n, 0) / existingViewCounts.length
          : 0

      const now = Date.now()

      const videoRows: CompetitorVideoUpsertRow[] = []
      for (const summary of summaries) {
        const detail = detailMap.get(summary.videoId)
        if (!detail) continue

        const publishedMs = new Date(summary.publishedAt).getTime()
        const hoursOld = Math.max((now - publishedMs) / (1000 * 60 * 60), 0.1) // floor at 0.1 to avoid divide-by-zero
        const velocity = detail.viewCount / hoursOld

        // Viral threshold: channel avg views per 48 hours × 3 multiplier
        const threshold = channelAvgViews > 0 ? (channelAvgViews / 48) * 3 : Infinity
        const isViral = hoursOld < 48 && velocity > threshold

        if (isViral) viralVideosFound++

        videoRows.push({
          competitor_id: competitor.id,
          youtube_video_id: summary.videoId,
          title: detail.title,
          published_at: summary.publishedAt,
          view_count: detail.viewCount,
          like_count: detail.likeCount,
          comment_count: detail.commentCount,
          duration_seconds: detail.duration,
          thumbnail_url: detail.thumbnailHighRes || detail.thumbnailDefault || null,
          velocity_score: Math.round(velocity * 100) / 100,
          performance_vs_avg:
            channelAvgViews > 0
              ? Math.round((detail.viewCount / channelAvgViews) * 100) / 100
              : null,
          is_viral: isViral,
          synced_at: new Date().toISOString(),
        })
      }

      // Single batched upsert per competitor (shared helper, checks + logs errors).
      await upsertCompetitorVideos(competitor.id, videoRows, {
        route: 'cron/trend-detection',
      })

      channelsChecked++
      console.log(
        `[cron/trend-detection] ${competitor.channel_name ?? competitor.youtube_channel_id}: checked ${summaries.length} videos`,
      )
    } catch (err) {
      console.error(
        `[cron/trend-detection] Failed for competitor ${competitor.id}:`,
        err,
      )
      void logError({
        route: 'cron/trend-detection',
        error: err instanceof Error ? err.message : String(err),
        details: {
          competitor_id: competitor.id,
          channel_name: competitor.channel_name,
          error_stack: err instanceof Error ? err.stack : undefined,
        },
      })
      channelsChecked++
    }
  }

  console.log(
    `[cron/trend-detection] Done — channels: ${channelsChecked}, viral: ${viralVideosFound}`,
  )

  return NextResponse.json({
    channelsChecked,
    viralVideosFound,
  })
}
