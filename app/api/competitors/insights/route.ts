import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { createServiceClient } from '@/lib/supabase'
import { generateCompetitorInsights } from '@/lib/competitor-insights'
import { getCachedInsights, saveCompetitorInsights } from '@/lib/db'

type GapScoreRow = {
  overall_score: number | null
  views_gap_score: number | null
  ctr_gap_score: number | null
  watch_time_gap_score: number | null
  upload_frequency_gap_score: number | null
  estimated_revenue_gap: number | null
  primary_bottleneck: string | null
}

export async function POST(request: Request) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { competitor_id, force_regenerate } = await request.json()
    if (!competitor_id) {
      return NextResponse.json({ error: 'competitor_id required' }, { status: 400 })
    }

    // Check on-row cache first (competitors.insights column — wiped daily by refresh-data cron)
    if (!force_regenerate) {
      const cached = await getCachedInsights(competitor_id, 7)
      if (cached && cached.length > 0) {
        return NextResponse.json({ insights: cached, cached: true })
      }
    }

    const supabase = createServiceClient()
    const userId = session.user.id

    // Load competitor (must belong to this user)
    const { data: competitor } = await supabase
      .from('competitors')
      .select('*')
      .eq('id', competitor_id)
      .eq('user_id', userId)
      .single()

    if (!competitor) {
      return NextResponse.json({ error: 'Competitor not found' }, { status: 404 })
    }

    // Require enough data to generate meaningful insights
    const hasEnoughData =
      competitor.avg_views_per_video != null &&
      competitor.subscriber_count != null &&
      competitor.video_count != null

    if (!hasEnoughData) {
      return NextResponse.json(
        {
          error:
            'Not enough data to generate insights yet. Video data is being fetched — try again in a moment.',
          retryable: true,
        },
        { status: 422 },
      )
    }

    const nowMs = Date.now()
    const thirtyDaysAgo = new Date(nowMs - 30 * 24 * 60 * 60 * 1000)
    const thirtyDaysAgoIso = thirtyDaysAgo.toISOString()
    const thirtyDaysAgoDate = thirtyDaysAgo.toISOString().split('T')[0]
    const sevenDaysAgo = new Date(nowMs - 7 * 24 * 60 * 60 * 1000).toISOString()

    // Load all data in parallel
    const [
      { data: userSnapshot },
      { data: user },
      { data: competitorVideos },
      { data: bestVideos },
      { data: worstVideos },
      { data: gapScoreRaw },
      { data: oldSnapshot },
      { count: recentUserUploads },
      { data: userVideos },
    ] = await Promise.all([
      supabase
        .from('channel_snapshots')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(1)
        .single(),
      supabase
        .from('users')
        .select('name, sub_niche')
        .eq('id', userId)
        .single(),
      supabase
        .from('competitor_videos')
        .select('*')
        .eq('competitor_id', competitor_id)
        .order('published_at', { ascending: false })
        .limit(20),
      // Best performing videos — top 3 by view count
      supabase
        .from('videos')
        .select('title, view_count, duration_seconds, published_at')
        .eq('user_id', userId)
        .not('view_count', 'is', null)
        .order('view_count', { ascending: false })
        .limit(3),
      // Worst performing videos — bottom 3, only videos older than 7 days
      supabase
        .from('videos')
        .select('title, view_count, duration_seconds, published_at')
        .eq('user_id', userId)
        .not('view_count', 'is', null)
        .lt('published_at', sevenDaysAgo)
        .order('view_count', { ascending: true })
        .limit(3),
      // Most recent gap score
      supabase
        .from('gap_scores')
        .select(
          'overall_score, views_gap_score, ctr_gap_score, ' +
          'watch_time_gap_score, upload_frequency_gap_score, ' +
          'estimated_revenue_gap, primary_bottleneck',
        )
        .eq('user_id', userId)
        .order('calculated_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
      // Oldest valid snapshot from last 30 days for growth calculation
      supabase
        .from('channel_snapshots')
        .select('subscriber_count, snapshot_date')
        .eq('user_id', userId)
        .not('subscriber_count', 'is', null)
        .gte('snapshot_date', thirtyDaysAgoDate)
        .order('snapshot_date', { ascending: true })
        .limit(1)
        .maybeSingle(),
      // User upload count (last 30 days)
      supabase
        .from('videos')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId)
        .gte('published_at', thirtyDaysAgoIso),
      // User video durations
      supabase
        .from('videos')
        .select('duration_seconds')
        .eq('user_id', userId)
        .not('duration_seconds', 'is', null)
        .gt('duration_seconds', 0),
    ])

    const gapScore = gapScoreRaw as GapScoreRow | null

    const videos = competitorVideos || []

    // Competitor derived metrics
    const avgViews =
      videos.length > 0
        ? videos.reduce((sum: number, v: Record<string, unknown>) => sum + ((v.view_count as number) || 0), 0) /
          videos.length
        : 0

    const avgDuration =
      videos.length > 0
        ? videos.reduce(
            (sum: number, v: Record<string, unknown>) => sum + ((v.duration_seconds as number) || 0),
            0,
          ) / videos.length
        : 0

    const competitorUploadsPerMonth = videos.filter(
      (v: Record<string, unknown>) => new Date(v.published_at as string) > thirtyDaysAgo,
    ).length

    // Publishing days (30d → 60d → all fallback)
    const sixtyDaysAgoIso = new Date(nowMs - 60 * 24 * 60 * 60 * 1000).toISOString()

    let videosForDays: Record<string, unknown>[] = videos.filter(
      (v: Record<string, unknown>) => typeof v.published_at === 'string' && v.published_at >= thirtyDaysAgoIso,
    )
    if (videosForDays.length < 3) {
      videosForDays = videos.filter(
        (v: Record<string, unknown>) => typeof v.published_at === 'string' && v.published_at >= sixtyDaysAgoIso,
      )
    }
    if (videosForDays.length < 3) {
      videosForDays = videos
    }

    const dayCounts: Record<string, number> = {}
    for (const v of videosForDays) {
      if (typeof v.published_at !== 'string') continue
      const day = new Date(v.published_at).toLocaleDateString('en-US', { weekday: 'long', timeZone: 'UTC' })
      dayCounts[day] = (dayCounts[day] || 0) + 1
    }
    const sortedDayCounts = Object.entries(dayCounts).sort((a, b) => b[1] - a[1])
    const allDaysEqualInsights = sortedDayCounts.length > 1 && sortedDayCounts.every(([, c]) => c === 1)
    const publishingDays: string[] = allDaysEqualInsights
      ? ['Varies — consistent uploading on different days']
      : sortedDayCounts.length > 0
        ? [sortedDayCounts[0][0]]
        : []

    // Top 5 competitor videos by views
    const topVideos = [...videos]
      .sort(
        (a: Record<string, unknown>, b: Record<string, unknown>) =>
          ((b.view_count as number) || 0) - ((a.view_count as number) || 0),
      )
      .slice(0, 5)
      .map((v: Record<string, unknown>) => ({
        title: (v.title as string) || 'Untitled',
        views: (v.view_count as number) || 0,
      }))

    // Viral videos separated out
    const viralVideos = videos
      .filter((v: Record<string, unknown>) => v.is_viral === true)
      .sort(
        (a: Record<string, unknown>, b: Record<string, unknown>) =>
          ((b.performance_vs_avg as number) ?? 0) - ((a.performance_vs_avg as number) ?? 0),
      )
      .slice(0, 3)
      .map((v: Record<string, unknown>) => ({
        title: (v.title as string) || 'Untitled',
        view_count: (v.view_count as number) ?? null,
        performance_vs_avg: (v.performance_vs_avg as number) ?? null,
        published_at: (v.published_at as string) ?? null,
      }))

    // User avg video length
    const userAvgVideoLengthSeconds =
      userVideos && userVideos.length > 0
        ? Math.round(
            userVideos.reduce((sum, v) => sum + (v.duration_seconds ?? 0), 0) / userVideos.length,
          )
        : null

    const userUploadsPerMonth = recentUserUploads ?? 0

    // Subscriber growth trend
    const currentSubs = userSnapshot?.subscriber_count ?? null
    const oldSubs = oldSnapshot?.subscriber_count ?? null

    const subscriberGrowth = (() => {
      if (!currentSubs || !oldSubs || oldSubs === 0) return null
      const netChange = currentSubs - oldSubs
      const growthRate = (netChange / oldSubs) * 100
      const trend: 'growing' | 'flat' | 'declining' =
        growthRate > 2 ? 'growing' :
        growthRate < -2 ? 'declining' : 'flat'
      return {
        current: currentSubs,
        thirtyDaysAgo: oldSubs,
        netChange,
        growthRatePct: Math.round(growthRate * 10) / 10,
        trend,
      }
    })()

    const insights = await generateCompetitorInsights(
      {
        channel_name: user?.name || 'Your Channel',
        subscriber_count: userSnapshot?.subscriber_count || 0,
        avg_views_per_video: userSnapshot?.avg_views_per_video || 0,
        avg_ctr: userSnapshot?.avg_ctr || 0,
        avg_view_duration_seconds: userSnapshot?.avg_view_duration_seconds || 0,
        avg_video_length_seconds: userAvgVideoLengthSeconds,
        upload_frequency_per_month: userUploadsPerMonth,
        sub_niche: user?.sub_niche || 'General',
        estimated_monthly_revenue: userSnapshot?.estimated_monthly_revenue ?? null,
        rpm: userSnapshot?.rpm ?? null,
        best_videos: (bestVideos ?? []).map(v => ({
          title: v.title ?? '',
          view_count: v.view_count ?? null,
          duration_seconds: v.duration_seconds ?? null,
        })),
        worst_videos: (worstVideos ?? []).map(v => ({
          title: v.title ?? '',
          view_count: v.view_count ?? null,
          duration_seconds: v.duration_seconds ?? null,
        })),
        gap_scores: gapScore ? {
          overall: gapScore.overall_score,
          views_gap: gapScore.views_gap_score,
          ctr_gap: gapScore.ctr_gap_score,
          watch_time_gap: gapScore.watch_time_gap_score,
          upload_frequency_gap: gapScore.upload_frequency_gap_score,
          estimated_revenue_gap_usd: gapScore.estimated_revenue_gap,
          primary_bottleneck: gapScore.primary_bottleneck,
        } : null,
        subscriber_growth: subscriberGrowth,
      },
      {
        channel_name: competitor.channel_name || 'Competitor',
        subscriber_count: competitor.subscriber_count || 0,
        avg_views: competitor.avg_views_per_video ?? avgViews,
        avg_video_length_seconds: competitor.avg_video_length_seconds ?? avgDuration,
        upload_frequency_per_month: competitor.upload_frequency_30d ?? competitorUploadsPerMonth,
        sub_niche: competitor.sub_niche || 'General',
        top_videos: topVideos,
        publishing_days: publishingDays,
        viral_videos: viralVideos,
      },
    )

    // Save to competitors.insights column (wiped daily by refresh-data cron)
    await saveCompetitorInsights(competitor_id, insights)

    return NextResponse.json({ insights, cached: false })
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Insights generation failed'
    console.error('[competitors/insights]', error)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
