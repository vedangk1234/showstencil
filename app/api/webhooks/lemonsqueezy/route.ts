/**
 * app/api/webhooks/lemonsqueezy/route.ts
 *
 * Receives subscription lifecycle events from Lemon Squeezy.
 * Every request is verified via HMAC-SHA256 signature before processing.
 */

import crypto from 'crypto'
import { NextRequest, NextResponse } from 'next/server'
import { Resend } from 'resend'
import {
  getUserByLSCustomerId,
  getUserByLSSubscriptionId,
  updateUserSubscription,
} from '@/lib/db'

const resend = new Resend(process.env.RESEND_API_KEY)

// ---------------------------------------------------------------------------
// Signature verification
// ---------------------------------------------------------------------------

function verifySignature(rawBody: string, signature: string): boolean {
  const secret = process.env.LEMONSQUEEZY_WEBHOOK_SECRET!
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex')
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature))
}

// ---------------------------------------------------------------------------
// Plan resolution
// ---------------------------------------------------------------------------

function getPlanFromVariant(variantId: string): 'starter' | 'pro' | null {
  if (variantId === process.env.LEMONSQUEEZY_STARTER_VARIANT_ID) return 'starter'
  if (variantId === process.env.LEMONSQUEEZY_PRO_VARIANT_ID) return 'pro'
  return null
}

// ---------------------------------------------------------------------------
// POST handler
// ---------------------------------------------------------------------------

export async function POST(req: NextRequest): Promise<NextResponse> {
  // Read raw body for signature verification — must happen before any JSON parsing
  const rawBody = await req.text()

  const signature = req.headers.get('x-signature') ?? ''
  if (!signature) {
    console.error('[ls-webhook] Missing X-Signature header')
    return NextResponse.json({ error: 'Missing signature' }, { status: 401 })
  }

  if (!verifySignature(rawBody, signature)) {
    console.error('[ls-webhook] Signature mismatch')
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
  }

  let event: Record<string, unknown>
  try {
    event = JSON.parse(rawBody)
  } catch {
    console.error('[ls-webhook] Failed to parse JSON body')
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const meta = event.meta as Record<string, unknown> | undefined
  const eventName = meta?.event_name as string | undefined
  const data = event.data as Record<string, unknown> | undefined

  if (!eventName || !data) {
    console.error('[ls-webhook] Missing event_name or data')
    return NextResponse.json({ received: true })
  }

  console.log(`[ls-webhook] Received event: ${eventName}`)

  // ---------------------------------------------------------------------------
  // subscription_created / subscription_updated
  // ---------------------------------------------------------------------------
  if (eventName === 'subscription_created' || eventName === 'subscription_updated') {
    const customData = meta?.custom_data as Record<string, unknown> | undefined
    const userId = customData?.user_id as string | undefined
    const attributes = data.attributes as Record<string, unknown>
    const customerId = String(attributes.customer_id)
    const subscriptionId = String(data.id)
    const status = String(attributes.status)
    const variantId = String(attributes.variant_id)
    const trialEndsAt = (attributes.trial_ends_at as string | null) ?? null
    const renewsAt = (attributes.renews_at as string | null) ?? null

    const plan = getPlanFromVariant(variantId)

    if (!plan) {
      console.error(`[ls-webhook] Unknown variant_id: ${variantId}`)
      return NextResponse.json({ received: true })
    }

    if (!userId) {
      console.error('[ls-webhook] No user_id in custom_data')
      return NextResponse.json({ received: true })
    }

    const ok = await updateUserSubscription(userId, {
      lemon_squeezy_customer_id: customerId,
      lemon_squeezy_subscription_id: subscriptionId,
      subscription_status: status,
      subscription_plan: plan,
      trial_ends_at: trialEndsAt,
      current_period_end: renewsAt,
    })

    if (!ok) {
      console.error(`[ls-webhook] Failed to update subscription for user ${userId}`)
    } else {
      console.log(`[ls-webhook] ${eventName}: user ${userId} → plan=${plan} status=${status}`)
    }
  }

  // ---------------------------------------------------------------------------
  // subscription_cancelled
  // ---------------------------------------------------------------------------
  else if (eventName === 'subscription_cancelled') {
    const attributes = data.attributes as Record<string, unknown>
    const subscriptionId = String(data.id)
    const customerId = String(attributes.customer_id)

    // Look up by subscription ID first, fall back to customer ID
    let user = await getUserByLSSubscriptionId(subscriptionId)
    if (!user) {
      user = await getUserByLSCustomerId(customerId)
    }

    if (!user) {
      console.error(`[ls-webhook] subscription_cancelled: no user found for sub ${subscriptionId}`)
      return NextResponse.json({ received: true })
    }

    const ok = await updateUserSubscription(user.id, {
      subscription_status: 'cancelled',
      subscription_plan: 'free',
    })

    if (!ok) {
      console.error(`[ls-webhook] Failed to cancel subscription for user ${user.id}`)
    } else {
      console.log(`[ls-webhook] subscription_cancelled: user ${user.id} downgraded to free`)
    }
  }

  // ---------------------------------------------------------------------------
  // subscription_payment_failed
  // ---------------------------------------------------------------------------
  else if (eventName === 'subscription_payment_failed') {
    const attributes = data.attributes as Record<string, unknown>
    const customerId = String(attributes.customer_id)

    const user = await getUserByLSCustomerId(customerId)

    if (!user) {
      console.error(`[ls-webhook] subscription_payment_failed: no user found for customer ${customerId}`)
      return NextResponse.json({ received: true })
    }

    const ok = await updateUserSubscription(user.id, {
      subscription_status: 'past_due',
    })

    if (!ok) {
      console.error(`[ls-webhook] Failed to mark past_due for user ${user.id}`)
    } else {
      console.log(`[ls-webhook] subscription_payment_failed: user ${user.id} → past_due`)
    }

    // Send payment failed warning email
    try {
      await resend.emails.send({
        from: 'Nixlytics <onboarding@resend.dev>',
        to: user.email,
        subject: 'Action required: Your Nixlytics payment failed',
        html: `
          <div style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:32px 24px;color:#111">
            <h1 style="font-size:22px;margin-bottom:16px">Your payment failed</h1>
            <p style="font-size:15px;line-height:1.6;margin-bottom:24px">
              We were unable to charge your card for your Nixlytics subscription.
              Your account will remain active for 3 days while we retry the payment.
              Please update your payment method to avoid losing access.
            </p>
            <a href="https://app.lemonsqueezy.com/my-orders"
               style="display:inline-block;background:#2563eb;color:#fff;text-decoration:none;padding:12px 24px;border-radius:6px;font-size:15px;font-weight:600">
              Update payment method
            </a>
          </div>
        `,
      })
      console.log(`[ls-webhook] Payment failed email sent to ${user.email}`)
    } catch (emailErr) {
      console.error(`[ls-webhook] Failed to send payment failed email to ${user.email}:`, emailErr)
    }
  }

  else {
    console.log(`[ls-webhook] Unhandled event: ${eventName} — ignoring`)
  }

  return NextResponse.json({ received: true })
}
