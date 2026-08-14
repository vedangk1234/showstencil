/**
 * scripts/check-billing-state.ts
 * Read-only billing-state inspector for a single user, plus recent PayPal webhook context.
 *
 * Run: npx tsx --env-file=.env.local scripts/check-billing-state.ts <email>
 *
 * Prints:
 *   1. The user's billing columns (paypal_subscription_id masked in the middle).
 *   2. The last 10 paypal_webhook_events rows (global — the dedup table has no user_id).
 *   3. The last 10 error_logs rows for route='api/webhooks/paypal', with the `reason`
 *      pulled out of error_details.
 *
 * Read-only: SELECT only. Safe to run against production at any time.
 */

import { createServiceClient } from '../lib/supabase'

// Mask the middle of a PayPal subscription id (e.g. "I-ABCD…WXYZ"), keeping enough
// on each end to eyeball it without exposing the full id in logs/terminals.
function maskMiddle(value: string | null | undefined): string {
  if (!value) return 'NULL'
  if (value.length <= 8) return `${value[0] ?? ''}***${value[value.length - 1] ?? ''}`
  return `${value.slice(0, 4)}…${value.slice(-4)}`
}

function fmt(v: unknown): string {
  if (v === null || v === undefined) return 'null'
  return String(v)
}

async function main() {
  const email = process.argv[2]?.trim()
  if (!email) {
    console.error('Usage: npx tsx --env-file=.env.local scripts/check-billing-state.ts <email>')
    process.exit(1)
  }

  const db = createServiceClient()

  // ── 1. User billing columns ────────────────────────────────────────────────
  const { data: user, error: userErr } = await db
    .from('users')
    .select(
      'id, email, subscription_status, subscription_plan, paypal_subscription_id, ' +
      'pending_paypal_subscription_id, current_period_end, trial_ends_at, ' +
      'created_at, updated_at'
    )
    .eq('email', email)
    .maybeSingle()

  console.log(`\n═══ BILLING STATE for ${email} ═══\n`)

  if (userErr) {
    console.error('user query error:', userErr.message)
  } else if (!user) {
    console.log('  (no user row found for that email)')
  } else {
    console.log(`  id                             ${user.id}`)
    console.log(`  subscription_status            ${fmt(user.subscription_status)}`)
    console.log(`  subscription_plan              ${fmt(user.subscription_plan)}`)
    console.log(`  paypal_subscription_id         ${maskMiddle(user.paypal_subscription_id)}`)
    console.log(`  pending_paypal_subscription_id ${maskMiddle(user.pending_paypal_subscription_id)}`)
    console.log(`  current_period_end             ${fmt(user.current_period_end)}`)
    console.log(`  trial_ends_at                  ${fmt(user.trial_ends_at)}`)
    console.log(`  created_at                     ${fmt(user.created_at)}`)
    console.log(`  updated_at                     ${fmt(user.updated_at)}`)
  }

  // ── 2. Last 10 paypal_webhook_events (global dedup table — no user_id) ──────
  console.log(`\n═══ LAST 10 paypal_webhook_events (global) ═══\n`)
  const { data: events, error: evErr } = await db
    .from('paypal_webhook_events')
    .select('event_id, event_type, received_at')
    .order('received_at', { ascending: false })
    .limit(10)

  if (evErr) {
    console.error('  paypal_webhook_events query error:', evErr.message)
  } else if (!events || events.length === 0) {
    console.log('  (no rows — no PayPal webhook events recorded yet)')
  } else {
    for (const e of events) {
      console.log(`  ${fmt(e.received_at)}  ${fmt(e.event_type).padEnd(38)} ${maskMiddle(e.event_id)}`)
    }
  }

  // ── 3. Last 10 error_logs for the PayPal webhook route ─────────────────────
  console.log(`\n═══ LAST 10 error_logs (route='api/webhooks/paypal') ═══\n`)
  const { data: logs, error: logErr } = await db
    .from('error_logs')
    .select('created_at, severity, error_message, error_details')
    .eq('route', 'api/webhooks/paypal')
    .order('created_at', { ascending: false })
    .limit(10)

  if (logErr) {
    console.error('  error_logs query error:', logErr.message)
  } else if (!logs || logs.length === 0) {
    console.log('  (no rows for route=api/webhooks/paypal)')
  } else {
    for (const l of logs) {
      const details = (l.error_details ?? {}) as Record<string, unknown>
      const reason = 'reason' in details ? String(details.reason) : '(no reason field)'
      console.log(`  ${fmt(l.created_at)}  sev=${fmt(l.severity)}`)
      console.log(`     reason=${reason}   msg=${fmt(l.error_message)}`)
    }
  }

  console.log('')
}

main().catch((e) => {
  console.error('fatal:', e)
  process.exit(1)
})
