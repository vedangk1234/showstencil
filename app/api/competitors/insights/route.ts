import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { createServiceClient } from '@/lib/supabase'
import { generateCompetitorInsights } from '@/lib/competitor-insights'
import { getCachedInsights, saveCompetitorInsights } from '@/lib/db'

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

    // Load competitor (must belong to this user)
    const { data: competitor } = await supabase
      .from('competitors')
      .select('*')
      .eq('id', competitor_id)
      .eq('user_id', session.user.id)
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

    // Load user snapshot + user info
    const [{ data: userSnapshot }, { data: user }] = await Promise.all([
      supabase
        .from('channel_snapshots')
        .select('*')
        .eq('user_id', session.user.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .single(),
      supabase
        .from('users')
        .select('name, sub_niche')
        .eq('id', session.user.id)
        .single(),
    ])

    // Load competitor videos for metrics
    const { data: competitorVideos } = await supabase
      .from('competitor_videos')
      .select('*')
      .eq('competitor_id', competitor_id)
      .order('published_at', { ascending: false })
      .limit(20)

    const videos = competitorVideos || []

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

    const thirtyDaysAgo = new Date()
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
    const competitorUploadsPerMonth = videos.filter(
      (v: Record<string, unknown>) => new Date(v.published_at as string) > thirtyDaysAgo,
    ).length
    const nowMs = Date.now()
    const thirtyDaysAgoIsoForDays = new Date(nowMs - 30 * 24 * 60 * 60 * 1000).toISOString()
    const sixtyDaysAgoIsoForDays = new Date(nowMs - 60 * 24 * 60 * 60 * 1000).toISOString()

    let videosForDays: Record<string, unknown>[] = videos.filter(
      (v: Record<string, unknown>) => typeof v.published_at === 'string' && v.published_at >= thirtyDaysAgoIsoForDays,
    )
    if (videosForDays.length < 3) {
      videosForDays = videos.filter(
        (v: Record<string, unknown>) => typeof v.published_at === 'string' && v.published_at >= sixtyDaysAgoIsoForDays,
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

    const thirtyDaysAgoIso = thirtyDaysAgo.toISOString()
    const { count: recentUserUploads } = await supabase
      .from('videos')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', session.user.id)
      .gte('published_at', thirtyDaysAgoIso)
    const userUploadsPerMonth = recentUserUploads ?? 0

    const { data: userVideos } = await supabase
      .from('videos')
      .select('duration_seconds')
      .eq('user_id', session.user.id)
      .not('duration_seconds', 'is', null)
      .gt('duration_seconds', 0)

    const userAvgVideoLengthSeconds =
      userVideos && userVideos.length > 0
        ? Math.round(
            userVideos.reduce((sum, v) => sum + (v.duration_seconds ?? 0), 0) / userVideos.length,
          )
        : null

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
