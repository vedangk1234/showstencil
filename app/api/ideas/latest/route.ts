import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { createServiceClient } from '@/lib/supabase'

export async function GET() {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const supabase = createServiceClient()
  const userId = session.user.id

  // Find the most recent generation timestamp
  const { data: latestIdea } = await supabase
    .from('ideas')
    .select('generated_at')
    .eq('user_id', userId)
    .not('opportunity_score', 'is', null)
    .order('generated_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!latestIdea) {
    return NextResponse.json({ ideas: [] })
  }

  // Fetch all ideas from that same batch (±1 minute window)
  const batchStart = new Date(
    new Date(latestIdea.generated_at).getTime() - 60 * 1000,
  ).toISOString()

  const { data: ideas } = await supabase
    .from('ideas')
    .select('id, title, opportunity_score, why_now, content_brief')
    .eq('user_id', userId)
    .gte('generated_at', batchStart)
    .order('opportunity_score', { ascending: false })
    .limit(10)

  return NextResponse.json({ ideas: ideas ?? [] })
}
