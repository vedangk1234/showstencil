/**
 * lib/paypal.ts
 * PayPal Subscriptions API wrapper.
 *
 * All operations switch between sandbox and live based on PAYPAL_MODE env var.
 */

import { logError } from '@/lib/logger'

/**
 * Single source of truth for PayPal environment selection.
 *
 * PAYPAL_MODE has exactly two valid values: 'live' | 'sandbox' (matching
 * .env.example and the deferred.md runbook). Previously three files compared it
 * against three different literals ('production', 'live', 'sandbox'), so no single
 * env value made create/cancel, downgrade, and webhook-verify agree. Everything now
 * routes through isLivePaypal() / getPaypalBaseUrl().
 *
 * Throws on any other value so a typo fails loudly instead of silently routing real
 * subscriptions to sandbox.
 */
export function isLivePaypal(): boolean {
  const mode = process.env.PAYPAL_MODE
  if (mode !== 'live' && mode !== 'sandbox') {
    throw new Error(`PAYPAL_MODE must be 'live' or 'sandbox', got '${mode ?? '(unset)'}'`)
  }
  return mode === 'live'
}

// Read at request time so Vercel env var changes take effect without redeploy.
export function getPaypalBaseUrl(): string {
  return isLivePaypal() ? 'https://api-m.paypal.com' : 'https://api-m.sandbox.paypal.com'
}

// ---------------------------------------------------------------------------
// OAuth token
// ---------------------------------------------------------------------------

// In-module OAuth token cache. PayPal client-credentials tokens live ~9h; we reuse
// the token until 5 minutes before expiry instead of minting a fresh one per call.
let cachedToken: { token: string; expiresAtMs: number } | null = null
const TOKEN_REFRESH_SKEW_MS = 5 * 60 * 1000

export async function getAccessToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAtMs - TOKEN_REFRESH_SKEW_MS > Date.now()) {
    return cachedToken.token
  }

  const clientId = process.env.PAYPAL_CLIENT_ID
  const secret = process.env.PAYPAL_SECRET
  const base = getPaypalBaseUrl()

  if (!clientId || !secret) {
    void logError({
      route: 'lib/paypal/getAccessToken',
      error: 'PayPal credentials not configured',
      details: { missing: !clientId ? 'PAYPAL_CLIENT_ID' : 'PAYPAL_SECRET' },
    })
    throw new Error('PayPal credentials not configured (PAYPAL_CLIENT_ID or PAYPAL_SECRET missing)')
  }

  const credentials = Buffer.from(`${clientId}:${secret}`).toString('base64')

  const res = await fetch(`${base}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${credentials}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  })

  if (!res.ok) {
    const body = await res.text()
    void logError({
      route: 'lib/paypal/getAccessToken',
      error: `PayPal OAuth failed (${res.status})`,
      details: { status: res.status, body: body.slice(0, 500) },
    })
    throw new Error(`PayPal OAuth failed (${res.status}): ${body}`)
  }

  const data = (await res.json()) as { access_token: string; expires_in?: number }
  const ttlMs = (data.expires_in ?? 32400) * 1000 // default 9h if PayPal omits it
  cachedToken = { token: data.access_token, expiresAtMs: Date.now() + ttlMs }
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

  const requestBody = {
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
    },
  }

  // Do not log requestBody — it contains the subscriber email + user id.
  const res = await fetch(`${getPaypalBaseUrl()}/v1/billing/subscriptions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    },
    body: JSON.stringify(requestBody),
  })

  if (!res.ok) {
    const body = await res.text()
    console.error('[paypal/createSubscription] failed:', res.status, body)
    void logError({
      userId,
      route: 'lib/paypal/createSubscription',
      error: `PayPal create subscription failed (${res.status})`,
      details: { plan_id_prefix: planId.slice(0, 6), status: res.status, body: body.slice(0, 500) },
    })
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
    `${getPaypalBaseUrl()}/v1/billing/subscriptions/${subscriptionId}/cancel`,
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
  links?: Array<{ rel: string; href: string }>
}

export async function getSubscriptionDetails(
  subscriptionId: string
): Promise<PayPalSubscription> {
  const token = await getAccessToken()

  const res = await fetch(
    `${getPaypalBaseUrl()}/v1/billing/subscriptions/${subscriptionId}`,
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
    console.warn('[paypal/verify] PAYPAL_WEBHOOK_ID not set — skipping verification')
    return false
  }

  let token: string
  try {
    token = await getAccessToken()
  } catch (err) {
    console.error('[paypal/verify] Failed to get access token for webhook verification:', err)
    void logError({
      route: 'lib/paypal/verifyWebhookSignature',
      error: err instanceof Error ? err.message : String(err),
      details: { step: 'getAccessToken' },
    })
    return false
  }

  const verifyPayload = {
    auth_algo: headers['paypal-auth-algo'],
    cert_url: headers['paypal-cert-url'],
    transmission_id: headers['paypal-transmission-id'],
    transmission_sig: headers['paypal-transmission-sig'],
    transmission_time: headers['paypal-transmission-time'],
    webhook_id: webhookId,
    webhook_event: JSON.parse(body),
  }

  // Do not log verification headers / signatures / webhook id.
  try {
    const res = await fetch(
      `${getPaypalBaseUrl()}/v1/notifications/verify-webhook-signature`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(verifyPayload),
      }
    )

    const responseText = await res.text()

    if (!res.ok) {
      console.error('[paypal/verify] PayPal verification API returned non-2xx:', res.status, responseText)
      void logError({
        route: 'lib/paypal/verifyWebhookSignature',
        error: `PayPal verification API returned ${res.status}`,
        details: { status: res.status, body: responseText.slice(0, 500) },
        severity: 'warn',
      })
      return false
    }

    let data: { verification_status: string }
    try {
      data = JSON.parse(responseText)
    } catch {
      console.error('[paypal/verify] Failed to parse verification response as JSON:', responseText)
      return false
    }

    return data.verification_status === 'SUCCESS'
  } catch (err) {
    console.error('[paypal/verify] Exception during verification fetch:', err)
    void logError({
      route: 'lib/paypal/verifyWebhookSignature',
      error: err instanceof Error ? err.message : String(err),
      details: { step: 'verifyFetch', error_stack: err instanceof Error ? err.stack : undefined },
    })
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
