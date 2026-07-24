/**
 * app/api/webhooks/paypal/route.ts
 *
 * Receives subscription lifecycle events from PayPal.
 * Every request is verified via PayPal's webhook signature API before processing.
 */

import { NextRequest, NextResponse } from 'next/server'
import { Resend } from 'resend'
import * as Sentry from '@sentry/nextjs'
import {
  getUserByPayPalSubscriptionId,
  updateUserSubscription,
  recordWebhookEvent,
} from '@/lib/db'
import { verifyWebhookSignature, getPlanFromPayPalPlanId, getSubscriptionDetails } from '@/lib/paypal'
import { enforceCompetitorLimit } from '@/lib/plan-limits'
import { logError } from '@/lib/logger'

const resend = new Resend(process.env.RESEND_API_KEY)

// ---------------------------------------------------------------------------
// POST handler
// ---------------------------------------------------------------------------

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    // Capture the raw bytes: the signature is verified against a CRC32 of the
    // exact received body, so we must not re-serialize it. Decode a UTF-8 copy
    // for the JSON.parse downstream.
    const rawBodyBuf = Buffer.from(await req.arrayBuffer())
    const rawBody = rawBodyBuf.toString('utf8')

    // Verify PayPal webhook signature
    const headers: Record<string, string | null> = {
      'paypal-auth-algo': req.headers.get('paypal-auth-algo'),
      'paypal-cert-url': req.headers.get('paypal-cert-url'),
      'paypal-transmission-id': req.headers.get('paypal-transmission-id'),
      'paypal-transmission-sig': req.headers.get('paypal-transmission-sig'),
      'paypal-transmission-time': req.headers.get('paypal-transmission-time'),
    }

    // Always verify — signatures are checked locally against the PayPal signing
    // cert (RSA-SHA256), so both sandbox and live are covered by the same code
    // path (each environment has its own PAYPAL_WEBHOOK_ID). Fail closed: any
    // non-ok result returns 401. The reason distinguishes forgery
    // (signature_mismatch) from config/infra failures so alerting can see the
    // difference — a broken cert fetch or missing webhook id must not look like
    // a scanner probing the endpoint.
    const verifyResult = await verifyWebhookSignature(headers, rawBodyBuf)
    if (!verifyResult.ok) {
      const { reason } = verifyResult
      console.error(`[paypal-webhook] Signature verification failed: ${reason}`)
      void logError({
        route: 'api/webhooks/paypal',
        error: `Signature verification failed: ${reason}`,
        details: {
          reason,
          transmission_id: headers['paypal-transmission-id'],
          auth_algo: headers['paypal-auth-algo'],
        },
        severity: 'warn',
      })
      // signature_mismatch is expected noise (scanners, bad actors) — do not page
      // on it. Every other reason is a config/infrastructure fault we must see.
      if (reason !== 'signature_mismatch') {
        Sentry.captureMessage(`PayPal webhook verification failed: ${reason}`, {
          level: 'error',
          tags: { route: 'webhooks/paypal', reason },
        })
      }
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
    }

    let event: Record<string, unknown>
    try {
      event = JSON.parse(rawBody)
    } catch {
      console.error('[paypal-webhook] Failed to parse JSON body')
      void logError({
        route: 'api/webhooks/paypal',
        error: 'Failed to parse JSON body',
        severity: 'warn',
      })
      return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
    }

    const eventType = event.event_type as string | undefined
    const resource = event.resource as Record<string, unknown> | undefined
    const eventId = event.id as string | undefined

    if (!eventType || !resource) {
      console.error('[paypal-webhook] Missing event_type or resource')
      return NextResponse.json({ received: true })
    }

    // Idempotency: record the event id first; a duplicate/replayed delivery is
    // acknowledged without re-applying the state change (e.g. a replayed EXPIRED
    // after a re-activation must not downgrade a paying user).
    if (eventId) {
      const { isNew } = await recordWebhookEvent(eventId, eventType)
      if (!isNew) {
        console.log(`[paypal-webhook] Duplicate event ${eventId} (${eventType}) — skipping`)
        return NextResponse.json({ received: true, duplicate: true })
      }
    }

    console.log(`[paypal-webhook] Received event: ${eventType}`)

    // -------------------------------------------------------------------------
    // BILLING.SUBSCRIPTION.ACTIVATED
    // Fires when a subscriber approves and the subscription becomes active.
    // custom_id contains the user_id we stored when creating the subscription.
    // -------------------------------------------------------------------------
    if (eventType === 'BILLING.SUBSCRIPTION.ACTIVATED') {
      const subscriptionId = String(resource.id)
      const planId = String(resource.plan_id)
      const customId = (resource.custom_id as string | null) ?? null

      const plan = getPlanFromPayPalPlanId(planId)
      if (!plan) {
        console.error(`[paypal-webhook] Unknown plan_id: ${planId}`)
        return NextResponse.json({ received: true })
      }

      if (!customId) {
        console.error('[paypal-webhook] BILLING.SUBSCRIPTION.ACTIVATED: no custom_id (user_id) in resource')
        return NextResponse.json({ received: true })
      }

      const billingInfo = resource.billing_info as Record<string, unknown> | null
      const nextBillingTime = (billingInfo?.next_billing_time as string | null) ?? null

      const ok = await updateUserSubscription(customId, {
        paypal_subscription_id: subscriptionId,
        pending_paypal_subscription_id: null, // clear the in-flight marker
        subscription_status: 'active',
        subscription_plan: plan,
        current_period_end: nextBillingTime,
      })

      if (!ok) {
        console.error(`[paypal-webhook] Failed to activate subscription for user ${customId}`)
      } else {
        console.log(`[paypal-webhook] ACTIVATED: user ${customId} → plan=${plan} sub=${subscriptionId}`)
      }
    }

    // -------------------------------------------------------------------------
    // BILLING.SUBSCRIPTION.CANCELLED
    // Keep the user's paid plan — they retain access until next_billing_time.
    // Access is revoked when BILLING.SUBSCRIPTION.EXPIRED fires.
    // -------------------------------------------------------------------------
    else if (eventType === 'BILLING.SUBSCRIPTION.CANCELLED') {
      const subscriptionId = String(resource.id)
      const billingInfo = resource.billing_info as Record<string, unknown> | null
      // next_billing_time at the point of cancellation = end of current billing period
      let periodEnd = (billingInfo?.next_billing_time as string | null) ?? null

      // PayPal does not guarantee next_billing_time in CANCELLED events.
      // If missing, fetch the subscription directly to get the period end date.
      if (!periodEnd) {
        try {
          const sub = await getSubscriptionDetails(subscriptionId)
          periodEnd = sub.billing_info?.next_billing_time
            ?? sub.billing_info?.last_payment?.time
            ?? null
          console.log('[paypal-webhook] CANCELLED fallback period end:', periodEnd)
        } catch (err) {
          console.error('[paypal-webhook] CANCELLED failed to fetch subscription details:', err)
        }
      }

      const user = await getUserByPayPalSubscriptionId(subscriptionId)
      if (!user) {
        console.error(`[paypal-webhook] CANCELLED: no user found for sub ${subscriptionId}`)
        return NextResponse.json({ received: true })
      }

      // Do NOT set subscription_plan='free' here. The user keeps paid access until periodEnd.
      const ok = await updateUserSubscription(user.id, {
        subscription_status: 'cancelled',
        current_period_end: periodEnd,
      })

      if (!ok) {
        console.error(`[paypal-webhook] Failed to update cancelled status for user ${user.id}`)
      } else {
        console.log(`[paypal-webhook] CANCELLED: user ${user.id} access until ${periodEnd ?? 'unknown'}`)
      }
    }

    // -------------------------------------------------------------------------
    // BILLING.SUBSCRIPTION.EXPIRED
    // Fires when the billing period ends after cancellation (or on hard expiry).
    // This is the correct point to drop the user to free.
    // -------------------------------------------------------------------------
    else if (eventType === 'BILLING.SUBSCRIPTION.EXPIRED') {
      const subscriptionId = String(resource.id)

      const user = await getUserByPayPalSubscriptionId(subscriptionId)
      if (!user) {
        console.error(`[paypal-webhook] EXPIRED: no user found for sub ${subscriptionId}`)
        return NextResponse.json({ received: true })
      }

      const ok = await updateUserSubscription(user.id, {
        subscription_status: 'expired',
        subscription_plan: 'free',
      })

      if (!ok) {
        console.error(`[paypal-webhook] Failed to expire subscription for user ${user.id}`)
      } else {
        console.log(`[paypal-webhook] EXPIRED: user ${user.id} downgraded to free`)
        // Free plan allows fewer competitors — deactivate the excess.
        await enforceCompetitorLimit(user.id)
      }
    }

    // -------------------------------------------------------------------------
    // BILLING.SUBSCRIPTION.SUSPENDED
    // PayPal suspends subscriptions on payment failure.
    // Treat as past_due — lib/access.ts grants a 3-day grace period.
    // -------------------------------------------------------------------------
    else if (eventType === 'BILLING.SUBSCRIPTION.SUSPENDED') {
      const subscriptionId = String(resource.id)

      const user = await getUserByPayPalSubscriptionId(subscriptionId)
      if (!user) {
        console.error(`[paypal-webhook] SUSPENDED: no user found for sub ${subscriptionId}`)
        return NextResponse.json({ received: true })
      }

      const ok = await updateUserSubscription(user.id, {
        subscription_status: 'past_due',
      })

      if (!ok) {
        console.error(`[paypal-webhook] Failed to mark past_due for user ${user.id}`)
      } else {
        console.log(`[paypal-webhook] SUSPENDED: user ${user.id} → past_due`)
      }

      // Send payment failed warning email
      try {
        await resend.emails.send({
          from: 'ShowStencil <onboarding@resend.dev>',
          to: user.email,
          subject: 'Action required: Your ShowStencil payment failed',
          html: `
            <div style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:32px 24px;color:#111">
              <h1 style="font-size:22px;margin-bottom:16px">Your payment failed</h1>
              <p style="font-size:15px;line-height:1.6;margin-bottom:24px">
                We were unable to charge your PayPal account for your ShowStencil subscription.
                Your account will remain active for 3 days while we retry the payment.
                Please update your payment method in PayPal to avoid losing access.
              </p>
              <a href="https://www.paypal.com/myaccount/autopay"
                 style="display:inline-block;background:#2563eb;color:#fff;text-decoration:none;padding:12px 24px;border-radius:6px;font-size:15px;font-weight:600">
                Update payment method
              </a>
            </div>
          `,
        })
        console.log(`[paypal-webhook] Payment failed email sent to ${user.email}`)
      } catch (emailErr) {
        console.error(`[paypal-webhook] Failed to send payment failed email to ${user.email}:`, emailErr)
      }
    }

    // -------------------------------------------------------------------------
    // BILLING.SUBSCRIPTION.UPDATED
    // Fires when a subscription's plan changes (e.g. a Pro→Starter downgrade via
    // the revise API). Resolve the new plan from resource.plan_id and, if it changed,
    // update subscription_plan and prune competitors above the new plan's limit.
    // -------------------------------------------------------------------------
    else if (eventType === 'BILLING.SUBSCRIPTION.UPDATED') {
      const subscriptionId = String(resource.id)
      const planId = resource.plan_id ? String(resource.plan_id) : null
      const plan = planId ? getPlanFromPayPalPlanId(planId) : null

      const user = await getUserByPayPalSubscriptionId(subscriptionId)
      if (!user) {
        console.error(`[paypal-webhook] UPDATED: no user found for sub ${subscriptionId}`)
        return NextResponse.json({ received: true })
      }

      if (plan && plan !== user.subscription_plan) {
        const ok = await updateUserSubscription(user.id, { subscription_plan: plan })
        if (!ok) {
          console.error(`[paypal-webhook] Failed to update plan for user ${user.id}`)
        } else {
          console.log(`[paypal-webhook] UPDATED: user ${user.id} plan → ${plan}`)
          // Downgrade may put the user over the new plan's competitor limit.
          await enforceCompetitorLimit(user.id)
        }
      } else {
        console.log(`[paypal-webhook] UPDATED: no plan change for user ${user.id}`)
      }
    }

    // -------------------------------------------------------------------------
    // BILLING.SUBSCRIPTION.RE-ACTIVATED
    // PayPal retried the failed payment and succeeded — restore active status.
    // Look up by subscription id (resource.id) — PayPal does not reliably include
    // custom_id on re-activation events, so the old custom_id lookup silently no-op'd.
    // -------------------------------------------------------------------------
    else if (eventType === 'BILLING.SUBSCRIPTION.RE-ACTIVATED') {
      const subscriptionId = String(resource.id)

      const user = await getUserByPayPalSubscriptionId(subscriptionId)
      if (!user) {
        console.error(`[paypal-webhook] RE-ACTIVATED: no user found for sub ${subscriptionId}`)
        return NextResponse.json({ received: true })
      }

      const ok = await updateUserSubscription(user.id, {
        subscription_status: 'active',
      })

      if (!ok) {
        console.error(`[paypal-webhook] Failed to re-activate subscription for user ${user.id}`)
      } else {
        console.log(`[paypal-webhook] RE-ACTIVATED: user ${user.id}`)
      }
    }

    // -------------------------------------------------------------------------
    // PAYMENT.SALE.COMPLETED
    // Successful payment — just log it.
    // -------------------------------------------------------------------------
    else if (eventType === 'PAYMENT.SALE.COMPLETED') {
      const amount = (resource.amount as Record<string, string> | null)?.total ?? 'unknown'
      const currency = (resource.amount as Record<string, string> | null)?.currency ?? ''
      console.log(`[paypal-webhook] PAYMENT.SALE.COMPLETED: ${amount} ${currency}`)
    }

    else {
      console.log(`[paypal-webhook] Unhandled event: ${eventType} — ignoring`)
    }

    return NextResponse.json({ received: true })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    const stack = err instanceof Error ? err.stack : undefined
    Sentry.captureException(err, {
      tags: { route: 'webhooks/paypal' },
    })
    console.error('[paypal-webhook] Unhandled exception:', err)
    void logError({
      route: 'api/webhooks/paypal',
      error: message,
      details: { error_stack: stack },
    })
    return NextResponse.json({ error: 'Bad request' }, { status: 400 })
  }
}
