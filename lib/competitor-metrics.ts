/**
 * lib/competitor-metrics.ts
 * Pure computation — no DB calls, no side effects.
 * Accepts video rows (matching the competitor_videos table shape) and returns
 * aggregate metrics ready to be written to the competitors row and competitor_snapshots.
 */

interface VideoRow {
  view_count: number | null
  duration_seconds: number | null
  published_at: string | null
  velocity_score: number | null
}

export interface CompetitorMetricsResult {
  video_count: number
  avg_views_per_video: number
  avg_video_length_seconds: number
  upload_frequency_30d: number
  velocity_score_avg: number
}

export function calculateCompetitorMetrics(
  videos: VideoRow[],
  totalVideoCount?: number,
): CompetitorMetricsResult {
  if (!videos || videos.length === 0) {
    return {
      video_count: totalVideoCount ?? 0,
      avg_views_per_video: 0,
      avg_video_length_seconds: 0,
      upload_frequency_30d: 0,
      velocity_score_avg: 0,
    }
  }

  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)

  const recentVideos = videos.filter(
    (v) => v.published_at && new Date(v.published_at) >= thirtyDaysAgo,
  )

  const avgViews = Math.round(
    videos.reduce((sum, v) => sum + (v.view_count ?? 0), 0) / videos.length,
  )

  const withDuration = videos.filter((v) => (v.duration_seconds ?? 0) > 0)
  const avgLength =
    withDuration.length > 0
      ? Math.round(
          withDuration.reduce((sum, v) => sum + (v.duration_seconds ?? 0), 0) /
            withDuration.length,
        )
      : 0

  const uploadFrequency30d = recentVideos.length

  const avgVelocity =
    videos.reduce((sum, v) => sum + (v.velocity_score ?? 0), 0) / videos.length

  return {
    video_count: totalVideoCount ?? videos.length,
    avg_views_per_video: avgViews,
    avg_video_length_seconds: avgLength,
    upload_frequency_30d: uploadFrequency30d,
    velocity_score_avg: avgVelocity,
  }
}
