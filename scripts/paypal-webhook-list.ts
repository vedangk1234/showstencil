/** THROWAWAY: raw dump of webhook ownership + the exact verify request we send.
 *  Read-only by default. Pass `--try-create https://<url>/api/webhooks/paypal`
 *  to decisively test whether this app can create webhooks at all (creates then
 *  immediately deletes a throwaway webhook). */
import { loadEnvConfig } from '@next/env'
loadEnvConfig(process.cwd())
import { getPaypalBaseUrl, isLivePaypal } from '../lib/paypal'

function maskTok(t: string) { return `${t.slice(0, 8)}…${t.slice(-4)} (len ${t.length})` }

async function token(base: string): Promise<{ token: string; appId?: string }> {
  const auth = Buffer.from(`${process.env.PAYPAL_CLIENT_ID}:${process.env.PAYPAL_SECRET}`).toString('base64')
  const r = await fetch(`${base}/v1/oauth2/token`, {
    method: 'POST',
    headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'grant_type=client_credentials',
  })
  const j = (await r.json()) as { access_token: string; app_id?: string }
  return { token: j.access_token, appId: j.app_id }
}

async function main() {
  const base = getPaypalBaseUrl()
  const target = process.env.PAYPAL_WEBHOOK_ID ?? ''
  console.log(`Base URL : ${base} (live=${isLivePaypal()})`)
  console.log(`CLIENT_ID: ${process.env.PAYPAL_CLIENT_ID?.slice(0, 8)}…${process.env.PAYPAL_CLIENT_ID?.slice(-4)}`)
  console.log(`Target PAYPAL_WEBHOOK_ID: ${target}`)

  const { token: tok, appId } = await token(base)
  console.log(`>>> OAuth app_id: ${appId}`)
  console.log(`>>> Bearer token: ${maskTok(tok)}`)

  // 1. RAW list
  const list = await fetch(`${base}/v1/notifications/webhooks`, { headers: { Authorization: `Bearer ${tok}` } })
  const listBody = await list.text()
  console.log(`\n=== GET /v1/notifications/webhooks → HTTP ${list.status} ===`)
  console.log(listBody)

  // 2. RAW get-by-id
  if (target) {
    const one = await fetch(`${base}/v1/notifications/webhooks/${target}`, { headers: { Authorization: `Bearer ${tok}` } })
    console.log(`\n=== GET /v1/notifications/webhooks/${target} → HTTP ${one.status} ===`)
    console.log(await one.text())
  }

  // 3. The EXACT verify-webhook-signature request the app builds (transmission_*
  //    values are filled from a REAL delivery's headers at runtime; shown as <from-header>).
  console.log(`\n=== EXACT verify-webhook-signature request the handler sends ===`)
  console.log(`POST ${base}/v1/notifications/verify-webhook-signature`)
  console.log(`Headers:`)
  console.log(`  Authorization: Bearer ${maskTok(tok)}`)
  console.log(`  Content-Type: application/json`)
  console.log(`Body (structure):`)
  console.log(JSON.stringify({
    auth_algo: '<paypal-auth-algo header>',
    cert_url: '<paypal-cert-url header>',
    transmission_id: '<paypal-transmission-id header>',
    transmission_sig: '<paypal-transmission-sig header>',
    transmission_time: '<paypal-transmission-time header>',
    webhook_id: target,
    webhook_event: '<the raw JSON body PayPal POSTed>',
  }, null, 2))

  // 4. OPTIONAL decisive test: can this app create a webhook at all?
  const ti = process.argv.indexOf('--try-create')
  if (ti !== -1 && process.argv[ti + 1]) {
    const url = process.argv[ti + 1]
    console.log(`\n=== --try-create: POST a throwaway webhook at ${url} ===`)
    const c = await fetch(`${base}/v1/notifications/webhooks`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ url, event_types: [{ name: 'BILLING.SUBSCRIPTION.ACTIVATED' }] }),
    })
    const cBody = await c.text()
    console.log(`CREATE → HTTP ${c.status}`)
    console.log(cBody)
    if (c.status === 201) {
      const created = JSON.parse(cBody) as { id: string }
      console.log(`✅ This app CAN create webhooks (id=${created.id}). The 403 was ownership/propagation, not a permission defect.`)
      const del = await fetch(`${base}/v1/notifications/webhooks/${created.id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${tok}` } })
      console.log(`(cleanup) DELETE ${created.id} → HTTP ${del.status}`)
    } else if (c.status === 403) {
      console.log(`🔴 This app CANNOT create webhooks either — App APP-6H36… lacks webhook-API authorization. Not a per-webhook problem.`)
    }
  }

  process.exit(0)
}

main().catch((e) => { console.error(e); process.exit(1) })
