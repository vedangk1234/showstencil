import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { createServiceClient } from '@/lib/supabase'
import { logError } from '@/lib/logger'

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
      .update({ made_at: new Date().toISOString() })
      .eq('id', id)

    if (error) {
      console.error('[ideas/made] DB error:', error.message)
      void logError({
        userId: session.user.id,
        route: 'api/ideas/[id]/made',
        error: error.message,
        details: { idea_id: id },
      })
      return NextResponse.json({ error: 'Failed to update idea' }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[ideas/made] Unexpected error:', err)
    void logError({
      userId: undefined,
      route: 'api/ideas/[id]/made',
      error: message,
    })
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
