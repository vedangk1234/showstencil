import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { createServiceClient } from '@/lib/supabase'

const VALID_NICHES = [
  'finance', 'tech', 'gaming', 'cooking', 'fitness', 'beauty',
  'travel', 'education', 'business', 'entertainment', 'diy', 'vlog',
]

export async function GET() {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const supabase = createServiceClient()
  const uid = session.user.id

  // user.id === session.user.id so both queries can run in parallel.
  const [{ data: user }, { data: snapshot }] = await Promise.all([
    supabase
      .from('users')
      .select('id, name, image, niche_id, sub_niche, youtube_channel_id, onboarding_completed')
      .eq('id', uid)
      .single(),
    supabase
      .from('channel_snapshots')
      .select('subscriber_count')
      .eq('user_id', uid)
      .not('subscriber_count', 'is', null)
      .order('snapshot_date', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ])

  if (!user) {
    return NextResponse.json({ error: 'user_not_found' }, { status: 404 })
  }

  return NextResponse.json({
    niche_id: user.niche_id,
    sub_niche: user.sub_niche,
    youtube_channel_id: user.youtube_channel_id,
    onboarding_completed: user.onboarding_completed,
    name: user.name,
    channel_name: user.name,
    channel_thumbnail: user.image,
    subscriber_count: snapshot?.subscriber_count ?? null,
  })
}

export async function PATCH(req: Request) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  let body: { niche_id?: unknown }
  try {
    body = await req.json() as { niche_id?: unknown }
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 })
  }
  const niche_id = body?.niche_id

  if (typeof niche_id !== 'string' || !VALID_NICHES.includes(niche_id)) {
    return NextResponse.json({ error: 'invalid_niche' }, { status: 400 })
  }

  const supabase = createServiceClient()
  const { error } = await supabase
    .from('users')
    .update({
      niche_id,
      niche_detected_at: new Date().toISOString(),
    })
    .eq('id', session.user.id)

  if (error) {
    return NextResponse.json({ error: 'update_failed' }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
