import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { getUser } from '@/lib/db'
import { createSubscription } from '@/lib/paypal'

export async function POST(request: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: { plan?: unknown }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const { plan } = body
  if (plan !== 'starter' && plan !== 'pro') {
    return NextResponse.json(
      { error: 'Invalid plan. Must be "starter" or "pro".' },
      { status: 400 }
    )
  }

  const user = await getUser(session.user.id)
  if (!user) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 })
  }

  const planId =
    plan === 'starter'
      ? process.env.PAYPAL_STARTER_PLAN_ID
      : process.env.PAYPAL_PRO_PLAN_ID

  if (!planId) {
    console.error(`[subscription/create] PAYPAL_${plan.toUpperCase()}_PLAN_ID not set`)
    return NextResponse.json(
      { error: 'Server configuration error — plan ID not set.' },
      { status: 500 }
    )
  }

  try {
    const { approvalUrl } = await createSubscription(
      planId,
      session.user.id,
      user.email
    )
    return NextResponse.json({ approvalUrl })
  } catch (err) {
    console.error('[subscription/create] PayPal error:', err)
    return NextResponse.json(
      { error: 'Failed to create subscription. Please try again.' },
      { status: 502 }
    )
  }
}
