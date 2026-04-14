/**
 * GET  /api/settings/notifications  — returns current notification settings
 * POST /api/settings/notifications  — updates notification settings
 *
 * Both routes require authentication.
 *
 * POST body:
 * {
 *   weekly_digest_enabled: boolean,
 *   alerts_enabled: boolean,
 *   alert_threshold_multiplier: number  (1.5–10.0)
 * }
 */

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { getUserSettings, upsertUserSettings } from '@/lib/db'

export async function GET(): Promise<NextResponse> {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const settings = await getUserSettings(session.user.id)

  if (!settings) {
    // Return defaults if no row exists yet
    return NextResponse.json({
      weekly_digest_enabled: true,
      alerts_enabled: true,
      alert_threshold_multiplier: 3.0,
    })
  }

  return NextResponse.json({
    weekly_digest_enabled: settings.weekly_digest_enabled,
    alerts_enabled: settings.alerts_enabled,
    alert_threshold_multiplier: settings.alert_threshold_multiplier,
  })
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const input = body as Record<string, unknown>

  // Validate each field if present
  const update: Parameters<typeof upsertUserSettings>[1] = {}

  if ('weekly_digest_enabled' in input) {
    if (typeof input.weekly_digest_enabled !== 'boolean') {
      return NextResponse.json({ error: 'weekly_digest_enabled must be a boolean' }, { status: 400 })
    }
    update.weekly_digest_enabled = input.weekly_digest_enabled
  }

  if ('alerts_enabled' in input) {
    if (typeof input.alerts_enabled !== 'boolean') {
      return NextResponse.json({ error: 'alerts_enabled must be a boolean' }, { status: 400 })
    }
    update.alerts_enabled = input.alerts_enabled
  }

  if ('alert_threshold_multiplier' in input) {
    const multiplier = input.alert_threshold_multiplier
    if (typeof multiplier !== 'number' || multiplier < 1.5 || multiplier > 10.0) {
      return NextResponse.json(
        { error: 'alert_threshold_multiplier must be a number between 1.5 and 10.0' },
        { status: 400 },
      )
    }
    update.alert_threshold_multiplier = multiplier
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 })
  }

  const ok = await upsertUserSettings(session.user.id, update)

  if (!ok) {
    return NextResponse.json({ error: 'Failed to update settings' }, { status: 500 })
  }

  // Return updated settings
  const settings = await getUserSettings(session.user.id)

  return NextResponse.json({
    weekly_digest_enabled: settings?.weekly_digest_enabled ?? true,
    alerts_enabled: settings?.alerts_enabled ?? true,
    alert_threshold_multiplier: settings?.alert_threshold_multiplier ?? 3.0,
  })
}
