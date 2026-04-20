import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { createServiceClient } from '@/lib/supabase'
import { getPlanLimits } from '@/lib/plan-limits'
import { calculateTier } from '@/lib/competitor-matcher'
import { calculateSubNicheSimilarity } from '@/lib/sub-niche-detector'

export async function POST(request: Request) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { channel_id } = await request.json()
    if (!channel_id) {
      return NextResponse.json({ error: 'channel_id required' }, { status: 400 })
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

    const { count: searchedCount } = await supabase
      .from('competitors')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .eq('is_searched', true)
      .eq('is_active', true)

    if ((searchedCount || 0) >= limits.searchedChannelsMax) {
      if (user.subscription_plan === 'starter' && limits.canReplaceSearched) {
        // Replace oldest searched competitor
        const { data: oldest } = await supabase
          .from('competitors')
          .select('id')
          .eq('user_id', user.id)
          .eq('is_searched', true)
          .eq('is_active', true)
          .order('searched_at', { ascending: true })
          .limit(1)
          .single()

        if (oldest) {
          await supabase.from('competitors').update({ is_active: false }).eq('id', oldest.id)
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

    const { data: cached } = await supabase
      .from('searched_channels_cache')
      .select('*')
      .eq('channel_id', channel_id)
      .single()

    if (!cached) {
      return NextResponse.json(
        { error: 'Channel data not found. Please search first.' },
        { status: 404 },
      )
    }

    const channelData = cached.channel_data as Record<string, unknown>

    const { data: userSnapshot } = await supabase
      .from('channel_snapshots')
      .select('subscriber_count')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .single()

    const userSubs = userSnapshot?.subscriber_count || 0
    const tier = calculateTier(userSubs, (channelData.subscriber_count as number) || 0)

    const matchScore = calculateSubNicheSimilarity(
      { sub_niche: user.sub_niche, sub_niche_keywords: user.sub_niche_keywords },
      {
        sub_niche: channelData.sub_niche as string,
        sub_niche_keywords: channelData.sub_niche_keywords as string[],
      },
    )

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
        is_dominator: false,
        sub_niche: channelData.sub_niche as string,
        sub_niche_keywords: channelData.sub_niche_keywords as string[],
        sub_niche_match_score: matchScore,
        last_synced_at: new Date().toISOString(),
      })
      .select()
      .single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // Mark search history entry as converted
    await supabase
      .from('user_search_history')
      .update({ added_as_competitor: true })
      .eq('user_id', user.id)
      .eq('channel_id', channel_id)

    return NextResponse.json({ success: true, competitor: newCompetitor })
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Failed to track channel'
    console.error('[competitors/track]', error)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
