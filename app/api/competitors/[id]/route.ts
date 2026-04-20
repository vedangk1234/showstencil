import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { createServiceClient } from '@/lib/supabase'

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = await params
    const supabase = createServiceClient()

    const { data: competitor } = await supabase
      .from('competitors')
      .select('*')
      .eq('id', id)
      .eq('user_id', session.user.id)
      .single()

    if (!competitor) {
      return NextResponse.json({ error: 'Competitor not found' }, { status: 404 })
    }

    if (!competitor.is_searched) {
      return NextResponse.json(
        { error: 'Cannot remove auto-detected competitors' },
        { status: 403 },
      )
    }

    await supabase.from('competitors').update({ is_active: false }).eq('id', id)

    return NextResponse.json({ success: true })
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Failed to remove'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
