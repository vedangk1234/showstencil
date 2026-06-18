import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { createServiceClient } from '@/lib/supabase'
import { detectAndSaveSubNiche } from '@/lib/sub-niche-detector'

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

    // Video fetch + ≥3-video/niche_description guard + detectSubNiche + users-row
    // update all live in detectAndSaveSubNiche so sync-logic can call the same
    // path directly in-process. This route stays a thin auth wrapper.
    const outcome = await detectAndSaveSubNiche(userId)

    if (outcome.status === 'user_not_found') {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    if (outcome.status === 'insufficient_videos') {
      return NextResponse.json(
        {
          error: 'Not enough videos to detect sub-niche',
          minimum_required: 3,
          current: outcome.current,
        },
        { status: 400 },
      )
    }

    return NextResponse.json({ success: true, ...outcome.result })
  } catch (error: unknown) {
    console.error('[detect-sub-niche] Error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
