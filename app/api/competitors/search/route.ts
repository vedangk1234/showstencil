import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { createServiceClient } from '@/lib/supabase'
import { getPlanLimits } from '@/lib/plan-limits'
import { normalizeChannelInput, getChannelData } from '@/lib/channel-search'

export async function POST(request: Request) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { input } = await request.json()
    if (!input || typeof input !== 'string') {
      return NextResponse.json({ error: 'Invalid input' }, { status: 400 })
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

    const limits = getPlanLimits(user.subscription_plan)

    if (!limits.canUseSearch) {
      return NextResponse.json(
        {
          error: 'Search not available',
          message: 'Upgrade to Starter or Pro to search for channels',
          upgrade_required: true,
        },
        { status: 403 },
      )
    }

    const normalized = await normalizeChannelInput(input)
    if (!normalized.channel_id) {
      return NextResponse.json(
        {
          error: 'Channel not found',
          message: normalized.error || 'Could not find that channel',
        },
        { status: 404 },
      )
    }

    const channelData = await getChannelData(normalized.channel_id)
    if (!channelData) {
      return NextResponse.json({ error: 'Failed to fetch channel data' }, { status: 500 })
    }

    await supabase.from('user_search_history').insert({
      user_id: user.id,
      channel_id: normalized.channel_id,
      searched_at: new Date().toISOString(),
    })

    const { data: userSnapshot } = await supabase
      .from('channel_snapshots')
      .select('subscriber_count')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .single()

    const userSubs = userSnapshot?.subscriber_count || 0
    const ratio = userSubs > 0 ? channelData.subscriber_count / userSubs : 0
    let tier: 1 | 2 | 3 = 1
    if (ratio > 10) tier = 3
    else if (ratio > 3) tier = 2

    return NextResponse.json({
      success: true,
      channel: channelData,
      comparison: { tier, subscriber_ratio: ratio },
      user_searches_remaining:
        limits.searchesPerMonth === -1 ? -1 : limits.searchesPerMonth - 1,
    })
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Search failed'
    console.error('[competitors/search]', error)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
