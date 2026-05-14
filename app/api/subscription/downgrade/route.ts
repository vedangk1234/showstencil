import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { getUser } from '@/lib/db'
import { getAccessToken } from '@/lib/paypal'

const PAYPAL_BASE =
  process.env.PAYPAL_MODE === 'live'
    ? 'https://api-m.paypal.com'
    : 'https://api-m.sandbox.paypal.com'

export async function POST() {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const user = await getUser(session.user.id)
  if (!user) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 })
  }

  const activePaidStatuses = ['active', 'on_trial', 'past_due']
  if (
    user.subscription_plan !== 'pro' ||
    !activePaidStatuses.includes(user.subscription_status as string)
  ) {
    return NextResponse.json({ error: 'Not on Pro plan' }, { status: 400 })
  }

  if (!user.paypal_subscription_id) {
    return NextResponse.json({ error: 'No active subscription found' }, { status: 400 })
  }

  const starterPlanId = process.env.PAYPAL_STARTER_PLAN_ID
  if (!starterPlanId) {
    console.error('[downgrade] PAYPAL_STARTER_PLAN_ID not set')
    return NextResponse.json({ error: 'Starter plan not configured' }, { status: 500 })
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://showstencil.com'

  try {
    const token = await getAccessToken()

    const res = await fetch(
      `${PAYPAL_BASE}/v1/billing/subscriptions/${user.paypal_subscription_id}/revise`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          plan_id: starterPlanId,
          application_context: {
            brand_name: 'ShowStencil',
            return_url: `${appUrl}/dashboard?downgrade=success`,
            cancel_url: `${appUrl}/pricing`,
          },
        }),
      }
    )

    if (!res.ok) {
      const body = await res.text()
      console.error('[downgrade] PayPal revise error:', res.status, body)
      return NextResponse.json(
        { error: 'Failed to initiate downgrade. Please try again.' },
        { status: 502 }
      )
    }

    const data = (await res.json()) as { links?: Array<{ rel: string; href: string }> }
    const approvalUrl = data.links?.find((l) => l.rel === 'approve')?.href

    if (!approvalUrl) {
      console.error('[downgrade] No approval URL in PayPal response:', JSON.stringify(data))
      return NextResponse.json(
        { error: 'No approval URL received from PayPal.' },
        { status: 502 }
      )
    }

    return NextResponse.json({ approvalUrl })
  } catch (err) {
    console.error('[downgrade] Error:', err)
    return NextResponse.json({ error: 'Internal error. Please try again.' }, { status: 500 })
  }
}
