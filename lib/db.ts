/**
 * lib/db.ts
 * All database operations for Nixlytics.
 * No component or API route should ever query Supabase directly — use these functions.
 *
 * All functions:
 *   - Use createServiceClient() (service role key, server-only)
 *   - Log errors with [db] prefix, never crash
 *   - Return null or empty array on failure, never throw
 */

import { createServiceClient } from '@/lib/supabase'
import type { ChannelOverview, VideoPerformanceItem } from '@/lib/youtube-analytics'
import type { CompetitorFullProfile, VideoDetail } from '@/lib/youtube-data'
import type { User, ChannelSnapshot, Video } from '@/types'

// ---------------------------------------------------------------------------
// saveChannelSnapshot
// ---------------------------------------------------------------------------

/**
 * Upserts a channel snapshot for today (UTC).
 * If a snapshot already exists for today, it is replaced with fresh data.
 *
 * @returns true on success, false on error
 */
export async function saveChannelSnapshot(
  userId: string,
  data: ChannelOverview,
): Promise<boolean> {
  const supabase = createServiceClient()
  const today = new Date().toISOString().slice(0, 10) // YYYY-MM-DD UTC

  // Estimate monthly revenue: divide 90-day figure by 3
  const estimatedMonthlyRevenue = data.estimatedRevenue > 0 ? data.estimatedRevenue / 3 : 0

  // Delete existing snapshot for today before inserting fresh data
  await supabase
    .from('channel_snapshots')
    .delete()
    .eq('user_id', userId)
    .eq('snapshot_date', today)

  const { error } = await supabase.from('channel_snapshots').insert({
    user_id: userId,
    snapshot_date: today,
    total_views: data.totalViews,
    avg_view_duration_seconds: Math.round(data.avgViewDurationSeconds),
    estimated_monthly_revenue: estimatedMonthlyRevenue,
    // subscriber_count, videos_count, avg_ctr, avg_like_ratio, rpm, momentum_score
    // require a separate YouTube Data API call — enriched in a later milestone
  })

  if (error) {
    console.error('[db] saveChannelSnapshot error:', error.message)
    return false
  }

  return true
}

// ---------------------------------------------------------------------------
// saveVideoData
// ---------------------------------------------------------------------------

/**
 * Merges YouTube Analytics per-video data with YouTube Data API public details,
 * then replaces the existing rows for these video IDs.
 *
 * Only the videos included in this sync are touched — older videos not returned
 * by the current analytics window are preserved unchanged.
 *
 * @returns number of videos saved (0 on error)
 */
export async function saveVideoData(
  userId: string,
  analyticsVideos: VideoPerformanceItem[],
  detailVideos: VideoDetail[],
): Promise<number> {
  if (analyticsVideos.length === 0) return 0

  const supabase = createServiceClient()

  // Build lookup map: videoId → VideoDetail
  const detailMap = new Map<string, VideoDetail>()
  for (const d of detailVideos) {
    detailMap.set(d.videoId, d)
  }

  const rows = analyticsVideos.map((av) => {
    const detail = detailMap.get(av.videoId)
    return {
      user_id: userId,
      youtube_video_id: av.videoId,
      title: detail?.title ?? null,
      published_at: detail?.publishedAt ?? null,
      duration_seconds: detail?.duration ?? null,
      view_count: av.views,
      like_count: detail?.likeCount ?? null,
      comment_count: detail?.commentCount ?? null,
      share_count: av.shares,
      ctr: av.ctr,
      avg_view_duration_seconds: Math.round(av.avgViewDurationSeconds),
      retention_percentage: av.avgViewPercentage,
      subscriber_gain: av.subscribersGained,
      revenue_estimate: av.estimatedRevenue,
      thumbnail_url: detail?.thumbnailHighRes || detail?.thumbnailDefault || null,
      synced_at: new Date().toISOString(),
    }
  })

  const videoIds = rows.map((r) => r.youtube_video_id)

  // Delete existing records for these specific video IDs before re-inserting
  const { error: deleteError } = await supabase
    .from('videos')
    .delete()
    .eq('user_id', userId)
    .in('youtube_video_id', videoIds)

  if (deleteError) {
    console.error('[db] saveVideoData delete error:', deleteError.message)
    return 0
  }

  const { error: insertError } = await supabase.from('videos').insert(rows)

  if (insertError) {
    console.error('[db] saveVideoData insert error:', insertError.message)
    return 0
  }

  return rows.length
}

// ---------------------------------------------------------------------------
// saveCompetitorData
// ---------------------------------------------------------------------------

/**
 * Updates a competitor row and replaces all their stored videos with fresh data.
 *
 * @returns true on success, false if the competitor row update failed
 */
export async function saveCompetitorData(
  competitorId: string,
  profile: CompetitorFullProfile,
): Promise<boolean> {
  const supabase = createServiceClient()

  // Update the competitor channel metadata
  const { error: competitorError } = await supabase
    .from('competitors')
    .update({
      channel_name: profile.channel.name,
      channel_thumbnail: profile.channel.thumbnail,
      subscriber_count: profile.channel.subscriberCount,
      total_views: profile.channel.totalViews,
      last_synced_at: new Date().toISOString(),
    })
    .eq('id', competitorId)

  if (competitorError) {
    console.error('[db] saveCompetitorData competitor update error:', competitorError.message)
    return false
  }

  if (profile.recentVideos.length === 0) return true

  // Build velocity lookup
  const velocityMap = new Map(profile.velocityData.videos.map((v) => [v.videoId, v]))
  const avgViews = profile.velocityData.channelAvgViews

  const videoRows = profile.recentVideos.map((v) => {
    const vel = velocityMap.get(v.videoId)
    return {
      competitor_id: competitorId,
      youtube_video_id: v.videoId,
      title: v.title,
      published_at: v.publishedAt,
      view_count: v.viewCount,
      like_count: v.likeCount,
      comment_count: v.commentCount,
      duration_seconds: v.duration,
      thumbnail_url: v.thumbnailHighRes || v.thumbnailDefault || null,
      velocity_score: vel?.velocityScore ?? null,
      performance_vs_avg: avgViews > 0 ? Math.round((v.viewCount / avgViews) * 100) / 100 : null,
      is_viral: vel?.isViral ?? false,
      synced_at: new Date().toISOString(),
    }
  })

  // Replace all videos for this competitor
  const { error: deleteError } = await supabase
    .from('competitor_videos')
    .delete()
    .eq('competitor_id', competitorId)

  if (deleteError) {
    console.error('[db] saveCompetitorData delete videos error:', deleteError.message)
    // Don't return false — competitor row was already updated
  } else {
    const { error: insertError } = await supabase.from('competitor_videos').insert(videoRows)
    if (insertError) {
      console.error('[db] saveCompetitorData insert videos error:', insertError.message)
    }
  }

  return true
}

// ---------------------------------------------------------------------------
// getUser
// ---------------------------------------------------------------------------

/**
 * Fetches a single user row by ID.
 *
 * @returns User or null if not found / on error
 */
export async function getUser(userId: string): Promise<User | null> {
  const supabase = createServiceClient()

  const { data, error } = await supabase
    .from('users')
    .select('*')
    .eq('id', userId)
    .single()

  if (error) {
    // PGRST116 = no rows found (not a true error)
    if (error.code !== 'PGRST116') {
      console.error('[db] getUser error:', error.message)
    }
    return null
  }

  return data as User
}

// ---------------------------------------------------------------------------
// updateUserOnboardingStatus
// ---------------------------------------------------------------------------

/**
 * Sets onboarding_completed on the users row.
 *
 * @returns true on success, false on error
 */
export async function updateUserOnboardingStatus(
  userId: string,
  completed: boolean,
): Promise<boolean> {
  const supabase = createServiceClient()

  const { error } = await supabase
    .from('users')
    .update({ onboarding_completed: completed, updated_at: new Date().toISOString() })
    .eq('id', userId)

  if (error) {
    console.error('[db] updateUserOnboardingStatus error:', error.message)
    return false
  }

  return true
}

// ---------------------------------------------------------------------------
// getChannelSnapshots
// ---------------------------------------------------------------------------

/**
 * Returns the last N days of channel snapshots for a user, sorted ascending by date.
 * Used for dashboard time-series charts.
 *
 * @returns ChannelSnapshot[] sorted ascending, empty array on error
 */
export async function getChannelSnapshots(
  userId: string,
  days: number = 30,
): Promise<ChannelSnapshot[]> {
  const supabase = createServiceClient()

  const since = new Date()
  since.setDate(since.getDate() - days)
  const sinceDate = since.toISOString().slice(0, 10) // YYYY-MM-DD

  const { data, error } = await supabase
    .from('channel_snapshots')
    .select('*')
    .eq('user_id', userId)
    .gte('snapshot_date', sinceDate)
    .order('snapshot_date', { ascending: true })

  if (error) {
    console.error('[db] getChannelSnapshots error:', error.message)
    return []
  }

  return (data ?? []) as ChannelSnapshot[]
}

// ---------------------------------------------------------------------------
// getVideos
// ---------------------------------------------------------------------------

/**
 * Returns the user's videos sorted by view_count descending.
 * Used for the video performance table on the dashboard.
 *
 * @returns Video[] sorted by views desc, empty array on error
 */
export async function getVideos(userId: string, limit: number = 20): Promise<Video[]> {
  const supabase = createServiceClient()

  const { data, error } = await supabase
    .from('videos')
    .select('*')
    .eq('user_id', userId)
    .order('view_count', { ascending: false })
    .limit(limit)

  if (error) {
    console.error('[db] getVideos error:', error.message)
    return []
  }

  return (data ?? []) as Video[]
}
