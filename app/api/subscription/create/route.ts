import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { getUser, updateUserSubscription } from '@/lib/db'
import { createSubscription, getSubscriptionDetails } from '@/lib/paypal'
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

  // ── Idempotency: never mint a second subscription for the same user ──────────
  // (1) Already paying → 409. A second subscription would double-charge and orphan
  //     the first (the ACTIVATED webhook would overwrite paypal_subscription_id).
  const activeStatuses = ['active', 'on_trial', 'past_due']
  if (user.paypal_subscription_id && activeStatuses.includes(user.subscription_status ?? '')) {
    return NextResponse.json(
      { error: 'You already have an active subscription.' },
      { status: 409 },
    )
  }

  // (2) A create is already in flight (approval pending, e.g. a double-click) →
  //     return the existing approval link instead of creating another subscription.
  if (user.pending_paypal_subscription_id) {
    try {
      const pending = await getSubscriptionDetails(user.pending_paypal_subscription_id)
      if (pending.status === 'APPROVAL_PENDING') {
        const link = pending.links?.find((l) => l.rel === 'approve')?.href
        if (link) {
          return NextResponse.json({ approvalUrl: link })
        }
      }
      // Stale pending (already activated/cancelled/expired) — clear and fall through.
      await updateUserSubscription(session.user.id, { pending_paypal_subscription_id: null })
    } catch {
      // Couldn't fetch it — don't block a fresh attempt; clear and proceed.
      await updateUserSubscription(session.user.id, { pending_paypal_subscription_id: null })
    }
  }

  const planId =
    plan === 'starter'
      ? process.env.PAYPAL_STARTER_PLAN_ID
      : process.env.PAYPAL_PRO_PLAN_ID

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
    const { subscriptionId, approvalUrl } = await createSubscription(
      planId,
      session.user.id,
      user.email
    )
    // Remember the in-flight subscription so a retry/double-click returns this same
    // approval flow instead of creating another subscription. Cleared on ACTIVATED.
    await updateUserSubscription(session.user.id, {
      pending_paypal_subscription_id: subscriptionId,
    })
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
