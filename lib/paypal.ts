/**
 * lib/paypal.ts
 * PayPal Subscriptions API wrapper.
 *
 * All operations switch between sandbox and live based on PAYPAL_MODE env var.
 */

const PAYPAL_BASE =
  process.env.PAYPAL_MODE === 'live'
    ? 'https://api-m.paypal.com'
    : 'https://api-m.sandbox.paypal.com'

// ---------------------------------------------------------------------------
// OAuth token
// ---------------------------------------------------------------------------

export async function getAccessToken(): Promise<string> {
  const credentials = Buffer.from(
    `${process.env.PAYPAL_CLIENT_ID}:${process.env.PAYPAL_SECRET}`
  ).toString('base64')

  const res = await fetch(`${PAYPAL_BASE}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${credentials}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  })

  if (!res.ok) {
    const body = await res.text()
    throw new Error(`PayPal OAuth failed (${res.status}): ${body}`)
  }

  const data = (await res.json()) as { access_token: string }
  return data.access_token
}

// ---------------------------------------------------------------------------
// Create subscription
// ---------------------------------------------------------------------------

export interface CreateSubscriptionResult {
  subscriptionId: string
  approvalUrl: string
}

export async function createSubscription(
  planId: string,
  userId: string,
  userEmail: string
): Promise<CreateSubscriptionResult> {
  const token = await getAccessToken()

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://showstencil.com'
  const returnUrl = `${appUrl}/dashboard?upgrade=success`
  const cancelUrl = `${appUrl}/pricing`

  const res = await fetch(`${PAYPAL_BASE}/v1/billing/subscriptions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    },
    body: JSON.stringify({
      plan_id: planId,
      custom_id: userId,
      subscriber: {
        email_address: userEmail,
      },
      application_context: {
        brand_name: 'ShowStencil',
        return_url: returnUrl,
        cancel_url: cancelUrl,
        user_action: 'SUBSCRIBE_NOW',
        payment_method: {
          payer_selected: 'PAYPAL',
          payee_preferred: 'IMMEDIATE_PAYMENT_REQUIRED',
        },
      },
    }),
  })

  if (!res.ok) {
    const body = await res.text()
    throw new Error(`PayPal create subscription failed (${res.status}): ${body}`)
  }

  const data = (await res.json()) as {
    id: string
    links: Array<{ rel: string; href: string }>
  }

  const approvalUrl = data.links?.find((l) => l.rel === 'approve')?.href
  if (!approvalUrl) {
    throw new Error('PayPal did not return an approval URL')
  }

  return { subscriptionId: data.id, approvalUrl }
}

// ---------------------------------------------------------------------------
// Cancel subscription
// ---------------------------------------------------------------------------

export async function cancelSubscription(
  subscriptionId: string,
  reason = 'User requested cancellation'
): Promise<void> {
  const token = await getAccessToken()

  const res = await fetch(
    `${PAYPAL_BASE}/v1/billing/subscriptions/${subscriptionId}/cancel`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ reason }),
    }
  )

  // PayPal returns 204 No Content on success
  if (!res.ok && res.status !== 204) {
    const body = await res.text()
    throw new Error(`PayPal cancel subscription failed (${res.status}): ${body}`)
  }
}

// ---------------------------------------------------------------------------
// Get subscription details
// ---------------------------------------------------------------------------

export interface PayPalSubscription {
  id: string
  status: string
  plan_id: string
  custom_id: string | null
  billing_info: {
    next_billing_time: string | null
    last_payment: { amount: { value: string }; time: string } | null
    failed_payments_count: number
  } | null
  subscriber: {
    email_address: string | null
  } | null
}

export async function getSubscriptionDetails(
  subscriptionId: string
): Promise<PayPalSubscription> {
  const token = await getAccessToken()

  const res = await fetch(
    `${PAYPAL_BASE}/v1/billing/subscriptions/${subscriptionId}`,
    {
      headers: { Authorization: `Bearer ${token}` },
    }
  )

  if (!res.ok) {
    const body = await res.text()
    throw new Error(`PayPal get subscription failed (${res.status}): ${body}`)
  }

  return res.json() as Promise<PayPalSubscription>
}

// ---------------------------------------------------------------------------
// Verify webhook signature
// ---------------------------------------------------------------------------

export async function verifyWebhookSignature(
  headers: Record<string, string | null>,
  body: string
): Promise<boolean> {
  const webhookId = process.env.PAYPAL_WEBHOOK_ID
  if (!webhookId) {
    console.warn('[paypal] PAYPAL_WEBHOOK_ID not set — skipping verification')
    return false
  }

  let token: string
  try {
    token = await getAccessToken()
  } catch {
    console.error('[paypal] Failed to get access token for webhook verification')
    return false
  }

  try {
    const res = await fetch(
      `${PAYPAL_BASE}/v1/notifications/verify-webhook-signature`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          auth_algo: headers['paypal-auth-algo'],
          cert_url: headers['paypal-cert-url'],
          transmission_id: headers['paypal-transmission-id'],
          transmission_sig: headers['paypal-transmission-sig'],
          transmission_time: headers['paypal-transmission-time'],
          webhook_id: webhookId,
          webhook_event: JSON.parse(body),
        }),
      }
    )

    if (!res.ok) return false
    const data = (await res.json()) as { verification_status: string }
    return data.verification_status === 'SUCCESS'
  } catch {
    return false
  }
}

// ---------------------------------------------------------------------------
// Plan ID → plan name helper
// ---------------------------------------------------------------------------

export function getPlanFromPayPalPlanId(planId: string): 'starter' | 'pro' | null {
  if (planId === process.env.PAYPAL_STARTER_PLAN_ID) return 'starter'
  if (planId === process.env.PAYPAL_PRO_PLAN_ID) return 'pro'
  return null
}
