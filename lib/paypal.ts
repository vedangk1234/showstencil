/**
 * lib/paypal.ts
 * PayPal Subscriptions API wrapper.
 *
 * All operations switch between sandbox and live based on PAYPAL_MODE env var.
 */

import crypto from 'node:crypto'
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
// Verify webhook signature (local RSA-SHA256)
//
// PayPal signs each webhook so it can be verified without a runtime call to
// /v1/notifications/verify-webhook-signature. The signed string is:
//
//   transmissionId | transmissionTime | webhookId | crc32(rawBody)
//
// verified against the RSA public key in the X.509 cert served at the URL in
// the paypal-cert-url header. Verifying locally removes the OAuth + verify-API
// dependency from the payments-critical path.
// ---------------------------------------------------------------------------

/** Discriminated verification result. The handler 401s on any !ok. */
export type WebhookVerifyResult =
  | { ok: true }
  | {
      ok: false
      reason:
        | 'missing_webhook_id'
        | 'missing_headers'
        | 'bad_cert_url'
        | 'cert_fetch_failed'
        | 'signature_mismatch'
    }

// CRC32 (IEEE 802.3, polynomial 0xEDB88320) — table-based, computed inline to
// avoid adding a dependency to the payments path. Returned UNSIGNED (>>> 0).
const CRC32_TABLE: Uint32Array = (() => {
  const table = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    }
    table[n] = c >>> 0
  }
  return table
})()

/** Unsigned 32-bit CRC32 over the exact bytes given. crc32("123456789") === 3421780262. */
export function crc32Unsigned(buf: Buffer): number {
  let crc = 0xffffffff
  for (let i = 0; i < buf.length; i++) {
    crc = (crc >>> 8) ^ CRC32_TABLE[(crc ^ buf[i]) & 0xff]
  }
  return (crc ^ 0xffffffff) >>> 0
}

/**
 * SECURITY CRITICAL. Only fetch a cert URL that is HTTPS and lives on paypal.com
 * or a paypal.com subdomain. The leading dot in '.paypal.com' matters:
 * 'evilpaypal.com'.endsWith('paypal.com') is true, but it does NOT end with
 * '.paypal.com'. Without this guard an attacker supplies their own cert URL and
 * signs a forged event that verifies against their own key.
 */
export function isValidPaypalCertUrl(rawUrl: string): boolean {
  let url: URL
  try {
    url = new URL(rawUrl)
  } catch {
    return false
  }
  if (url.protocol !== 'https:') return false
  const host = url.hostname.toLowerCase()
  return host === 'paypal.com' || host.endsWith('.paypal.com')
}

// In-module PEM cache keyed by cert URL. PayPal rotates signing certs rarely, so
// the same handful of URLs recur; the bounded map caps memory and evicts oldest.
const CERT_CACHE_MAX = 16
const certCache = new Map<string, string>()

async function fetchCertPem(certUrl: string): Promise<string | null> {
  const cached = certCache.get(certUrl)
  if (cached) return cached

  try {
    const res = await fetch(certUrl)
    if (!res.ok) return null
    const pem = await res.text()
    if (!pem.includes('BEGIN CERTIFICATE')) return null

    // Bound the cache — evict the oldest entry (insertion order) when full.
    if (certCache.size >= CERT_CACHE_MAX) {
      const oldest = certCache.keys().next().value
      if (oldest !== undefined) certCache.delete(oldest)
    }
    certCache.set(certUrl, pem)
    return pem
  } catch {
    return null
  }
}

export async function verifyWebhookSignature(
  headers: Record<string, string | null>,
  rawBody: Buffer
): Promise<WebhookVerifyResult> {
  const webhookId = process.env.PAYPAL_WEBHOOK_ID
  if (!webhookId) {
    return { ok: false, reason: 'missing_webhook_id' }
  }

  const transmissionId = headers['paypal-transmission-id']
  const transmissionTime = headers['paypal-transmission-time']
  const transmissionSig = headers['paypal-transmission-sig']
  const certUrl = headers['paypal-cert-url']

  if (!transmissionId || !transmissionTime || !transmissionSig || !certUrl) {
    return { ok: false, reason: 'missing_headers' }
  }

  if (!isValidPaypalCertUrl(certUrl)) {
    return { ok: false, reason: 'bad_cert_url' }
  }

  const certPem = await fetchCertPem(certUrl)
  if (!certPem) {
    return { ok: false, reason: 'cert_fetch_failed' }
  }

  // crc32 over the EXACT received bytes — re-serializing JSON would change them.
  const signedString = `${transmissionId}|${transmissionTime}|${webhookId}|${crc32Unsigned(rawBody)}`

  try {
    const verifier = crypto.createVerify('RSA-SHA256')
    verifier.update(signedString)
    verifier.end()
    // Node accepts a PEM X.509 cert directly as the key argument.
    const valid = verifier.verify(certPem, transmissionSig, 'base64')
    return valid ? { ok: true } : { ok: false, reason: 'signature_mismatch' }
  } catch {
    // A malformed cert or signature lands here — treat as a mismatch, not a crash.
    return { ok: false, reason: 'signature_mismatch' }
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
