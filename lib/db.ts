/**
 * lib/db.ts
 * All database operations for ShowStencil.
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
import type { User, ChannelSnapshot, Video, CompetitorMetrics, UserSettings, CompetitorSnapshot, CompetitorVideo, Insight, Idea, ThumbnailJob } from '@/types'
import { deleteThumbnailFromStorage } from '@/lib/thumbnail-storage'

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
  // Don't write a null row — if the Analytics API returned no real data at all,
  // skip the write entirely so the dashboard falls back to the last good snapshot.
  // A zero totalViews means the API returned nothing (quota exhausted, token issue, etc.)
  const hasRealData = data.totalViews > 0 || data.avgViewDurationSeconds > 0
  if (!hasRealData) {
    console.warn(`[saveChannelSnapshot] Skipping null snapshot for user ${userId} — no real data from Analytics API`)
    return false
  }

  const supabase = createServiceClient()
  const today = new Date().toISOString().slice(0, 10) // YYYY-MM-DD UTC

  // Preserve fields that come from seeded/Data-API data, not the Analytics API
  const { data: existing } = await supabase
    .from('channel_snapshots')
    .select('subscriber_count, videos_count, avg_views_per_video, avg_ctr, avg_view_duration_seconds, avg_like_ratio, rpm, momentum_score, estimated_monthly_revenue')
    .eq('user_id', userId)
    .eq('snapshot_date', today)
    .maybeSingle()

  // Delete existing snapshot for today before inserting fresh data
  await supabase
    .from('channel_snapshots')
    .delete()
    .eq('user_id', userId)
    .eq('snapshot_date', today)

  const estimatedMonthlyRevenue = data.estimatedRevenue > 0
    ? data.estimatedRevenue / 3
    : (existing?.estimated_monthly_revenue ?? 0)

  // Only overwrite avg_view_duration_seconds when the Analytics API has real data (> 0).
  // A zero return means the channel has no data in the 90-day window — keep the existing value.
  const avgWatchSeconds = data.avgViewDurationSeconds > 0
    ? Math.round(data.avgViewDurationSeconds)
    : (existing?.avg_view_duration_seconds ?? null)

  const { error } = await supabase.from('channel_snapshots').insert({
    user_id: userId,
    snapshot_date: today,
    // Preserve enriched fields from seed / Data API that Analytics API doesn't provide
    subscriber_count: existing?.subscriber_count ?? null,
    videos_count: existing?.videos_count ?? null,
    avg_views_per_video: existing?.avg_views_per_video ?? null,
    avg_ctr: existing?.avg_ctr ?? null,
    avg_like_ratio: existing?.avg_like_ratio ?? null,
    rpm: existing?.rpm ?? null,
    momentum_score: existing?.momentum_score ?? null,
    // Analytics API fields
    total_views: data.totalViews,
    avg_view_duration_seconds: avgWatchSeconds,
    estimated_monthly_revenue: estimatedMonthlyRevenue,
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
 * Also recalculates the tier based on the user's current subscriber count.
 * Preserves sub_niche and is_dominator fields when not explicitly provided.
 *
 * @returns true on success, false if the competitor row update failed
 */
export async function saveCompetitorData(
  competitorId: string,
  profile: CompetitorFullProfile,
  extra?: {
    sub_niche?: string | null
    sub_niche_keywords?: string[] | null
    is_dominator?: boolean
    sub_niche_match_score?: number | null
  },
): Promise<boolean> {
  const supabase = createServiceClient()

  // Look up the competitor's user_id so we can recalculate tier
  const { data: compRow } = await supabase
    .from('competitors')
    .select('user_id')
    .eq('id', competitorId)
    .single()

  let tier: number | undefined
  if (compRow?.user_id) {
    const { data: snapshot } = await supabase
      .from('channel_snapshots')
      .select('subscriber_count')
      .eq('user_id', compRow.user_id)
      .order('snapshot_date', { ascending: false })
      .limit(1)
      .single()

    const userSubCount: number = snapshot?.subscriber_count ?? 0
    const compSubCount = profile.channel.subscriberCount

    if (userSubCount > 0 && compSubCount > 0) {
      const ratio = compSubCount / userSubCount
      tier = ratio <= 3 ? 1 : ratio <= 10 ? 2 : 3
    }
  }

  // Update the competitor channel metadata (tier and sub_niche fields included when provided)
  const { error: competitorError } = await supabase
    .from('competitors')
    .update({
      channel_name: profile.channel.name,
      channel_thumbnail: profile.channel.thumbnail,
      subscriber_count: profile.channel.subscriberCount,
      total_views: profile.channel.totalViews,
      last_synced_at: new Date().toISOString(),
      ...(tier !== undefined ? { tier } : {}),
      ...(extra?.sub_niche !== undefined ? { sub_niche: extra.sub_niche } : {}),
      ...(extra?.sub_niche_keywords !== undefined ? { sub_niche_keywords: extra.sub_niche_keywords } : {}),
      ...(extra?.is_dominator !== undefined ? { is_dominator: extra.is_dominator } : {}),
      ...(extra?.sub_niche_match_score !== undefined ? { sub_niche_match_score: extra.sub_niche_match_score } : {}),
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
    .not('subscriber_count', 'is', null)
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

// ---------------------------------------------------------------------------
// countVideosLast30Days
// ---------------------------------------------------------------------------

/**
 * Counts how many of the user's own videos were published in the last 30 days.
 * Used by the digest generator for an accurate upload frequency figure that matches
 * what OverviewTab shows in the UI.
 *
 * @returns count (0 on error or no data)
 */
export async function countVideosLast30Days(userId: string): Promise<number> {
  const supabase = createServiceClient()
  const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()

  const { count, error } = await supabase
    .from('videos')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .gte('published_at', cutoff)

  if (error) {
    console.error('[db] countVideosLast30Days error:', error.message)
    return 0
  }

  return count ?? 0
}

// ---------------------------------------------------------------------------
// getWorstVideos
// ---------------------------------------------------------------------------

/**
 * Returns the user's videos sorted by view_count ascending (lowest performers first).
 * Used to surface what is NOT landing for Claude's digest context.
 *
 * @returns Video[] sorted by views asc, empty array on error
 */
export async function getWorstVideos(userId: string, limit: number = 3): Promise<Video[]> {
  const supabase = createServiceClient()

  const { data, error } = await supabase
    .from('videos')
    .select('*')
    .eq('user_id', userId)
    .order('view_count', { ascending: true })
    .limit(limit)

  if (error) {
    console.error('[db] getWorstVideos error:', error.message)
    return []
  }

  return (data ?? []) as Video[]
}

// ---------------------------------------------------------------------------
// getCompetitorMetricsFromDB
// ---------------------------------------------------------------------------

/**
 * Fetches all active competitors for a user and their stored videos, then
 * builds CompetitorMetrics objects ready for gap scoring.
 *
 * Only returns competitors with subscriberCount greater than the user's own
 * subscriber count — channels smaller than the user are excluded.
 *
 * The user's subscriber count is read from their most recent channel snapshot.
 * If no snapshot exists, all competitors are returned without tier filtering.
 *
 * @returns CompetitorMetrics[] — empty array on error or no data
 */
export async function getCompetitorMetricsFromDB(userId: string): Promise<CompetitorMetrics[]> {
  const supabase = createServiceClient()

  // Resolve user's current subscriber count from the latest snapshot
  const { data: snapshotData } = await supabase
    .from('channel_snapshots')
    .select('subscriber_count')
    .eq('user_id', userId)
    .order('snapshot_date', { ascending: false })
    .limit(1)
    .single()

  const userSubCount: number = snapshotData?.subscriber_count ?? 0

  // Resolve user's niche for watch duration estimation
  const { data: userData } = await supabase
    .from('users')
    .select('niche_id')
    .eq('id', userId)
    .single()

  const nicheId: string = userData?.niche_id ?? ''

  // Watch duration benchmark per niche (mirrors gap-scorer.ts)
  const NICHE_WATCH_DURATION: Record<string, number> = {
    finance: 720,
    education: 720,
    gaming: 480,
  }
  const watchDuration = NICHE_WATCH_DURATION[nicheId] ?? 360

  // Fetch active competitors — include upload_frequency_30d so we use the stored value
  const { data: competitors, error: compError } = await supabase
    .from('competitors')
    .select('id, youtube_channel_id, channel_name, subscriber_count, upload_frequency_30d')
    .eq('user_id', userId)
    .eq('is_active', true)

  if (compError) {
    console.error('[db] getCompetitorMetricsFromDB competitors error:', compError.message)
    return []
  }

  if (!competitors || competitors.length === 0) return []

  const result: CompetitorMetrics[] = []

  for (const comp of competitors) {
    const subCount: number = comp.subscriber_count ?? 0

    // Only keep channels larger than the user
    if (userSubCount > 0 && subCount <= userSubCount) continue

    // Determine tier
    const ratio = userSubCount > 0 ? subCount / userSubCount : 1
    if (ratio > 10) continue // beyond tier 2 — not actionable
    const tier: 1 | 2 = ratio <= 3 ? 1 : 2

    // Fetch this competitor's stored videos
    const { data: videos, error: videoError } = await supabase
      .from('competitor_videos')
      .select('title, view_count, published_at')
      .eq('competitor_id', comp.id)
      .order('published_at', { ascending: false })

    if (videoError) {
      console.error(`[db] getCompetitorMetricsFromDB videos error for ${comp.id}:`, videoError.message)
      continue
    }

    const videoRows = videos ?? []

    // Average views per video
    const avgViewsPerVideo =
      videoRows.length > 0
        ? Math.round(
            videoRows.reduce((sum, v) => sum + (v.view_count ?? 0), 0) / videoRows.length,
          )
        : 0

    // Uploads per month — prefer stored upload_frequency_30d (count of videos in last 30 days),
    // fall back to dividing total stored videos by 3 (videos span ~90 days)
    const storedFreq = (comp as { upload_frequency_30d?: number | null }).upload_frequency_30d
    const uploadsPerMonth =
      storedFreq != null
        ? Math.round(storedFreq * 10) / 10
        : Math.round((videoRows.length / 3) * 10) / 10

    // Estimated CTR
    const estimatedCtr =
      subCount > 0 ? Math.min((avgViewsPerVideo / subCount) * 0.3, 0.15) : 0

    // Recent video titles (up to 10)
    const recentVideoTitles = videoRows
      .slice(0, 10)
      .map((v) => v.title)
      .filter((t): t is string => !!t)

    result.push({
      channelId: comp.youtube_channel_id,
      channelName: comp.channel_name ?? comp.youtube_channel_id,
      subscriberCount: subCount,
      avgViewsPerVideo,
      estimatedCtr: Math.round(estimatedCtr * 10000) / 10000,
      avgViewDurationSeconds: watchDuration,
      uploadsPerMonth,
      recentVideoTitles,
      tier,
    })
  }

  return result
}

// ---------------------------------------------------------------------------
// getUserByLSCustomerId
// ---------------------------------------------------------------------------

/**
 * Finds a user by their Lemon Squeezy customer ID.
 *
 * @returns User or null if not found / on error
 */
export async function getUserByLSCustomerId(customerId: string): Promise<User | null> {
  const supabase = createServiceClient()

  const { data, error } = await supabase
    .from('users')
    .select('*')
    .eq('lemon_squeezy_customer_id', customerId)
    .single()

  if (error) {
    if (error.code !== 'PGRST116') {
      console.error('[db] getUserByLSCustomerId error:', error.message)
    }
    return null
  }

  return data as User
}

// ---------------------------------------------------------------------------
// getUserByLSSubscriptionId
// ---------------------------------------------------------------------------

/**
 * Finds a user by their Lemon Squeezy subscription ID.
 *
 * @returns User or null if not found / on error
 */
export async function getUserByLSSubscriptionId(subscriptionId: string): Promise<User | null> {
  const supabase = createServiceClient()

  const { data, error } = await supabase
    .from('users')
    .select('*')
    .eq('lemon_squeezy_subscription_id', subscriptionId)
    .single()

  if (error) {
    if (error.code !== 'PGRST116') {
      console.error('[db] getUserByLSSubscriptionId error:', error.message)
    }
    return null
  }

  return data as User
}

// ---------------------------------------------------------------------------
// updateUserSubscription
// ---------------------------------------------------------------------------

/**
 * Updates subscription fields on the users row.
 * Only the fields provided in `data` are written.
 *
 * @returns true on success, false on error
 */
export async function updateUserSubscription(
  userId: string,
  data: {
    lemon_squeezy_customer_id?: string
    lemon_squeezy_subscription_id?: string
    subscription_status?: string
    subscription_plan?: string
    trial_ends_at?: string | null
    current_period_end?: string | null
  },
): Promise<boolean> {
  const supabase = createServiceClient()

  const { error } = await supabase
    .from('users')
    .update({ ...data, updated_at: new Date().toISOString() })
    .eq('id', userId)

  if (error) {
    console.error('[db] updateUserSubscription error:', error.message)
    return false
  }

  return true
}

// ---------------------------------------------------------------------------
// getUserSettings
// ---------------------------------------------------------------------------

/**
 * Returns the user_settings row for a user, or null if none exists.
 *
 * @returns UserSettings or null if not found / on error
 */
export async function getUserSettings(userId: string): Promise<UserSettings | null> {
  const supabase = createServiceClient()

  const { data, error } = await supabase
    .from('user_settings')
    .select('*')
    .eq('user_id', userId)
    .single()

  if (error) {
    if (error.code !== 'PGRST116') {
      console.error('[db] getUserSettings error:', error.message)
    }
    return null
  }

  // Normalise alerted_video_ids — DB returns null if column was never set
  const raw = data as Record<string, unknown>
  return {
    ...raw,
    alerted_video_ids: Array.isArray(raw.alerted_video_ids) ? raw.alerted_video_ids as string[] : [],
  } as UserSettings
}

// ---------------------------------------------------------------------------
// getLatestGapScore
// ---------------------------------------------------------------------------

/**
 * Returns the most recent gap score row for a user, or null if none exists.
 */
export async function getLatestGapScore(userId: string): Promise<import('@/types').GapScore | null> {
  const supabase = createServiceClient()

  const { data, error } = await supabase
    .from('gap_scores')
    .select('*')
    .eq('user_id', userId)
    .order('calculated_at', { ascending: false })
    .limit(1)
    .single()

  if (error) {
    if (error.code !== 'PGRST116') {
      console.error('[db] getLatestGapScore error:', error.message)
    }
    return null
  }

  return data as import('@/types').GapScore
}

// ---------------------------------------------------------------------------
// getCompetitors
// ---------------------------------------------------------------------------

/**
 * Returns all active competitors for a user.
 */
export async function getCompetitors(userId: string): Promise<import('@/types').Competitor[]> {
  const supabase = createServiceClient()

  const { data, error } = await supabase
    .from('competitors')
    .select('*')
    .eq('user_id', userId)
    .eq('is_active', true)
    .order('subscriber_count', { ascending: false })

  if (error) {
    console.error('[db] getCompetitors error:', error.message)
    return []
  }

  return (data ?? []) as import('@/types').Competitor[]
}

// ---------------------------------------------------------------------------
// getLatestDigest
// ---------------------------------------------------------------------------

/**
 * Returns the most recent digest for a user, or null if none exists.
 */
export async function getLatestDigest(userId: string): Promise<import('@/types').Digest | null> {
  const supabase = createServiceClient()

  const { data, error } = await supabase
    .from('digests')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(1)
    .single()

  if (error) {
    if (error.code !== 'PGRST116') {
      console.error('[db] getLatestDigest error:', error.message)
    }
    return null
  }

  return data as import('@/types').Digest
}

// ---------------------------------------------------------------------------
// getRecentDigests
// ---------------------------------------------------------------------------

export async function getRecentDigests(userId: string, limit = 3): Promise<import('@/types').Digest[]> {
  const supabase = createServiceClient()

  const { data, error } = await supabase
    .from('digests')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) {
    console.error('[db] getRecentDigests error:', error.message)
    return []
  }

  return (data ?? []) as import('@/types').Digest[]
}

// ---------------------------------------------------------------------------
// getLatestTrend
// ---------------------------------------------------------------------------

/**
 * Returns the most recently detected viral trend for a user, or null if none exists.
 */
export async function getLatestTrend(userId: string): Promise<import('@/types').Trend | null> {
  const supabase = createServiceClient()

  const { data, error } = await supabase
    .from('trends')
    .select('*')
    .eq('user_id', userId)
    .order('detected_at', { ascending: false })
    .limit(1)
    .single()

  if (error) {
    if (error.code !== 'PGRST116') {
      console.error('[db] getLatestTrend error:', error.message)
    }
    return null
  }

  return data as import('@/types').Trend
}

// ---------------------------------------------------------------------------
// getRecentIdeas
// ---------------------------------------------------------------------------

/**
 * Returns the most recent AI-generated video ideas for a user.
 *
 * @returns GeneratedVideoIdea[] sorted by generated_at desc, empty array on error
 */
export async function getRecentIdeas(
  userId: string,
  limit: number = 5,
): Promise<import('@/types').GeneratedVideoIdea[]> {
  const supabase = createServiceClient()

  const { data, error } = await supabase
    .from('ideas')
    .select('*')
    .eq('user_id', userId)
    .order('generated_at', { ascending: false })
    .limit(limit)

  if (error) {
    // Table may not exist yet — treat as empty rather than crashing
    if (error.code !== '42P01') {
      console.error('[db] getRecentIdeas error:', error.message)
    }
    return []
  }

  return (data ?? []).map((row) => ({
    rank: row.rank ?? 1,
    title: row.title ?? '',
    score: row.score ?? 0,
    whyNow: row.why_now ?? '',
    angle: row.angle ?? '',
    format: row.format ?? '',
    estimatedLength: row.estimated_length ?? '',
    generatedAt: row.generated_at ?? '',
  })) as import('@/types').GeneratedVideoIdea[]
}

// ---------------------------------------------------------------------------
// upsertUserSettings
// ---------------------------------------------------------------------------

/**
 * Creates or updates a user_settings row. Only the fields provided in
 * `settings` are written — all other columns are left unchanged on update.
 *
 * @returns true on success, false on error
 */
export async function upsertUserSettings(
  userId: string,
  settings: Partial<Omit<UserSettings, 'id' | 'user_id' | 'created_at'>>,
): Promise<boolean> {
  const supabase = createServiceClient()

  const { error } = await supabase.from('user_settings').upsert(
    {
      user_id: userId,
      ...settings,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id' },
  )

  if (error) {
    console.error('[db] upsertUserSettings error:', error.message)
    return false
  }

  return true
}

// ---------------------------------------------------------------------------
// saveCompetitorSnapshot
// ---------------------------------------------------------------------------

/**
 * Upserts a daily snapshot for one competitor (today UTC).
 * Safe to call multiple times — updates the existing row if it already exists.
 *
 * @returns true on success, false on error
 */
export async function saveCompetitorSnapshot(
  competitorId: string,
  data: {
    subscriber_count?: number
    total_views?: number
    video_count?: number
    avg_views_per_video?: number
    avg_video_length_seconds?: number
    upload_frequency_30d?: number
    velocity_score_avg?: number
  },
): Promise<boolean> {
  const supabase = createServiceClient()
  const today = new Date().toISOString().slice(0, 10) // YYYY-MM-DD UTC

  const { error } = await supabase.from('competitor_snapshots').upsert(
    {
      competitor_id: competitorId,
      snapshot_date: today,
      ...data,
    },
    { onConflict: 'competitor_id,snapshot_date' },
  )

  if (error) {
    console.error('[db] saveCompetitorSnapshot error:', error.message)
    return false
  }

  return true
}

// ---------------------------------------------------------------------------
// getCompetitorSnapshots
// ---------------------------------------------------------------------------

/**
 * Returns the last N days of snapshots for one competitor, sorted ascending
 * (oldest first — chart-friendly order).
 *
 * @returns CompetitorSnapshot[] — empty array on error or no data
 */
export async function getCompetitorSnapshots(
  competitorId: string,
  days: number = 30,
): Promise<CompetitorSnapshot[]> {
  const supabase = createServiceClient()

  const since = new Date()
  since.setDate(since.getDate() - days)
  const sinceDate = since.toISOString().slice(0, 10)

  const { data, error } = await supabase
    .from('competitor_snapshots')
    .select('*')
    .eq('competitor_id', competitorId)
    .gte('snapshot_date', sinceDate)
    .order('snapshot_date', { ascending: true })

  if (error) {
    console.error('[db] getCompetitorSnapshots error:', error.message)
    return []
  }

  return (data ?? []) as CompetitorSnapshot[]
}

// ---------------------------------------------------------------------------
// getAllCompetitorSnapshotsForUser
// ---------------------------------------------------------------------------

/**
 * Returns the last N days of snapshots for every active competitor of a user.
 * Result is grouped by competitor — ready to plot as a multi-line chart.
 *
 * @returns Array of { competitorId, snapshots } — empty array on error
 */
export async function getAllCompetitorSnapshotsForUser(
  userId: string,
  days: number = 30,
): Promise<{ competitorId: string; snapshots: CompetitorSnapshot[] }[]> {
  const supabase = createServiceClient()

  const { data: competitors, error: compError } = await supabase
    .from('competitors')
    .select('id')
    .eq('user_id', userId)
    .eq('is_active', true)

  if (compError) {
    console.error('[db] getAllCompetitorSnapshotsForUser competitors error:', compError.message)
    return []
  }

  if (!competitors || competitors.length === 0) return []

  const since = new Date()
  since.setDate(since.getDate() - days)
  const sinceDate = since.toISOString().slice(0, 10)

  const competitorIds = competitors.map((c) => c.id)

  const { data, error } = await supabase
    .from('competitor_snapshots')
    .select('*')
    .in('competitor_id', competitorIds)
    .gte('snapshot_date', sinceDate)
    .order('snapshot_date', { ascending: true })

  if (error) {
    console.error('[db] getAllCompetitorSnapshotsForUser snapshots error:', error.message)
    return []
  }

  const rows = (data ?? []) as CompetitorSnapshot[]

  return competitorIds.map((id) => ({
    competitorId: id,
    snapshots: rows.filter((r) => r.competitor_id === id),
  }))
}

// ---------------------------------------------------------------------------
// updateCompetitorMetrics
// ---------------------------------------------------------------------------

/**
 * Partial update of metric fields on a competitors row.
 * Used by the daily refresh cron to write freshly calculated values.
 *
 * @returns true on success, false on error
 */
export async function updateCompetitorMetrics(
  competitorId: string,
  metrics: {
    video_count?: number
    avg_views_per_video?: number
    avg_video_length_seconds?: number
    upload_frequency_30d?: number
    subscriber_count?: number
    total_views?: number
    last_synced_at?: string
  },
): Promise<boolean> {
  const supabase = createServiceClient()

  const { error } = await supabase
    .from('competitors')
    .update(metrics)
    .eq('id', competitorId)

  if (error) {
    console.error('[db] updateCompetitorMetrics error:', error.message)
    return false
  }

  return true
}

// ---------------------------------------------------------------------------
// saveCompetitorInsights
// ---------------------------------------------------------------------------

/**
 * Caches Claude-generated insights on the competitors row.
 * Sets insights_generated_at to NOW() so staleness can be checked later.
 *
 * @returns true on success, false on error
 */
export async function saveCompetitorInsights(
  competitorId: string,
  insights: Insight[],
): Promise<boolean> {
  const supabase = createServiceClient()

  const { error } = await supabase
    .from('competitors')
    .update({
      insights: insights,
      insights_generated_at: new Date().toISOString(),
    })
    .eq('id', competitorId)

  if (error) {
    console.error('[db] saveCompetitorInsights error:', error.message)
    return false
  }

  return true
}

// ---------------------------------------------------------------------------
// getRecentCompetitorVideos
// ---------------------------------------------------------------------------

/**
 * Returns competitor videos published within the last N days, sorted by
 * published_at descending. Used by the daily refresh cron to compute metrics.
 *
 * @returns CompetitorVideo[] — empty array on error or no recent videos
 */
export async function getRecentCompetitorVideos(
  competitorId: string,
  days: number = 30,
): Promise<CompetitorVideo[]> {
  const supabase = createServiceClient()

  const since = new Date()
  since.setDate(since.getDate() - days)
  const sinceDate = since.toISOString()

  const { data, error } = await supabase
    .from('competitor_videos')
    .select('*')
    .eq('competitor_id', competitorId)
    .gte('published_at', sinceDate)
    .order('published_at', { ascending: false })

  if (error) {
    console.error('[db] getRecentCompetitorVideos error:', error.message)
    return []
  }

  return (data ?? []) as CompetitorVideo[]
}

// ---------------------------------------------------------------------------
// getRecentIdeasBatch
// ---------------------------------------------------------------------------

/**
 * Returns the most recent batch of video ideas for a user.
 * A "batch" is all ideas sharing the most recent generated_at within a 1-minute window —
 * they were all generated in the same API call.
 *
 * @returns Idea[] sorted by opportunity_score desc, empty array when no ideas exist
 */
export async function getRecentIdeasBatch(userId: string): Promise<Idea[]> {
  const supabase = createServiceClient()

  // Find the most recent generated_at
  const { data: latest } = await supabase
    .from('ideas')
    .select('generated_at')
    .eq('user_id', userId)
    .not('opportunity_score', 'is', null) // only new-schema rows
    .order('generated_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!latest) return []

  const latestTime = new Date(latest.generated_at)
  const windowStart = new Date(latestTime.getTime() - 60 * 1000)
  const windowEnd = new Date(latestTime.getTime() + 60 * 1000)

  const { data, error } = await supabase
    .from('ideas')
    .select('*')
    .eq('user_id', userId)
    .gte('generated_at', windowStart.toISOString())
    .lte('generated_at', windowEnd.toISOString())
    .order('opportunity_score', { ascending: false })

  if (error) {
    if (error.code !== '42P01') {
      console.error('[db] getRecentIdeasBatch error:', error.message)
    }
    return []
  }

  return (data ?? []).map((row) => ({
    id: row.id,
    user_id: row.user_id,
    title: row.title ?? '',
    opportunity_score: row.opportunity_score ?? 0,
    thumbnail_description: row.thumbnail_description ?? '',
    content_brief: row.content_brief ?? '',
    suggested_duration_min: row.suggested_duration_min ?? 0,
    suggested_duration_max: row.suggested_duration_max ?? 0,
    duration_reasoning: row.duration_reasoning ?? '',
    why_now: row.why_now ?? '',
    topic_source: row.topic_source ?? null,
    generated_at: row.generated_at ?? '',
    planned_at: row.planned_at ?? null,
    made_at: row.made_at ?? null,
    thumbnail_image_url: row.thumbnail_image_url ?? null,
    thumbnail_generated_at: row.thumbnail_generated_at ?? null,
    thumbnail_source_type: row.thumbnail_source_type ?? null,
  })) as Idea[]
}

// ---------------------------------------------------------------------------
// getNicheAvgViewsPerVideo
// ---------------------------------------------------------------------------

/**
 * Computes the niche average views per video over the last 30 days by averaging
 * each Tier 1 competitor's own avg views (from their videos published in that window).
 *
 * Uses competitor_videos.published_at (not synced_at) so recently-added competitors
 * whose historical videos were back-filled are included correctly.
 *
 * @returns rounded integer, or null when no Tier 1 competitors exist or none have
 *          uploaded in the last 30 days
 */
export async function getNicheAvgViewsPerVideo(userId: string): Promise<number | null> {
  const supabase = createServiceClient()

  const { data: competitors, error: compError } = await supabase
    .from('competitors')
    .select('id')
    .eq('user_id', userId)
    .eq('tier', 1)
    .eq('is_dominator', false)
    .eq('is_active', true)

  if (compError) {
    console.error('[db] getNicheAvgViewsPerVideo competitors error:', compError.message)
    return null
  }

  if (!competitors || competitors.length === 0) return null

  const since = new Date()
  since.setDate(since.getDate() - 30)
  const sinceDate = since.toISOString()

  const perCompetitorAvgs: number[] = []

  for (const comp of competitors) {
    const { data: videos, error: videoError } = await supabase
      .from('competitor_videos')
      .select('view_count')
      .eq('competitor_id', comp.id)
      .gte('published_at', sinceDate)
      .not('view_count', 'is', null)

    if (videoError) {
      console.error(`[db] getNicheAvgViewsPerVideo videos error for ${comp.id}:`, videoError.message)
      continue
    }

    const rows = videos ?? []
    if (rows.length === 0) continue

    const avg = rows.reduce((sum, v) => sum + (v.view_count ?? 0), 0) / rows.length
    if (avg > 0) perCompetitorAvgs.push(avg)
  }

  if (perCompetitorAvgs.length === 0) return null

  return Math.round(
    perCompetitorAvgs.reduce((sum, v) => sum + v, 0) / perCompetitorAvgs.length,
  )
}

// ---------------------------------------------------------------------------
// getCachedInsights
// ---------------------------------------------------------------------------

/**
 * Returns cached insights from the competitors row if they are fresh enough.
 * Returns null when insights are absent or older than maxAgeDays.
 *
 * @returns Insight[] if cache is valid, null otherwise
 */
export async function getCachedInsights(
  competitorId: string,
  maxAgeDays: number = 7,
): Promise<Insight[] | null> {
  const supabase = createServiceClient()

  const { data, error } = await supabase
    .from('competitors')
    .select('insights, insights_generated_at')
    .eq('id', competitorId)
    .single()

  if (error) {
    if (error.code !== 'PGRST116') {
      console.error('[db] getCachedInsights error:', error.message)
    }
    return null
  }

  if (!data?.insights || !data?.insights_generated_at) return null

  const generatedAt = new Date(data.insights_generated_at as string)
  const ageMs = Date.now() - generatedAt.getTime()
  const maxAgeMs = maxAgeDays * 24 * 60 * 60 * 1000

  if (ageMs > maxAgeMs) return null

  return data.insights as Insight[]
}

// ---------------------------------------------------------------------------
// getThumbnailJob
// ---------------------------------------------------------------------------

export async function getThumbnailJob(
  jobId: string,
  userId: string,
): Promise<ThumbnailJob | null> {
  const supabase = createServiceClient()

  const { data, error } = await supabase
    .from('thumbnail_jobs')
    .select('*')
    .eq('id', jobId)
    .eq('user_id', userId)
    .single()

  if (error) {
    if (error.code !== 'PGRST116') {
      console.error('[db] getThumbnailJob error:', error.message)
    }
    return null
  }

  return data as ThumbnailJob
}

// ---------------------------------------------------------------------------
// createThumbnailJob
// ---------------------------------------------------------------------------

export async function createThumbnailJob(params: {
  userId: string
  ideaId: string
}): Promise<string | null> {
  const supabase = createServiceClient()

  const { data, error } = await supabase
    .from('thumbnail_jobs')
    .insert({ user_id: params.userId, idea_id: params.ideaId, status: 'pending' })
    .select('id')
    .single()

  if (error) {
    console.error('[db] createThumbnailJob error:', error.message)
    return null
  }

  return (data as { id: string }).id
}

// ---------------------------------------------------------------------------
// updateThumbnailJob
// ---------------------------------------------------------------------------

export async function updateThumbnailJob(
  jobId: string,
  update: {
    status: 'completed' | 'failed'
    thumbnail_url?: string
    error_message?: string
  },
): Promise<void> {
  const supabase = createServiceClient()

  const { error } = await supabase
    .from('thumbnail_jobs')
    .update({ ...update, completed_at: new Date().toISOString() })
    .eq('id', jobId)

  if (error) {
    console.error('[db] updateThumbnailJob error:', error.message)
  }
}

// ---------------------------------------------------------------------------
// deleteAllUserThumbnails
// ---------------------------------------------------------------------------

export async function deleteAllUserThumbnails(userId: string): Promise<void> {
  const supabase = createServiceClient()

  const { data: ideasWithThumbnails, error } = await supabase
    .from('ideas')
    .select('id, thumbnail_image_url')
    .eq('user_id', userId)
    .not('thumbnail_image_url', 'is', null)

  if (error) {
    console.error('[db] deleteAllUserThumbnails fetch error:', error.message)
    return
  }

  for (const idea of ideasWithThumbnails ?? []) {
    if (idea.thumbnail_image_url) {
      await deleteThumbnailFromStorage(idea.thumbnail_image_url as string)
    }
  }

  await supabase
    .from('ideas')
    .update({ thumbnail_image_url: null, thumbnail_generated_at: null, thumbnail_source_type: null })
    .eq('user_id', userId)
    .not('thumbnail_image_url', 'is', null)
}
