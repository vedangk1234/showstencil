/**
 * scripts/sync-competitor-videos.ts
 * One-time utility: force-fetch videos for a specific competitor and insert them.
 *
 * Usage:
 *   npx tsx --env-file=.env.local scripts/sync-competitor-videos.ts
 */

import { config } from 'dotenv'
config({ path: '.env.local', override: true })

import { getCompetitorFullProfile } from '../lib/youtube-data'
import { createServiceClient } from '../lib/supabase'
import { updateCompetitorMetrics, saveCompetitorSnapshot } from '../lib/db'
import { calculateCompetitorMetrics } from '../lib/competitor-metrics'

const TEST_EMAIL = 'vedangk2912@gmail.com'
const CHANNEL_NAME = 'Graham Stephan'

async function main() {
  const supabase = createServiceClient()

  const { data: userRow } = await supabase
    .from('users')
    .select('id')
    .eq('email', TEST_EMAIL)
    .single()

  if (!userRow) {
    console.error('User not found for email:', TEST_EMAIL)
    process.exit(1)
  }

  const { data: competitor } = await supabase
    .from('competitors')
    .select('id, youtube_channel_id, channel_name')
    .eq('channel_name', CHANNEL_NAME)
    .eq('user_id', userRow.id)
    .eq('is_active', true)
    .single()

  if (!competitor) {
    console.error('Competitor not found:', CHANNEL_NAME, '(user:', TEST_EMAIL, ')')
    process.exit(1)
  }

  console.log('Found competitor:', competitor.channel_name, '|', competitor.youtube_channel_id)
  console.log('YouTube API key present:', !!process.env.YOUTUBE_API_KEY)
  console.log('Fetching full profile…')

  const profile = await getCompetitorFullProfile(competitor.youtube_channel_id as string)
  console.log('Videos returned:', profile?.recentVideos?.length ?? 0)

  if (!profile?.recentVideos?.length) {
    console.error('No videos returned — check YouTube API quota and channel ID:', competitor.youtube_channel_id)
    process.exit(1)
  }

  const channelAvgViews =
    profile.recentVideos.reduce((sum, v) => sum + (v.viewCount ?? 0), 0) /
    profile.recentVideos.length

  const velocityMap = new Map(profile.velocityData.videos.map((v) => [v.videoId, v]))

  const videoRows = profile.recentVideos.map((video) => {
    const vel = velocityMap.get(video.videoId)
    const performanceVsAvg =
      channelAvgViews > 0
        ? Math.round((video.viewCount / channelAvgViews) * 100) / 100
        : 1

    return {
      competitor_id: competitor.id as string,
      youtube_video_id: video.videoId,
      title: video.title,
      published_at: video.publishedAt,
      view_count: video.viewCount ?? 0,
      like_count: video.likeCount ?? 0,
      comment_count: video.commentCount ?? 0,
      duration_seconds: video.duration ?? 0,
      thumbnail_url: video.thumbnailHighRes || video.thumbnailDefault || null,
      velocity_score: vel?.velocityScore ?? null,
      performance_vs_avg: performanceVsAvg,
      is_viral: vel?.isViral ?? false,
    }
  })

  console.log('Inserting', videoRows.length, 'videos (delete existing first)…')

  // Delete existing videos for this competitor before inserting fresh data
  const { error: deleteError } = await supabase
    .from('competitor_videos')
    .delete()
    .eq('competitor_id', competitor.id as string)

  if (deleteError) {
    console.error('Delete failed:', deleteError)
    process.exit(1)
  }

  const { error: videoError } = await supabase
    .from('competitor_videos')
    .insert(videoRows)

  if (videoError) {
    console.error('Video insert failed:', videoError)
    process.exit(1)
  }

  console.log('✓ Videos inserted successfully')

  // Update competitor metrics and snapshot
  const metrics = calculateCompetitorMetrics(videoRows, profile.channel.videoCount)

  await updateCompetitorMetrics(competitor.id as string, {
    video_count: metrics.video_count,
    avg_views_per_video: metrics.avg_views_per_video,
    avg_video_length_seconds: metrics.avg_video_length_seconds,
    upload_frequency_30d: metrics.upload_frequency_30d,
    subscriber_count: profile.channel.subscriberCount,
    total_views: profile.channel.totalViews,
    last_synced_at: new Date().toISOString(),
  })

  await saveCompetitorSnapshot(competitor.id as string, {
    subscriber_count: profile.channel.subscriberCount,
    total_views: profile.channel.totalViews,
    video_count: metrics.video_count,
    avg_views_per_video: metrics.avg_views_per_video,
    avg_video_length_seconds: metrics.avg_video_length_seconds,
    upload_frequency_30d: metrics.upload_frequency_30d,
    velocity_score_avg: metrics.velocity_score_avg,
  })

  console.log('✓ Metrics and snapshot updated')
  console.log('  upload_frequency_30d:', metrics.upload_frequency_30d)
  console.log('  avg_views_per_video:', metrics.avg_views_per_video)
  console.log('  video_count:', metrics.video_count)
}

main().catch((err) => {
  console.error('Script failed:', err)
  process.exit(1)
})
