import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { getUser } from '@/lib/db'
import { createSubscription } from '@/lib/paypal'
import { logError } from '@/lib/logger'

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

  // Log env var presence (not values) to diagnose misconfiguration
  console.log('[subscription/create] env check:', {
    PAYPAL_MODE: process.env.PAYPAL_MODE ?? '(not set — defaults to sandbox)',
    PAYPAL_CLIENT_ID: process.env.PAYPAL_CLIENT_ID ? 'set' : 'MISSING',
    PAYPAL_SECRET: process.env.PAYPAL_SECRET ? 'set' : 'MISSING',
    PAYPAL_STARTER_PLAN_ID: process.env.PAYPAL_STARTER_PLAN_ID ? 'set' : 'MISSING',
    PAYPAL_PRO_PLAN_ID: process.env.PAYPAL_PRO_PLAN_ID ? 'set' : 'MISSING',
    resolvedPlanId: planId ? `${planId.slice(0, 6)}…` : 'MISSING',
    userEmail: user.email ? `${user.email.slice(0, 3)}…` : 'MISSING',
  })

  if (!planId) {
    const missingVar = `PAYPAL_${plan.toUpperCase()}_PLAN_ID`
    console.error(`[subscription/create] ${missingVar} not set`)
    void logError({
      userId: session.user.id,
      route: 'api/subscription/create',
      error: `${missingVar} env var not set`,
      details: { plan },
      severity: 'error',
    })
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
    console.log('[subscription/create] returning to frontend:', JSON.stringify({ approvalUrl }))
    return NextResponse.json({ approvalUrl })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[subscription/create] PayPal error:', message)
    void logError({
      userId: session.user.id,
      route: 'api/subscription/create',
      error: message,
      details: { plan, plan_id_prefix: planId.slice(0, 6) },
    })
    return NextResponse.json(
      { error: 'Failed to create subscription. Please try again.' },
      { status: 502 }
    )
  }
}
