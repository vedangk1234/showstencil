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
  const { data: user } = await supabase
    .from('users')
    .select('id, name, image, niche_id, sub_niche, youtube_channel_id, onboarding_completed')
    .eq('id', session.user.id)
    .single()

  if (!user) {
    return NextResponse.json({ error: 'user_not_found' }, { status: 404 })
  }

  const { data: snapshot } = await supabase
    .from('channel_snapshots')
    .select('subscriber_count')
    .eq('user_id', user.id)
    .not('subscriber_count', 'is', null)
    .order('snapshot_date', { ascending: false })
    .limit(1)
    .maybeSingle()

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

  const body = await req.json() as { niche_id?: unknown }
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
