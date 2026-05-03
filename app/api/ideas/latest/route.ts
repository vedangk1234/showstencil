import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { createServiceClient } from '@/lib/supabase'

export async function GET() {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const supabase = createServiceClient()

  const { data } = await supabase
    .from('ideas')
    .select('id, title, opportunity_score, why_now, content_brief')
    .eq('user_id', session.user.id)
    .not('opportunity_score', 'is', null)
    .order('generated_at', { ascending: false })
    .limit(3)

  return NextResponse.json({ ideas: data ?? [] })
}
