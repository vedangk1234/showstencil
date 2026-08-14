/**
 * THROWAWAY read-only inspector. Reports byte-level facts about the PayPal env
 * lines WITHOUT printing secret values. Masked ends + lengths + boolean flags +
 * boundary hex of NON-alphanumeric bytes only (so no secret chars are revealed).
 *
 *   npx tsx scripts/env-inspect.ts [envFilePath]   (default: .env.local)
 */
import { readFileSync } from 'fs'
import { execSync } from 'child_process'

const FILE = process.argv[2] ?? '.env.local'
const KEYS = ['PAYPAL_CLIENT_ID', 'PAYPAL_SECRET', 'PAYPAL_STARTER_PLAN_ID', 'PAYPAL_PRO_PLAN_ID'] as const

const SAFE = /[A-Za-z0-9_\-+/=.]/ // characters that are legitimately part of PayPal ids/secrets/plan-ids
function byteName(code: number): string {
  const map: Record<number, string> = {
    0x0a: 'LF (\\n newline)', 0x0d: 'CR (\\r carriage return)', 0x20: 'SPACE',
    0x09: 'TAB', 0x23: '# (comment)', 0x22: 'DOUBLE-QUOTE', 0x27: 'SINGLE-QUOTE', 0x60: 'BACKTICK',
  }
  return map[code] ?? `0x${code.toString(16).padStart(2, '0')}`
}

function mask(v: string | undefined): string {
  if (v == null) return '(unset)'
  if (v.length <= 8) return `len=${v.length} <too short to mask>`
  return `len=${v.length}  ${v.slice(0, 4)}…${v.slice(-4)}`
}

// latin1 → one char per byte, so string index === byte offset within the line.
const text = readFileSync(FILE, 'latin1')
const lines = text.split('\n') // trailing '\r' preserved on each line if CRLF

console.log(`\n===== BYTE INSPECTION of ${FILE} =====`)

for (const key of KEYS) {
  const li = lines.findIndex((l) => l.replace(/^\s*/, '').startsWith(`${key}=`))
  if (li === -1) {
    console.log(`\n${key}: (not present in file)`)
    continue
  }
  const lineText = lines[li]
  const eq = lineText.indexOf('=')
  const rhs = lineText.slice(eq + 1) // raw RHS on the key's physical line (may end in \r)

  // Hostile / non-alphanumeric bytes in the RHS (these are what break parsing).
  const hostile: string[] = []
  for (let i = 0; i < rhs.length; i++) {
    const code = rhs.charCodeAt(i)
    if (!SAFE.test(rhs[i])) hostile.push(`pos ${i}: ${byteName(code)}`)
  }

  // Does the value wrap onto following physical lines? (unquoted value + next line
  // is neither blank nor a new KEY= assignment ⇒ the intended value was split.)
  const quoted = /^\s*["']/.test(rhs)
  let wrapEnd = li
  if (!quoted) {
    let j = li + 1
    while (j < lines.length && lines[j].trim() !== '' && !/^\s*[A-Za-z_][A-Za-z0-9_]*=/.test(lines[j])) {
      wrapEnd = j
      j++
    }
  }
  const wraps = wrapEnd > li

  console.log(`\n${key}:`)
  console.log(`  physical line(s)   : ${li + 1}${wraps ? `–${wrapEnd + 1}  ⚠️  VALUE WRAPS ACROSS LINES` : ''}`)
  console.log(`  RHS byte length    : ${rhs.replace(/\r$/, '').length} (this line, excl. line terminator)`)
  console.log(`  quoted?            : ${quoted ? rhs.trim()[0] === '"' ? 'double-quoted' : 'single-quoted' : 'UNQUOTED'}`)
  console.log(`  ends with CR (\\r)  : ${rhs.endsWith('\r') ? 'yes (CRLF file)' : 'no'}`)
  console.log(`  hostile bytes in RHS: ${hostile.length ? '⚠️  ' + hostile.join(' | ') : 'none'}`)
}

// ---- Parsed length by three parsers (masked ends only) ----
console.log(`\n===== PARSED LENGTHS (three parsers) =====`)
// eslint-disable-next-line @typescript-eslint/no-require-imports
const dotenv = require('dotenv') as typeof import('dotenv')
const dotenvParsed = dotenv.parse(readFileSync(FILE))

for (const key of ['PAYPAL_CLIENT_ID', 'PAYPAL_SECRET'] as const) {
  console.log(`\n${key}:`)
  console.log(`  dotenv.parse()        : ${mask(dotenvParsed[key])}`)

  // node built-in --env-file parser (what `npx tsx --env-file=` uses)
  try {
    const out = execSync(
      `node --env-file=${FILE} -e "const s=process.env.${key}||'';console.log(s.length+'|'+s.slice(0,4)+'|'+s.slice(-4))"`,
      { encoding: 'utf8' },
    ).trim()
    const [len, h, t] = out.split('|')
    console.log(`  node --env-file       : len=${len}  ${h}…${t}`)
  } catch (e) {
    console.log(`  node --env-file       : (parse error: ${e instanceof Error ? e.message.split('\n')[0] : String(e)})`)
  }

  // @next/env (what the app boot actually uses) — only meaningful for .env.local in cwd
  if (FILE === '.env.local') {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { loadEnvConfig } = require('@next/env') as typeof import('@next/env')
      loadEnvConfig(process.cwd())
      console.log(`  @next/env loadEnvConfig: ${mask(process.env[key])}`)
    } catch (e) {
      console.log(`  @next/env loadEnvConfig: (error: ${e instanceof Error ? e.message : String(e)})`)
    }
  }
}

console.log('')
