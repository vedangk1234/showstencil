import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { createServiceClient } from '@/lib/supabase'
import { generateCompetitorInsights } from '@/lib/competitor-insights'

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

    const supabase = createServiceClient()

    // Check cache first (unless force_regenerate)
    if (!force_regenerate) {
      const { data: cached } = await supabase
        .from('competitor_insights')
        .select('insights, generated_at')
        .eq('user_id', session.user.id)
        .eq('competitor_id', competitor_id)
        .single()

      if (cached) {
        return NextResponse.json({
          success: true,
          insights: cached.insights,
          cached: true,
          generated_at: cached.generated_at,
        })
      }
    }

    // Load user snapshot
    const { data: userSnapshot } = await supabase
      .from('channel_snapshots')
      .select('*')
      .eq('user_id', session.user.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .single()

    const { data: user } = await supabase
      .from('users')
      .select('name, sub_niche')
      .eq('id', session.user.id)
      .single()

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
    const recentUploads = videos.filter(
      (v: Record<string, unknown>) => new Date(v.published_at as string) > thirtyDaysAgo,
    ).length
    const uploadsPerWeek = recentUploads / 4.3

    const dayCounts: Record<string, number> = {}
    videos.forEach((v: Record<string, unknown>) => {
      const day = new Date(v.published_at as string).toLocaleDateString('en-US', { weekday: 'long' })
      dayCounts[day] = (dayCounts[day] || 0) + 1
    })
    const publishingDays = Object.entries(dayCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([day]) => day)

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

    const userUploadsPerWeek = (userSnapshot?.videos_count || 0) / 52

    const insights = await generateCompetitorInsights(
      {
        channel_name: user?.name || 'Your Channel',
        subscriber_count: userSnapshot?.subscriber_count || 0,
        avg_views_per_video: userSnapshot?.avg_views_per_video || 0,
        avg_ctr: userSnapshot?.avg_ctr || 0,
        avg_view_duration_seconds: userSnapshot?.avg_view_duration_seconds || 0,
        upload_frequency_per_week: userUploadsPerWeek,
        sub_niche: user?.sub_niche || 'General',
      },
      {
        channel_name: competitor.channel_name || 'Competitor',
        subscriber_count: competitor.subscriber_count || 0,
        avg_views: avgViews,
        avg_video_length_seconds: avgDuration,
        upload_frequency_per_week: uploadsPerWeek,
        sub_niche: competitor.sub_niche || 'General',
        top_videos: topVideos,
        publishing_days: publishingDays,
      },
    )

    // Save to cache (upsert on user_id + competitor_id)
    await supabase.from('competitor_insights').upsert(
      {
        user_id: session.user.id,
        competitor_id,
        insights,
        generated_at: new Date().toISOString(),
        generation_count: 1,
      },
      { onConflict: 'user_id,competitor_id' },
    )

    return NextResponse.json({
      success: true,
      insights,
      cached: false,
      generated_at: new Date().toISOString(),
    })
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Insights generation failed'
    console.error('[competitors/insights]', error)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
