import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { createServiceClient } from '@/lib/supabase'

export async function GET(req: Request) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const url = new URL(req.url)
  const activeOnly = url.searchParams.get('active') === 'true'

  const supabase = createServiceClient()

  let query = supabase
    .from('competitors')
    .select('id, channel_name, channel_thumbnail, subscriber_count, tier, is_dominator, sub_niche, is_active, is_auto_detected')
    .eq('user_id', session.user.id)

  if (activeOnly) {
    query = query.eq('is_active', true)
  }

  const { data: competitors } = await query.order('tier', { ascending: true })

  return NextResponse.json({ competitors: competitors ?? [] })
}
