import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { createServiceClient } from '@/lib/supabase'

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = await params
    const supabase = createServiceClient()

    // Ownership check — user_id in WHERE enforces this at DB level
    const { data: idea } = await supabase
      .from('ideas')
      .select('id')
      .eq('id', id)
      .eq('user_id', session.user.id)
      .single()

    if (!idea) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    const { error } = await supabase
      .from('ideas')
      .update({ planned_at: new Date().toISOString() })
      .eq('id', id)

    if (error) {
      console.error('[ideas/plan] DB error:', error.message)
      return NextResponse.json({ error: 'Failed to update idea' }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (err: unknown) {
    console.error('[ideas/plan] Unexpected error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
