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
    .from('gap_scores')
    .select('overall_score, primary_bottleneck, estimated_revenue_gap, views_gap_score, ctr_gap_score, watch_time_gap_score, upload_frequency_gap_score')
    .eq('user_id', session.user.id)
    .order('calculated_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  return NextResponse.json(data ?? { overall_score: null })
}
