/**
 * scripts/paypal-verify.test.ts
 * Unit tests for the local PayPal webhook verification primitives.
 *
 * Run: npx tsx scripts/paypal-verify.test.ts
 *
 * Pure — no Supabase, no network. Covers:
 *   1. CRC32 against known vectors (must be UNSIGNED 32-bit).
 *   2. The cert-URL guard: rejects a look-alike host and a plaintext scheme,
 *      accepts a genuine paypal.com subdomain.
 */

import { strict as assert } from 'node:assert'
import { crc32Unsigned, isValidPaypalCertUrl } from '../lib/paypal'

let passed = 0
let failed = 0

function check(name: string, fn: () => void): void {
  try {
    fn()
    passed++
    console.log(`PASS  ${name}`)
  } catch (err) {
    failed++
    console.error(`FAIL  ${name}`)
    console.error(`      ${err instanceof Error ? err.message : String(err)}`)
  }
}

// ───────────────────────────────────────────────────────────────────────────
// 1. CRC32 vectors
// ───────────────────────────────────────────────────────────────────────────

check('crc32("123456789") === 3421780262 (standard check value)', () => {
  assert.equal(crc32Unsigned(Buffer.from('123456789')), 3421780262)
})

check('crc32("") === 0 (empty input)', () => {
  assert.equal(crc32Unsigned(Buffer.from('')), 0)
})

check('crc32("The quick brown fox jumps over the lazy dog") === 1095738169', () => {
  assert.equal(
    crc32Unsigned(Buffer.from('The quick brown fox jumps over the lazy dog')),
    1095738169,
  )
})

check('crc32 is unsigned (high-bit vector never returns negative)', () => {
  // "a" → 0xE8B7BE43 = 3904355907, which has the top bit set. A signed
  // implementation would return a negative number here.
  const v = crc32Unsigned(Buffer.from('a'))
  assert.equal(v, 3904355907)
  assert.ok(v >= 0, `expected unsigned, got ${v}`)
})

// ───────────────────────────────────────────────────────────────────────────
// 2. Cert-URL guard
// ───────────────────────────────────────────────────────────────────────────

check('rejects look-alike host https://evilpaypal.com/cert', () => {
  assert.equal(isValidPaypalCertUrl('https://evilpaypal.com/cert'), false)
})

check('rejects plaintext scheme http://api.paypal.com/cert', () => {
  assert.equal(isValidPaypalCertUrl('http://api.paypal.com/cert'), false)
})

check('accepts genuine sandbox cert URL', () => {
  assert.equal(
    isValidPaypalCertUrl(
      'https://api.sandbox.paypal.com/v1/notifications/certs/CERT-x',
    ),
    true,
  )
})

// Extra guard cases — belt and braces around the leading-dot logic.
check('accepts apex https://paypal.com/cert', () => {
  assert.equal(isValidPaypalCertUrl('https://paypal.com/cert'), true)
})

check('rejects suffix-embedded host https://paypal.com.evil.com/cert', () => {
  assert.equal(isValidPaypalCertUrl('https://paypal.com.evil.com/cert'), false)
})

check('rejects garbage / unparseable input', () => {
  assert.equal(isValidPaypalCertUrl('not a url'), false)
})

// ───────────────────────────────────────────────────────────────────────────

console.log(`\n${passed} passed, ${failed} failed`)
process.exit(failed === 0 ? 0 : 1)
