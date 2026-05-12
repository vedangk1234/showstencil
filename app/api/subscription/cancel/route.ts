import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { getUser, updateUserSubscription } from '@/lib/db'
import { cancelSubscription, getSubscriptionDetails } from '@/lib/paypal'

export async function POST() {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const user = await getUser(session.user.id)
  if (!user) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 })
  }

  if (!user.paypal_subscription_id) {
    return NextResponse.json({ error: 'No active subscription found' }, { status: 400 })
  }

  // Fetch subscription details first so we can extract billing_info.next_billing_time
  // before cancellation (PayPal returns less detail after cancel)
  let nextBillingTime: string | null = null
  try {
    const details = await getSubscriptionDetails(user.paypal_subscription_id)
    nextBillingTime = details.billing_info?.next_billing_time ?? null
  } catch (err) {
    console.warn('[cancel] Could not fetch subscription details:', err)
  }

  // Cancel with PayPal
  try {
    await cancelSubscription(user.paypal_subscription_id)
  } catch (err) {
    console.error('[cancel] PayPal cancel error:', err)
    return NextResponse.json(
      { error: 'Failed to cancel subscription. Please try again.' },
      { status: 502 }
    )
  }

  // Set status to cancelled but keep the existing subscription_plan.
  // The user retains paid access until current_period_end (next_billing_time).
  await updateUserSubscription(session.user.id, {
    subscription_status: 'cancelled',
    current_period_end: nextBillingTime,
  })

  return NextResponse.json({ success: true, accessUntil: nextBillingTime })
}
