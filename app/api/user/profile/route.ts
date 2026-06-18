/**
 * app/api/user/profile/route.ts
 *
 * GET   — returns the authenticated user's onboarding-relevant profile fields,
 *         resolves taxonomy display names server-side, and surfaces a
 *         derived requires_manual_selection flag so the onboarding flow can
 *         decide whether to open the manual picker.
 *
 * PATCH — partial update of niche_id / sub_niche / niche_description for the
 *         authenticated user. Slugs are validated against the canonical
 *         taxonomy in lib/niches.ts (with 'other' as a special-case literal).
 */

import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { createServiceClient } from '@/lib/supabase'
import {
  isValidNicheSlug,
  getNicheBySlug,
  getSubNicheBySlug,
  getDisplayName,
} from '@/lib/niches'
import { NICHE_OTHER_SENTINEL } from '@/lib/niche-engine'

const CONFIDENCE_THRESHOLD = 0.6
const MAX_DESCRIPTION_CHARS = 2000

export async function GET() {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const supabase = createServiceClient()
  const uid = session.user.id

  // user.id === session.user.id so both queries can run in parallel.
  const [{ data: user }, { data: snapshot }] = await Promise.all([
    supabase
      .from('users')
      .select(
        'id, name, image, niche_id, niche_description, sub_niche, sub_niche_confidence, youtube_channel_id, onboarding_completed',
      )
      .eq('id', uid)
      .single(),
    supabase
      .from('channel_snapshots')
      .select('subscriber_count')
      .eq('user_id', uid)
      .not('subscriber_count', 'is', null)
      .order('snapshot_date', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ])

  if (!user) {
    return NextResponse.json({ error: 'user_not_found' }, { status: 404 })
  }

  // Resolve display names from the canonical taxonomy. Falls back to a friendly
  // label for the 'other' sentinel; getDisplayName returns the raw slug when it
  // matches nothing (legacy slugs from before Phase 4 will fall through this way).
  const nicheId = user.niche_id ?? null
  const subNiche = user.sub_niche ?? null
  const nicheDisplayName =
    nicheId === NICHE_OTHER_SENTINEL
      ? 'Other'
      : nicheId
        ? getDisplayName(nicheId)
        : null
  const subNicheDisplayName = subNiche ? getDisplayName(subNiche) : null

  // Derived: should the onboarding flow show the manual picker?
  // - niche_id is null (detection has not produced a confident result), OR
  // - niche_id is the 'other' sentinel but no description has been recorded yet
  //   (user landed on 'other' without filling in the freeform field), OR
  // - sub_niche_confidence is recorded and below the threshold (the detector
  //   ran but couldn't classify confidently).
  const confidence: number | null =
    typeof user.sub_niche_confidence === 'number' ? user.sub_niche_confidence : null
  const otherWithoutDescription =
    nicheId === NICHE_OTHER_SENTINEL && !user.niche_description
  const requiresManualSelection =
    nicheId === null ||
    otherWithoutDescription ||
    (confidence !== null && confidence < CONFIDENCE_THRESHOLD)

  return NextResponse.json({
    niche_id: nicheId,
    niche_display_name: nicheDisplayName,
    sub_niche: subNiche,
    sub_niche_display_name: subNicheDisplayName,
    niche_confidence: confidence,
    niche_description: user.niche_description ?? null,
    requires_manual_selection: requiresManualSelection,
    youtube_channel_id: user.youtube_channel_id,
    onboarding_completed: user.onboarding_completed,
    name: user.name,
    channel_name: user.name,
    channel_thumbnail: user.image,
    subscriber_count: snapshot?.subscriber_count ?? null,
  })
}

export async function PATCH(req: Request) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  let body: { niche_id?: unknown; sub_niche?: unknown; niche_description?: unknown }
  try {
    body = (await req.json()) as {
      niche_id?: unknown
      sub_niche?: unknown
      niche_description?: unknown
    }
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 })
  }

  // Build an explicit update payload from validated fields only — never spread
  // the request body into the DB call. Each field is optional individually,
  // but at least one must be present for the PATCH to make sense.
  const update: Record<string, unknown> = {}
  let nicheSlugForSubCheck: string | null = null

  if ('niche_id' in body && body.niche_id !== undefined) {
    if (typeof body.niche_id !== 'string') {
      return NextResponse.json(
        { error: 'niche_id must be a string' },
        { status: 400 },
      )
    }
    if (body.niche_id !== NICHE_OTHER_SENTINEL && !isValidNicheSlug(body.niche_id)) {
      return NextResponse.json(
        { error: `niche_id "${body.niche_id}" is not a valid taxonomy slug` },
        { status: 400 },
      )
    }
    update.niche_id = body.niche_id
    update.niche_detected_at = new Date().toISOString()
    nicheSlugForSubCheck = body.niche_id
  }

  if ('sub_niche' in body && body.sub_niche !== undefined) {
    if (body.sub_niche === null) {
      update.sub_niche = null
      update.sub_niche_keywords = null
      update.sub_niche_confidence = null
      update.sub_niche_detected_at = null
    } else {
      if (typeof body.sub_niche !== 'string') {
        return NextResponse.json(
          { error: 'sub_niche must be a string or null' },
          { status: 400 },
        )
      }
      // Need a parent slug to validate against. Use the parent from this PATCH
      // if it's also being set; otherwise read the user's current niche_id.
      let parentSlug = nicheSlugForSubCheck
      if (!parentSlug) {
        const supabase = createServiceClient()
        const { data: existing } = await supabase
          .from('users')
          .select('niche_id')
          .eq('id', session.user.id)
          .maybeSingle()
        parentSlug = existing?.niche_id ?? null
      }
      if (!parentSlug || parentSlug === NICHE_OTHER_SENTINEL) {
        return NextResponse.json(
          {
            error:
              'sub_niche cannot be set without a valid taxonomy niche_id ("other" has no structured sub-niches)',
          },
          { status: 400 },
        )
      }
      const sub = getSubNicheBySlug(parentSlug, body.sub_niche)
      if (!sub) {
        return NextResponse.json(
          { error: `sub_niche "${body.sub_niche}" is not a valid child of "${parentSlug}"` },
          { status: 400 },
        )
      }
      update.sub_niche = body.sub_niche
      update.sub_niche_detected_at = new Date().toISOString()
    }
  }

  if ('niche_description' in body && body.niche_description !== undefined) {
    if (body.niche_description === null) {
      update.niche_description = null
    } else {
      if (typeof body.niche_description !== 'string') {
        return NextResponse.json(
          { error: 'niche_description must be a string or null' },
          { status: 400 },
        )
      }
      const trimmed = body.niche_description.trim()
      if (trimmed.length > MAX_DESCRIPTION_CHARS) {
        return NextResponse.json(
          {
            error: `niche_description is too long (max ${MAX_DESCRIPTION_CHARS} characters)`,
            max_chars: MAX_DESCRIPTION_CHARS,
            received_chars: trimmed.length,
          },
          { status: 400 },
        )
      }
      update.niche_description = trimmed.length > 0 ? trimmed : null
    }
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json(
      { error: 'no_fields_to_update' },
      { status: 400 },
    )
  }
  update.updated_at = new Date().toISOString()

  const supabase = createServiceClient()
  const { error } = await supabase
    .from('users')
    .update(update)
    .eq('id', session.user.id)

  if (error) {
    return NextResponse.json({ error: 'update_failed' }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
