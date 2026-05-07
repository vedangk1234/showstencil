import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { createServiceClient } from '@/lib/supabase'
import { detectSubNiche } from '@/lib/sub-niche-detector'

export async function POST(request: Request) {
  try {
    const supabase = createServiceClient()
    let userId: string | null = null

    // Cron bypass path (called from /api/sync after first video save)
    const cronUserId = request.headers.get('x-cron-user-id')
    const cronSecret = request.headers.get('x-cron-secret')

    if (cronUserId && cronSecret) {
      if (cronSecret !== process.env.CRON_SECRET) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      }
      userId = cronUserId
    } else {
      // Normal session auth
      const session = await auth()
      if (!session?.user?.email) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      }
      const { data: sessionUser } = await supabase
        .from('users')
        .select('id')
        .eq('email', session.user.email)
        .single()
      userId = sessionUser?.id ?? null
    }

    if (!userId) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    const { data: user } = await supabase
      .from('users')
      .select('id, youtube_channel_id, sub_niche')
      .eq('id', userId)
      .single()

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    const { data: videos } = await supabase
      .from('videos')
      .select('title, description')
      .eq('user_id', user.id)
      .order('published_at', { ascending: false })
      .limit(20)

    if (!videos || videos.length < 3) {
      return NextResponse.json(
        {
          error: 'Not enough videos to detect sub-niche',
          minimum_required: 3,
          current: videos?.length ?? 0,
        },
        { status: 400 },
      )
    }

    const result = await detectSubNiche(videos)

    await supabase
      .from('users')
      .update({
        sub_niche: result.sub_niche,
        sub_niche_keywords: result.keywords,
        sub_niche_confidence: result.confidence,
        sub_niche_detected_at: new Date().toISOString(),
      })
      .eq('id', user.id)

    return NextResponse.json({ success: true, ...result })
  } catch (error: unknown) {
    console.error('[detect-sub-niche] Error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
