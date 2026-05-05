import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { createServiceClient } from '@/lib/supabase'
import { generateAndCacheInsightsForCompetitor } from '@/lib/competitor-insights'
import { getCachedInsights } from '@/lib/db'

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
    const userId = session.user.id

    // Verify ownership BEFORE checking the cache — prevents IDOR where any
    // authenticated user could read cached insights for a competitor they don't own.
    const { data: competitor } = await supabase
      .from('competitors')
      .select('id, channel_name, avg_views_per_video, subscriber_count, video_count')
      .eq('id', competitor_id)
      .eq('user_id', userId)
      .single()

    if (!competitor) {
      return NextResponse.json({ error: 'Competitor not found' }, { status: 404 })
    }

    // Cache check — ownership is already confirmed above, so this is safe.
    if (!force_regenerate) {
      const cached = await getCachedInsights(competitor_id, 7)
      if (cached && cached.length > 0) {
        return NextResponse.json({ insights: cached, cached: true })
      }
    }

    // Quick data completeness pre-check so we can return a retryable 422
    // (the shared function also checks this but won't surface a retryable error to the caller)
    let effectiveVideoCount = competitor.video_count
    if (effectiveVideoCount == null) {
      const { count } = await supabase
        .from('competitor_videos')
        .select('*', { count: 'exact', head: true })
        .eq('competitor_id', competitor_id)
      effectiveVideoCount = count ?? 0
    }

    console.log('[insights] Data completeness check:', {
      avg_views_per_video: competitor.avg_views_per_video,
      subscriber_count: competitor.subscriber_count,
      effective_video_count: effectiveVideoCount,
    })

    if (
      competitor.avg_views_per_video == null ||
      competitor.subscriber_count == null ||
      effectiveVideoCount === 0
    ) {
      return NextResponse.json(
        {
          error: 'Not enough data to generate insights yet. Video data is being fetched — try again in a moment.',
          retryable: true,
        },
        { status: 422 },
      )
    }

    // Delegate to the shared function (loads data, calls Claude, saves to DB)
    const insights = await generateAndCacheInsightsForCompetitor(competitor_id, userId)

    if (!insights || insights.length === 0) {
      console.error('[competitors/insights] generateAndCacheInsightsForCompetitor returned empty for', competitor_id)
      return NextResponse.json(
        { error: 'AI generation returned no insights — please try again.', retryable: true },
        { status: 500 },
      )
    }

    return NextResponse.json({ insights, cached: false })
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Insights generation failed'
    console.error('[competitors/insights]', error)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
