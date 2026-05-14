import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { createServiceClient } from '@/lib/supabase'
import { getPlanLimits, canTrackThisMonth } from '@/lib/plan-limits'
import { calculateTier } from '@/lib/competitor-matcher'
import { calculateSubNicheSimilarity } from '@/lib/sub-niche-detector'
import { getCompetitorFullProfile } from '@/lib/youtube-data'
import { updateCompetitorMetrics, saveCompetitorSnapshot } from '@/lib/db'
import { calculateCompetitorMetrics } from '@/lib/competitor-metrics'
import { logError } from '@/lib/logger'

export async function POST(request: Request) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { channel_id } = await request.json()
    if (!channel_id || typeof channel_id !== 'string') {
      return NextResponse.json({ error: 'channel_id required' }, { status: 400 })
    }
    // YouTube channel IDs always start with "UC" and are exactly 24 characters.
    // Reject early before any DB lookups so malformed input never reaches the
    // 7 downstream queries that execute before the cache check.
    if (!/^UC[a-zA-Z0-9_-]{22}$/.test(channel_id)) {
      return NextResponse.json({ error: 'Invalid channel_id format' }, { status: 400 })
    }

    const supabase = createServiceClient()

    const { data: user } = await supabase
      .from('users')
      .select('id, subscription_plan, sub_niche, sub_niche_keywords')
      .eq('id', session.user.id)
      .single()

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    // Check if already tracked
    const { data: existing } = await supabase
      .from('competitors')
      .select('id')
      .eq('user_id', user.id)
      .eq('youtube_channel_id', channel_id)
      .eq('is_active', true)
      .single()

    if (existing) {
      return NextResponse.json({ error: 'Channel already tracked' }, { status: 409 })
    }

    const limits = getPlanLimits(user.subscription_plan)

    // Check monthly track quota
    const trackCheck = await canTrackThisMonth(user.id)
    if (!trackCheck.allowed) {
      return NextResponse.json(
        {
          error: 'Track limit reached',
          message: trackCheck.reason,
          next_available: trackCheck.nextAvailable,
          upgrade_required: user.subscription_plan === 'starter',
        },
        { status: 403 },
      )
    }

    // Check if any existing manually-added competitor is still within the 30-day replacement lock
    const { data: lockedCompetitor } = await supabase
      .from('competitors')
      .select('id, channel_name, replacement_locked_until')
      .eq('user_id', user.id)
      .eq('is_searched', true)
      .eq('is_active', true)
      .not('replacement_locked_until', 'is', null)
      .gt('replacement_locked_until', new Date().toISOString())
      .limit(1)
      .single()

    if (lockedCompetitor) {
      const unlockDate = new Date(lockedCompetitor.replacement_locked_until as string)
      return NextResponse.json(
        {
          error: 'Replacement locked',
          message: `You can replace this competitor on ${unlockDate.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}. This slot is locked until then.`,
          unlock_date: lockedCompetitor.replacement_locked_until,
          locked_channel_name: lockedCompetitor.channel_name,
        },
        { status: 409 },
      )
    }

    const { count: searchedCount } = await supabase
      .from('competitors')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .eq('is_searched', true)
      .eq('is_active', true)

    if ((searchedCount || 0) >= limits.searchedChannelsMax) {
      if (user.subscription_plan === 'starter' && limits.canReplaceSearched) {
        // Replace oldest searched competitor whose lock has expired
        const { data: oldest } = await supabase
          .from('competitors')
          .select('id')
          .eq('user_id', user.id)
          .eq('is_searched', true)
          .eq('is_active', true)
          .or(`replacement_locked_until.is.null,replacement_locked_until.lte.${new Date().toISOString()}`)
          .order('searched_at', { ascending: true })
          .limit(1)
          .single()

        if (oldest) {
          await supabase.from('competitors').update({ is_active: false }).eq('id', oldest.id)
        } else {
          return NextResponse.json(
            {
              error: 'Limit reached',
              message: 'Your manual competitor slot is still locked. You cannot replace it yet.',
              upgrade_required: true,
            },
            { status: 403 },
          )
        }
      } else {
        return NextResponse.json(
          {
            error: 'Limit reached',
            message: `You can track up to ${limits.searchedChannelsMax} searched channels on your plan`,
            upgrade_required: user.subscription_plan !== 'pro',
          },
          { status: 403 },
        )
      }
    }

    // Cache lookup and subscriber snapshot are independent — run in parallel.
    const [{ data: cached }, { data: userSnapshot }] = await Promise.all([
      supabase
        .from('searched_channels_cache')
        .select('*')
        .eq('channel_id', channel_id)
        .single(),
      supabase
        .from('channel_snapshots')
        .select('subscriber_count')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
    ])

    if (!cached) {
      return NextResponse.json(
        { error: 'Channel data not found. Please search first.' },
        { status: 404 },
      )
    }

    const channelData = cached.channel_data as Record<string, unknown>

    const userSubs = userSnapshot?.subscriber_count || 0
    const tier = calculateTier(userSubs, (channelData.subscriber_count as number) || 0)

    const matchScore = calculateSubNicheSimilarity(
      { sub_niche: user.sub_niche, sub_niche_keywords: user.sub_niche_keywords },
      {
        sub_niche: channelData.sub_niche as string,
        sub_niche_keywords: channelData.sub_niche_keywords as string[],
      },
    )

    // Lock this slot for 30 days from now
    const replacementLockedUntil = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()

    const { data: newCompetitor, error } = await supabase
      .from('competitors')
      .insert({
        user_id: user.id,
        youtube_channel_id: channel_id,
        channel_name: channelData.channel_name as string,
        channel_thumbnail: channelData.channel_thumbnail as string,
        subscriber_count: channelData.subscriber_count as number,
        total_views: channelData.total_views as number,
        tier,
        is_auto_detected: false,
        is_searched: true,
        searched_at: new Date().toISOString(),
        is_active: true,
        is_dominator: tier === 3,
        sub_niche: channelData.sub_niche as string,
        sub_niche_keywords: channelData.sub_niche_keywords as string[],
        sub_niche_match_score: matchScore,
        replacement_locked_until: replacementLockedUntil,
        last_synced_at: new Date().toISOString(),
      })
      .select()
      .single()

    if (error) {
      console.error('[competitors/track] DB insert error:', error.message)
      void logError({
        userId: session.user.id,
        route: 'api/competitors/track',
        error: error.message,
        details: { channel_id, tier },
      })
      return NextResponse.json({ error: 'Failed to add competitor' }, { status: 500 })
    }

    // Mark search history entry as converted
    await supabase
      .from('user_search_history')
      .update({ added_as_competitor: true })
      .eq('user_id', user.id)
      .eq('channel_id', channel_id)

    const competitorId = newCompetitor.id

    // ── Full data pipeline: fetch videos, metrics, snapshot ────────────────
    let metricsPopulated = false
    let fullProfile = null

    console.log('[track] Fetching full profile for:', newCompetitor.youtube_channel_id)
    console.log('[track] YouTube API key present:', !!process.env.YOUTUBE_API_KEY)

    try {
      fullProfile = await getCompetitorFullProfile(newCompetitor.youtube_channel_id)
      console.log('[track] Profile fetched. Videos count:', fullProfile?.recentVideos?.length ?? 0)
    } catch (err) {
      console.error('[track] getCompetitorFullProfile failed:', err)
    }

    if (!fullProfile) {
      console.warn('[track] No profile returned from YouTube API — skipping video/metrics pipeline')
    } else if (!fullProfile.recentVideos?.length) {
      console.warn('[track] No videos returned from YouTube API for', newCompetitor.youtube_channel_id)
    }

    if (fullProfile) {
      const velocityMap = new Map(
        fullProfile.velocityData.videos.map((v) => [v.videoId, v]),
      )
      const channelAvgViews = fullProfile.velocityData.channelAvgViews

      const videoRows = fullProfile.recentVideos.map((video) => {
        const vel = velocityMap.get(video.videoId)
        const performanceVsAvg =
          channelAvgViews > 0
            ? Math.round((video.viewCount / channelAvgViews) * 100) / 100
            : 1
        return {
          competitor_id: competitorId,
          youtube_video_id: video.videoId,
          title: video.title,
          published_at: video.publishedAt,
          view_count: video.viewCount,
          like_count: video.likeCount,
          comment_count: video.commentCount,
          duration_seconds: video.duration,
          thumbnail_url: video.thumbnailHighRes || video.thumbnailDefault || null,
          velocity_score: vel?.velocityScore ?? null,
          performance_vs_avg: performanceVsAvg,
          is_viral: vel?.isViral ?? false,
        }
      })

      if (videoRows.length > 0) {
        console.log('[track] Inserting', videoRows.length, 'videos for competitor', competitorId)
        // Delete any existing videos first (no unique constraint on competitor_id,youtube_video_id)
        await supabase.from('competitor_videos').delete().eq('competitor_id', competitorId)
        const { error: videoError } = await supabase
          .from('competitor_videos')
          .insert(videoRows)
        if (videoError) {
          console.error('[track] Failed to insert competitor videos:', videoError.message)
        } else {
          console.log('[track] Videos inserted successfully')
        }
      }

      const metrics = calculateCompetitorMetrics(videoRows, fullProfile.channel.videoCount)

      await updateCompetitorMetrics(competitorId, {
        video_count: metrics.video_count,
        avg_views_per_video: metrics.avg_views_per_video,
        avg_video_length_seconds: metrics.avg_video_length_seconds,
        upload_frequency_30d: metrics.upload_frequency_30d,
        subscriber_count: fullProfile.channel.subscriberCount,
        total_views: fullProfile.channel.totalViews,
        last_synced_at: new Date().toISOString(),
      })

      await saveCompetitorSnapshot(competitorId, {
        subscriber_count: fullProfile.channel.subscriberCount,
        total_views: fullProfile.channel.totalViews,
        video_count: metrics.video_count,
        avg_views_per_video: metrics.avg_views_per_video,
        avg_video_length_seconds: metrics.avg_video_length_seconds,
        upload_frequency_30d: metrics.upload_frequency_30d,
        velocity_score_avg: metrics.velocity_score_avg,
      })

      metricsPopulated = true
    }

    return NextResponse.json({
      success: true,
      competitor: newCompetitor,
      replacement_locked_until: replacementLockedUntil,
      tier,
      metricsPopulated,
      ...(!metricsPopulated
        ? { warning: 'Video data could not be fetched. It will sync overnight.' }
        : {}),
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error)
    console.error('[competitors/track] Unexpected error:', error)
    void logError({
      userId: undefined,
      route: 'api/competitors/track',
      error: message,
      details: { error_stack: error instanceof Error ? error.stack : undefined },
    })
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
