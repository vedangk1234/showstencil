/**
 * app/api/user/niche/manual/route.ts
 * POST /api/user/niche/manual — writes a manual niche selection (from the
 * picker UI) to the users table.
 *
 * Auth: NextAuth session.
 *
 * Body (JSON):
 *   {
 *     nicheSlug: string,         // valid taxonomy slug OR literal 'other'
 *     subNicheSlug?: string,     // optional, must be valid child of nicheSlug,
 *                                // OR the literal 'other'. Omit when nicheSlug
 *                                // is 'other'.
 *     description: string,       // required (≥ 50 chars after trim) when
 *                                // nicheSlug === 'other' OR subNicheSlug === 'other'.
 *                                // Optional otherwise (will be cleared from the row
 *                                // if not provided so the niche_description column
 *                                // always reflects the latest manual choice).
 *   }
 *
 * On success: 200 { success: true, nicheSlug, displayName }
 * Validation failure: 400 { error: '<reason>' }
 * Auth failure: 401
 * DB failure: 500
 */

import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { saveManualNicheSelection, NICHE_OTHER_SENTINEL } from '@/lib/niche-engine'
import {
  isValidNicheSlug,
  getNicheBySlug,
  getSubNicheBySlug,
  getDisplayName,
} from '@/lib/niches'
import { logError } from '@/lib/logger'

const MIN_DESCRIPTION_CHARS = 50
const MAX_DESCRIPTION_CHARS = 2000

interface ManualBody {
  nicheSlug?: unknown
  subNicheSlug?: unknown
  description?: unknown
}

export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }
  const userId = session.user.id

  let body: ManualBody
  try {
    body = (await req.json()) as ManualBody
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 })
  }

  // ── 1. Validate nicheSlug ───────────────────────────────────────────────
  if (typeof body.nicheSlug !== 'string' || body.nicheSlug.length === 0) {
    return NextResponse.json({ error: 'nicheSlug is required' }, { status: 400 })
  }
  const nicheSlug = body.nicheSlug
  const nicheIsOther = nicheSlug === NICHE_OTHER_SENTINEL
  if (!nicheIsOther && !isValidNicheSlug(nicheSlug)) {
    return NextResponse.json(
      { error: `nicheSlug "${nicheSlug}" is not a valid taxonomy slug` },
      { status: 400 },
    )
  }

  // ── 2. Validate subNicheSlug (optional) ─────────────────────────────────
  // Accept: undefined, null, empty string → treated as "absent".
  // Otherwise the value must be either the literal 'other' or a valid child
  // of nicheSlug. When nicheSlug === 'other', any sub-niche value is rejected
  // (the freeform niche has no structured children).
  let subNicheSlug: string | null = null
  const rawSub = body.subNicheSlug
  if (rawSub != null && rawSub !== '') {
    if (typeof rawSub !== 'string') {
      return NextResponse.json(
        { error: 'subNicheSlug must be a string if provided' },
        { status: 400 },
      )
    }
    if (nicheIsOther && rawSub !== NICHE_OTHER_SENTINEL) {
      return NextResponse.json(
        { error: 'subNicheSlug must be omitted (or "other") when nicheSlug is "other"' },
        { status: 400 },
      )
    }
    if (rawSub !== NICHE_OTHER_SENTINEL) {
      const sub = getSubNicheBySlug(nicheSlug, rawSub)
      if (!sub) {
        return NextResponse.json(
          { error: `subNicheSlug "${rawSub}" is not a valid child of "${nicheSlug}"` },
          { status: 400 },
        )
      }
    }
    subNicheSlug = rawSub
  }

  // ── 3. Validate description ─────────────────────────────────────────────
  const subIsOther = subNicheSlug === NICHE_OTHER_SENTINEL
  const descriptionRequired = nicheIsOther || subIsOther
  const rawDescription = body.description

  if (rawDescription != null && typeof rawDescription !== 'string') {
    return NextResponse.json(
      { error: 'description must be a string if provided' },
      { status: 400 },
    )
  }
  const trimmedDescription =
    typeof rawDescription === 'string' ? rawDescription.trim() : ''

  if (descriptionRequired) {
    if (trimmedDescription.length < MIN_DESCRIPTION_CHARS) {
      return NextResponse.json(
        {
          error: `description is required (≥ ${MIN_DESCRIPTION_CHARS} characters after trim) when nicheSlug or subNicheSlug is "other"`,
          required_min_chars: MIN_DESCRIPTION_CHARS,
          received_chars: trimmedDescription.length,
        },
        { status: 400 },
      )
    }
  }
  if (trimmedDescription.length > MAX_DESCRIPTION_CHARS) {
    return NextResponse.json(
      {
        error: `description is too long (max ${MAX_DESCRIPTION_CHARS} characters)`,
        max_chars: MAX_DESCRIPTION_CHARS,
        received_chars: trimmedDescription.length,
      },
      { status: 400 },
    )
  }

  // ── 4. Persist via saveManualNicheSelection ─────────────────────────────
  const ok = await saveManualNicheSelection(userId, nicheSlug, {
    subNicheSlug,
    description: trimmedDescription.length > 0 ? trimmedDescription : null,
  })

  if (!ok) {
    void logError({
      userId,
      route: 'api/user/niche/manual',
      error: 'saveManualNicheSelection returned false',
      details: {
        niche_slug: nicheSlug,
        sub_niche_slug: subNicheSlug,
        description_length: trimmedDescription.length,
      },
      severity: 'error',
    })
    return NextResponse.json({ error: 'save_failed' }, { status: 500 })
  }

  // Pick the most descriptive label available: the sub-niche display name when
  // a real sub was picked; otherwise the top-level niche display name; falling
  // back to a friendly label for the freeform 'other' selection.
  let displayName: string
  if (nicheIsOther) {
    displayName = 'Other'
  } else if (subNicheSlug && subNicheSlug !== NICHE_OTHER_SENTINEL) {
    displayName = getDisplayName(subNicheSlug)
  } else {
    const def = getNicheBySlug(nicheSlug)
    displayName = def ? def.displayName : getDisplayName(nicheSlug)
  }

  return NextResponse.json({
    success: true,
    nicheSlug,
    subNicheSlug,
    displayName,
  })
}
