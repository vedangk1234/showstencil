import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { getUser, updateUserSubscription } from '@/lib/db'

export async function POST() {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const user = await getUser(session.user.id)
  if (!user) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 })
  }

  if (!user.lemon_squeezy_subscription_id) {
    return NextResponse.json({ error: 'No active subscription found' }, { status: 400 })
  }

  const apiKey = process.env.LEMONSQUEEZY_API_KEY
  if (!apiKey) {
    console.error('[cancel] LEMONSQUEEZY_API_KEY not set')
    return NextResponse.json({ error: 'Server configuration error' }, { status: 500 })
  }

  const lsRes = await fetch(
    `https://api.lemonsqueezy.com/v1/subscriptions/${user.lemon_squeezy_subscription_id}`,
    {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Accept': 'application/vnd.api+json',
        'Content-Type': 'application/vnd.api+json',
      },
    }
  )

  if (!lsRes.ok && lsRes.status !== 200) {
    const body = await lsRes.text().catch(() => '')
    console.error('[cancel] Lemon Squeezy error:', lsRes.status, body)
    return NextResponse.json({ error: 'Failed to cancel subscription. Please try again.' }, { status: 502 })
  }

  // Extract ends_at from the LS response — this is the end of the current billing period
  let endsAt: string | null = null
  try {
    const lsBody = await lsRes.json()
    endsAt = lsBody?.data?.attributes?.ends_at ?? null
  } catch {
    console.warn('[cancel] Could not parse LS response body — ends_at will be null')
  }

  // Set status to cancelled but keep the existing subscription_plan.
  // The user retains paid access until current_period_end.
  await updateUserSubscription(session.user.id, {
    subscription_status: 'cancelled',
    current_period_end: endsAt,
  })

  return NextResponse.json({ success: true, accessUntil: endsAt })
}
