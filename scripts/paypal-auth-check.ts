/**
 * THROWAWAY diagnostic — verifies the local PayPal client-credentials pair against
 * the SAME base URL the app uses. Never prints full secrets.
 *
 *   npx tsx scripts/paypal-auth-check.ts [pathToPreviewEnvFile]
 *
 * Pass an optional second env file (e.g. a `vercel env pull` of preview) to compare
 * its PAYPAL_CLIENT_ID against local — confirming both point at the same sandbox app.
 */
import { readFileSync } from 'fs'
import { loadEnvConfig } from '@next/env'

// Load .env.local exactly like the app boot does.
loadEnvConfig(process.cwd())

// Import AFTER env is loaded so the module reads the right PAYPAL_MODE.
import { getPaypalBaseUrl, isLivePaypal } from '../lib/paypal'

function maskEnds(v: string | undefined, headN: number, tailN: number): string {
  if (!v) return '(unset)'
  const len = v.length
  if (len <= headN + tailN) return `len=${len} value=<too short to mask safely>`
  return `len=${len}  ${v.slice(0, headN)}…${v.slice(len - tailN)}`
}

// Read the RAW .env.local RHS to catch paste artifacts (quotes / whitespace) that
// dotenv would silently strip before the value reaches process.env.
function rawRhs(key: string): string | null {
  try {
    const txt = readFileSync('.env.local', 'utf8')
    const line = txt.split(/\r?\n/).find((l) => l.trimStart().startsWith(`${key}=`))
    if (!line) return null
    return line.slice(line.indexOf('=') + 1) // keep exact raw RHS, no trimming
  } catch {
    return null
  }
}

function rawFlags(key: string): string {
  const raw = rawRhs(key)
  if (raw === null) return '(not found in .env.local)'
  const flags: string[] = []
  if (raw !== raw.trim()) flags.push('LEADING/TRAILING WHITESPACE')
  if (/^["'].*["']$/.test(raw.trim())) flags.push('SURROUNDING QUOTES')
  if (raw.includes('\t')) flags.push('TAB CHARACTER')
  if (/\s#/.test(raw)) flags.push('POSSIBLE INLINE COMMENT')
  return flags.length ? `⚠️  ${flags.join(', ')}  (raw len=${raw.length})` : `clean (raw len=${raw.length})`
}

async function main() {
  const clientId = process.env.PAYPAL_CLIENT_ID
  const secret = process.env.PAYPAL_SECRET
  const mode = process.env.PAYPAL_MODE

  let base: string
  let live: boolean
  try {
    live = isLivePaypal()
    base = getPaypalBaseUrl()
  } catch (err) {
    console.log('❌ getPaypalBaseUrl threw:', err instanceof Error ? err.message : String(err))
    process.exit(1)
  }

  console.log('=== PayPal OAuth diagnostic (LOCAL .env.local) ===')
  console.log(`PAYPAL_MODE      : '${mode}'  → isLivePaypal=${live}`)
  console.log(`Base URL         : ${base}  ${live ? '❌ LIVE — expected sandbox!' : '✅ sandbox'}`)
  console.log(`CLIENT_ID (mask) : ${maskEnds(clientId, 6, 4)}`)
  console.log(`SECRET    (mask) : ${maskEnds(secret, 4, 4)}`)
  console.log(`CLIENT_ID raw    : ${rawFlags('PAYPAL_CLIENT_ID')}`)
  console.log(`SECRET raw       : ${rawFlags('PAYPAL_SECRET')}`)

  // ── Truncation / redaction guard ────────────────────────────────────────────
  // The single most useful check: if the value the file INTENDS (raw RHS, minus
  // surrounding quotes + trailing CR) is a different length than what actually
  // parsed, a line break / hostile byte cut it. Also flags Vercel's '[SENSITIVE]'
  // placeholder and implausibly-short PayPal credentials.
  for (const [key, parsed] of [['PAYPAL_CLIENT_ID', clientId], ['PAYPAL_SECRET', secret]] as const) {
    if (parsed === '[SENSITIVE]') {
      console.log(`  🔴 ${key}: value is the literal '[SENSITIVE]' — a Vercel-redacted var, NOT the real value (vercel env pull cannot read Sensitive vars back).`)
      continue
    }
    const raw = rawRhs(key)
    if (raw === null || parsed === undefined) continue
    const intended = raw.replace(/\r$/, '').trim().replace(/^["']|["']$/g, '')
    if (intended.length !== parsed.length) {
      const badIdx = [...intended].findIndex((c) => !/[A-Za-z0-9_\-+/=.]/.test(c))
      const badByte = badIdx >= 0 ? `0x${intended.charCodeAt(badIdx).toString(16).padStart(2, '0')} at pos ${badIdx}` : '(none found on this physical line — value likely wraps onto the next line)'
      console.log(`  🔴 ${key}: TRUNCATION — intended raw len=${intended.length} but parsed len=${parsed.length}. Offending byte: ${badByte}.`)
    }
    if ((key === 'PAYPAL_CLIENT_ID' || key === 'PAYPAL_SECRET') && parsed.length < 60) {
      console.log(`  🔴 ${key}: parsed len=${parsed.length} is implausibly short for a PayPal REST credential (~80) — truncated or redacted.`)
    }
  }
  // Sandbox client ids conventionally start with 'A' and are ~80 chars; live too,
  // so length is the useful signal, not prefix. Flag obviously-wrong lengths.
  if (clientId && (clientId.length < 60 || clientId.length > 100)) {
    console.log(`  ⚠️  CLIENT_ID length ${clientId.length} is unusual for a PayPal REST client id (~80).`)
  }
  if (secret && (secret.length < 60 || secret.length > 100)) {
    console.log(`  ⚠️  SECRET length ${secret.length} is unusual for a PayPal REST secret (~80).`)
  }

  if (!clientId || !secret) {
    console.log('\n❌ CLIENT_ID or SECRET missing — cannot attempt OAuth.')
    process.exit(1)
  }

  // ---- Raw OAuth call (what the app does under the hood) ----
  const auth = Buffer.from(`${clientId}:${secret}`).toString('base64')
  const res = await fetch(`${base}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${auth}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  })
  const bodyText = await res.text()
  // Redact bearer token + nonce so a successful response never leaks a live token.
  const safeBody = bodyText
    .replace(/("access_token":")[^"]+(")/, '$1<redacted>$2')
    .replace(/("nonce":")[^"]+(")/, '$1<redacted>$2')
  console.log(`\n--- OAuth response ---`)
  console.log(`HTTP status      : ${res.status} ${res.statusText}`)
  console.log(`Body             : ${safeBody}`)

  let token: string | null = null
  try {
    const parsed = JSON.parse(bodyText) as { access_token?: string }
    token = parsed.access_token ?? null
  } catch {
    /* non-JSON body already printed */
  }

  if (res.status === 200 && token) {
    console.log('✅ OAuth succeeded — the local client_id/secret pair is VALID for this base URL.')

    // ---- Plan existence check ----
    for (const key of ['PAYPAL_STARTER_PLAN_ID', 'PAYPAL_PRO_PLAN_ID'] as const) {
      const planId = process.env[key]
      if (!planId) {
        console.log(`  ${key}: (unset)`)
        continue
      }
      const p = await fetch(`${base}/v1/billing/plans/${planId}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      const ok = p.status === 200
      let detail = ''
      if (ok) {
        try {
          const pj = (await p.json()) as { status?: string; name?: string }
          detail = ` (status=${pj.status ?? '?'}, name="${pj.name ?? '?'}")`
        } catch { /* ignore */ }
      }
      console.log(`  ${key}=${planId.slice(0, 10)}… → HTTP ${p.status} ${ok ? '✅ exists' + detail : '❌ NOT in this sandbox app'}`)
    }

    // ---- Webhook ownership check (the 403-on-verify smoking gun) ----
    const whId = process.env.PAYPAL_WEBHOOK_ID
    if (whId) {
      const w = await fetch(`${base}/v1/notifications/webhooks/${whId}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      const wt = await w.text()
      if (w.status === 200) {
        let url = '?'
        let events = '?'
        try {
          const wj = JSON.parse(wt) as { url?: string; event_types?: { name: string }[] }
          url = wj.url ?? '?'
          events = (wj.event_types ?? []).map((e) => e.name).join(', ')
        } catch { /* ignore */ }
        console.log(`  WEBHOOK ${whId} → HTTP 200 ✅ belongs to THIS app`)
        console.log(`     url    : ${url}`)
        console.log(`     events : ${events}`)
      } else {
        console.log(`  WEBHOOK ${whId} → HTTP ${w.status} ❌ NOT owned by this app — the token's app (creds in .env.local) does not own this webhook id. This is why verify returns 403 NOT_AUTHORIZED.`)
        console.log(`     body   : ${wt.slice(0, 300)}`)
      }
    } else {
      console.log('  PAYPAL_WEBHOOK_ID not set — cannot check webhook ownership.')
    }
  } else {
    console.log('❌ OAuth FAILED. If status=401 invalid_client, the client_id/secret is not a valid pair for this base URL.')
  }

  // ---- Optional: compare against preview's client id ----
  const previewFile = process.argv[2]
  if (previewFile) {
    try {
      const txt = readFileSync(previewFile, 'utf8')
      const line = txt.split(/\r?\n/).find((l) => l.trimStart().startsWith('PAYPAL_CLIENT_ID='))
      const rawVal = line ? line.slice(line.indexOf('=') + 1).trim().replace(/^["']|["']$/g, '') : undefined
      console.log(`\n--- Preview vs Local client id ---`)
      console.log(`LOCAL   CLIENT_ID: ${maskEnds(clientId, 6, 4)}`)
      console.log(`PREVIEW CLIENT_ID: ${maskEnds(rawVal, 6, 4)}`)
      if (rawVal && clientId) {
        console.log(rawVal === clientId
          ? '✅ SAME sandbox app — local and preview match.'
          : '❌ DIFFERENT client ids — local and preview are different apps. Step 2 webhook would not fire for a locally-created subscription. Standardize both on ONE sandbox app.')
      }
    } catch (err) {
      console.log(`\n(could not read preview file '${previewFile}': ${err instanceof Error ? err.message : String(err)})`)
    }
  }

  process.exit(res.status === 200 ? 0 : 1)
}

main().catch((err) => {
  console.error('THREW:', err)
  process.exit(1)
})
