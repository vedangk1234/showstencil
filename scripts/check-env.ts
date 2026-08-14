/**
 * Environment checker — prints ✅/❌ per variable WITHOUT printing secret values.
 *
 * Self-loads env the same way Next.js does (via @next/env loadEnvConfig), so it
 * works in BOTH modes:
 *   - locally: reads .env.local / .env from disk
 *   - Vercel preview/prod: no file present; platform-injected process.env is used
 *
 * Run per environment:
 *   local    : npx tsx scripts/check-env.ts
 *   preview  : vercel env pull .env.preview.local --environment=preview
 *              npx tsx --env-file=.env.preview.local scripts/check-env.ts
 *   prod     : vercel env pull .env.prod.local --environment=production
 *              npx tsx --env-file=.env.prod.local scripts/check-env.ts
 *   (in an actual Vercel deployment, no env-file is needed — vars are injected.)
 *
 * Exit code is non-zero if any BOOT-REQUIRED or BILLING-CRITICAL var is
 * missing/invalid, so it can gate go-live.
 */

// Load env exactly like Next boot does. In Vercel (vars injected, no file) this
// is a harmless no-op and process.env is read as-is.
async function loadEnv(): Promise<void> {
  try {
    const { loadEnvConfig } = await import('@next/env')
    loadEnvConfig(process.cwd())
  } catch {
    try {
      const dotenv = await import('dotenv')
      dotenv.config({ path: '.env.local' })
      dotenv.config() // also pick up plain .env
    } catch {
      // No loader available; fall back to whatever is already in process.env.
    }
  }
}

// TIER 1 — boot-required. Mirrors REQUIRED_ENV_VARS in lib/env-validation.ts.
// (validateEnv throws at boot if any of these are missing.)
const BOOT_REQUIRED = [
  'NEXTAUTH_URL',
  'NEXTAUTH_SECRET',
  'GOOGLE_CLIENT_ID',
  'GOOGLE_CLIENT_SECRET',
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
  'ANTHROPIC_API_KEY',
  'CRON_SECRET',
  'PAYPAL_MODE',
] as const

// TIER 2 — billing-critical. NOT validated at boot, but billing silently
// breaks without them. PAYPAL_WEBHOOK_ID especially: the webhook now ALWAYS
// verifies the signature, so a wrong/missing id fails every activation.
const BILLING_CRITICAL = [
  'PAYPAL_CLIENT_ID',
  'PAYPAL_SECRET',
  'PAYPAL_WEBHOOK_ID',
  'PAYPAL_STARTER_PLAN_ID',
  'PAYPAL_PRO_PLAN_ID',
] as const

// TIER 3 — feature vars. Functionality degrades if missing (warn, don't fail).
const FEATURE = [
  'YOUTUBE_API_KEY',
  'RESEND_API_KEY',
  'RESEND_FROM_EMAIL',
  'SUPPORT_EMAIL',
  'GEMINI_API_KEY',
  'NEXT_PUBLIC_APP_URL',
] as const

// TIER 4 — optional monitoring. App starts fine without these.
const OPTIONAL = ['NEXT_PUBLIC_SENTRY_DSN', 'SENTRY_ORG', 'SENTRY_PROJECT'] as const

const PAYPAL_MODE_ALLOWED = ['live', 'sandbox']

function isSet(key: string): boolean {
  const v = process.env[key]
  return typeof v === 'string' && v.trim().length > 0
}

let hardFail = false

function report(title: string, keys: readonly string[], failOnMissing: boolean) {
  console.log(`\n${title}`)
  for (const key of keys) {
    const set = isSet(key)
    // PAYPAL_MODE is not a secret and must be validated — safe to print its value.
    if (key === 'PAYPAL_MODE') {
      const val = process.env.PAYPAL_MODE
      if (!set) {
        console.log(`  ❌ ${key} — MISSING`)
        if (failOnMissing) hardFail = true
      } else if (!PAYPAL_MODE_ALLOWED.includes(val as string)) {
        console.log(`  ❌ ${key} = '${val}' — INVALID (must be 'live' | 'sandbox'; boot rejects anything else)`)
        if (failOnMissing) hardFail = true
      } else {
        console.log(`  ✅ ${key} = '${val}'`)
      }
      continue
    }
    if (set) {
      console.log(`  ✅ ${key} — set`)
    } else {
      console.log(`  ${failOnMissing ? '❌' : '⚠️ '} ${key} — ${failOnMissing ? 'MISSING' : 'not set'}`)
      if (failOnMissing) hardFail = true
    }
  }
}

async function main() {
  await loadEnv()

  console.log('ShowStencil env check (values never printed; PAYPAL_MODE shown because it is non-secret)')
  report('TIER 1 — BOOT-REQUIRED (validateEnv throws if missing):', BOOT_REQUIRED, true)
  report('TIER 2 — BILLING-CRITICAL (not boot-validated; billing breaks silently):', BILLING_CRITICAL, true)

  // Cross-check: webhook id should match the active mode. We can only confirm it
  // is set; matching the right sandbox-vs-live id is a human verification step.
  if (isSet('PAYPAL_MODE') && isSet('PAYPAL_WEBHOOK_ID')) {
    console.log(`\n  ℹ️  Confirm PAYPAL_WEBHOOK_ID belongs to the '${process.env.PAYPAL_MODE}' app on the PayPal dashboard.`)
  }

  report('TIER 3 — FEATURE (degrades if missing):', FEATURE, false)
  report('TIER 4 — OPTIONAL monitoring (app starts without):', OPTIONAL, false)

  console.log(
    hardFail
      ? '\n❌ RESULT: one or more BOOT-REQUIRED / BILLING-CRITICAL vars are missing or invalid. Do NOT proceed.'
      : '\n✅ RESULT: all boot-required and billing-critical vars present and valid.',
  )
  process.exit(hardFail ? 1 : 0)
}

main()
