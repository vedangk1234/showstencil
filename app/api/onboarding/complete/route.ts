import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { createServiceClient } from '@/lib/supabase'

export async function POST() {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const supabase = createServiceClient()
  const { error } = await supabase
    .from('users')
    .update({ onboarding_completed: true })
    .eq('id', session.user.id)

  if (error) {
    return NextResponse.json({ error: 'update_failed' }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
