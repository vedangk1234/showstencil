import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { getUser } from '@/lib/db'
import { createCheckoutSession, getVariantId } from '@/lib/lemonsqueezy'

export async function POST(request: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json()
  const { plan } = body

  if (plan !== 'starter' && plan !== 'pro') {
    return NextResponse.json({ error: 'Invalid plan. Must be "starter" or "pro".' }, { status: 400 })
  }

  const user = await getUser(session.user.id)
  if (!user) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 })
  }

  const variantId = getVariantId(plan)
  const checkoutUrl = await createCheckoutSession(session.user.id, variantId, user.email)

  if (!checkoutUrl) {
    return NextResponse.json({ error: 'Failed to generate checkout URL' }, { status: 500 })
  }

  return NextResponse.json({ url: checkoutUrl })
}
