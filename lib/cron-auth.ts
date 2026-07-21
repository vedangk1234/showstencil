/**
 * lib/cron-auth.ts
 * Shared authorization guard for cron routes.
 *
 * Two hardening properties over the previous inline check
 * (`authHeader !== \`Bearer ${process.env.CRON_SECRET}\``):
 *   1. Hard-fails (500) if CRON_SECRET is unset, instead of comparing against the
 *      literal string "Bearer undefined" — which would authenticate any caller.
 *   2. Constant-time comparison via crypto.timingSafeEqual (length-guarded, since
 *      timingSafeEqual throws on unequal-length buffers).
 *
 * Usage in a route handler:
 *   const denied = assertCron(request)
 *   if (denied) return denied
 */

import { NextResponse } from 'next/server'
import { timingSafeEqual } from 'node:crypto'

export function assertCron(req: Request): NextResponse | null {
  const secret = process.env.CRON_SECRET
  if (!secret) {
    // Fail closed: never fall through to a comparison against "Bearer undefined".
    return NextResponse.json(
      { error: 'Cron secret not configured' },
      { status: 500 },
    )
  }

  const header = req.headers.get('authorization') ?? ''
  const expected = `Bearer ${secret}`
  const a = Buffer.from(header)
  const b = Buffer.from(expected)

  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  return null
}
