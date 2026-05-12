/**
 * scripts/create-paypal-plans.ts
 *
 * Creates a ShowStencil product and two subscription plans (Starter $29/mo, Pro $79/mo)
 * in PayPal, then prints the plan IDs so you can paste them into .env.local.
 *
 * Usage:
 *   npx tsx scripts/create-paypal-plans.ts
 *
 * Requires in .env.local:
 *   PAYPAL_CLIENT_ID
 *   PAYPAL_SECRET
 *   PAYPAL_MODE   (sandbox | live)
 */

import { config } from 'dotenv'
config({ path: '.env.local', override: true })

const PAYPAL_BASE =
  process.env.PAYPAL_MODE === 'live'
    ? 'https://api-m.paypal.com'
    : 'https://api-m.sandbox.paypal.com'

// ---------------------------------------------------------------------------
// OAuth
// ---------------------------------------------------------------------------

async function getAccessToken(): Promise<string> {
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
// Create product
// ---------------------------------------------------------------------------

async function createProduct(token: string): Promise<string> {
  const res = await fetch(`${PAYPAL_BASE}/v1/catalogs/products`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'PayPal-Request-Id': `showstencil-product-${Date.now()}`,
    },
    body: JSON.stringify({
      name: 'ShowStencil',
      description: 'YouTube analytics SaaS for content creators',
      type: 'SERVICE',
      category: 'SOFTWARE',
    }),
  })

  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Create product failed (${res.status}): ${body}`)
  }

  const data = (await res.json()) as { id: string }
  console.log(`✓ Product created: ${data.id}`)
  return data.id
}

// ---------------------------------------------------------------------------
// Create plan helper
// ---------------------------------------------------------------------------

interface PlanConfig {
  productId: string
  name: string
  description: string
  priceUsd: string
  trialDays: number
}

async function createPlan(token: string, config: PlanConfig): Promise<string> {
  const billingCycles = []

  // 7-day free trial cycle (sequence 1)
  if (config.trialDays > 0) {
    billingCycles.push({
      frequency: { interval_unit: 'DAY', interval_count: config.trialDays },
      tenure_type: 'TRIAL',
      sequence: 1,
      total_cycles: 1,
      pricing_scheme: {
        fixed_price: { value: '0', currency_code: 'USD' },
      },
    })
  }

  // Regular monthly cycle (sequence 2)
  billingCycles.push({
    frequency: { interval_unit: 'MONTH', interval_count: 1 },
    tenure_type: 'REGULAR',
    sequence: config.trialDays > 0 ? 2 : 1,
    total_cycles: 0, // 0 = infinite
    pricing_scheme: {
      fixed_price: { value: config.priceUsd, currency_code: 'USD' },
    },
  })

  const res = await fetch(`${PAYPAL_BASE}/v1/billing/plans`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'PayPal-Request-Id': `showstencil-plan-${config.name.toLowerCase().replace(/\s+/g, '-')}-${Date.now()}`,
      Prefer: 'return=representation',
    },
    body: JSON.stringify({
      product_id: config.productId,
      name: config.name,
      description: config.description,
      status: 'ACTIVE',
      billing_cycles: billingCycles,
      payment_preferences: {
        auto_bill_outstanding: true,
        setup_fee: { value: '0', currency_code: 'USD' },
        setup_fee_failure_action: 'CONTINUE',
        payment_failure_threshold: 3,
      },
      taxes: {
        percentage: '0',
        inclusive: false,
      },
    }),
  })

  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Create plan "${config.name}" failed (${res.status}): ${body}`)
  }

  const data = (await res.json()) as { id: string }
  return data.id
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const clientId = process.env.PAYPAL_CLIENT_ID
  const secret = process.env.PAYPAL_SECRET
  const mode = process.env.PAYPAL_MODE ?? 'sandbox'

  if (!clientId || !secret) {
    console.error('Error: PAYPAL_CLIENT_ID and PAYPAL_SECRET must be set in .env.local')
    process.exit(1)
  }

  console.log(`\nRunning against PayPal ${mode.toUpperCase()} environment`)
  console.log(`Base URL: ${PAYPAL_BASE}\n`)

  const token = await getAccessToken()
  console.log('✓ OAuth token obtained\n')

  const productId = await createProduct(token)

  const starterId = await createPlan(token, {
    productId,
    name: 'ShowStencil Starter',
    description: '5 competitors, 3 ideas/week, AI insights, 12 thumbnails/month',
    priceUsd: '29.00',
    trialDays: 7,
  })
  console.log(`✓ Starter plan created: ${starterId}`)

  const proId = await createPlan(token, {
    productId,
    name: 'ShowStencil Pro',
    description: '10 competitors, 10 ideas/week, all features, 40 thumbnails/month',
    priceUsd: '79.00',
    trialDays: 7,
  })
  console.log(`✓ Pro plan created: ${proId}\n`)

  console.log('─'.repeat(60))
  console.log('Add these to your .env.local:')
  console.log('─'.repeat(60))
  console.log(`PAYPAL_STARTER_PLAN_ID=${starterId}`)
  console.log(`PAYPAL_PRO_PLAN_ID=${proId}`)
  console.log('─'.repeat(60))
  console.log('\nAlso set up a webhook in PayPal Developer Dashboard and add:')
  console.log('PAYPAL_WEBHOOK_ID=<your_webhook_id>')
  console.log('\nSubscribe to these events:')
  console.log('  BILLING.SUBSCRIPTION.ACTIVATED')
  console.log('  BILLING.SUBSCRIPTION.CANCELLED')
  console.log('  BILLING.SUBSCRIPTION.EXPIRED')
  console.log('  BILLING.SUBSCRIPTION.SUSPENDED')
  console.log('  PAYMENT.SALE.COMPLETED')
  console.log(`\nWebhook URL: ${process.env.NEXT_PUBLIC_APP_URL ?? 'https://showstencil.com'}/api/webhooks/paypal`)
}

export {}

main().catch((err: unknown) => {
  console.error('Fatal error:', err)
  process.exit(1)
})
