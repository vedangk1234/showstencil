/**
 * app/api/cron/weekly-digest/route.ts
 * GET /api/cron/weekly-digest
 *
 * Runs every Monday at 9:00 AM UTC (schedule: "0 9 * * 1").
 * Generates and saves a fresh weekly digest for every active user.
 *
 * Security: requires x-cron-secret header matching CRON_SECRET env var.
 * Never lets one user's failure stop the whole batch.
 */

import { NextResponse } from 'next/server'
import { assertCron } from '@/lib/cron-auth'
import { createServiceClient } from '@/lib/supabase'
import { generateDigest } from '@/lib/digest-generator'
import { logError } from '@/lib/logger'

export async function GET(request: Request) {
  // ── Auth check ─────────────────────────────────────────────────────────────
  const denied = assertCron(request)
  if (denied) return denied

  const supabase = createServiceClient()

  // ── Load eligible users ────────────────────────────────────────────────────
  const { data: users, error } = await supabase
    .from('users')
    .select('id')
    .eq('onboarding_completed', true)
    .in('subscription_status', ['on_trial', 'active', 'past_due'])
    .not('youtube_access_token', 'is', null)

  if (error) {
    console.error('[cron/weekly-digest] Failed to load users:', error.message)
    void logError({
      route: 'cron/weekly-digest',
      error: error.message,
    })
    return NextResponse.json({ error: 'Failed to load users' }, { status: 500 })
  }

  const userList = users ?? []
  console.log(`[cron/weekly-digest] Processing ${userList.length} user(s)`)

  let succeeded = 0
  let failed = 0

  for (const user of userList) {
    try {
      await generateDigest(user.id)
      succeeded++
      console.log(`[cron/weekly-digest] Digest generated for user ${user.id}`)
    } catch (err) {
      failed++
      console.error(`[cron/weekly-digest] Failed for user ${user.id}:`, err)
      void logError({
        userId: user.id,
        route: 'cron/weekly-digest',
        error: err instanceof Error ? err.message : String(err),
        details: { error_stack: err instanceof Error ? err.stack : undefined },
      })
    }

    // 500ms delay between users — avoid hammering YouTube + Anthropic APIs
    if (userList.indexOf(user) < userList.length - 1) {
      await new Promise((resolve) => setTimeout(resolve, 500))
    }
  }

  console.log(`[cron/weekly-digest] Done — succeeded: ${succeeded}, failed: ${failed}`)

  return NextResponse.json({
    processed: userList.length,
    succeeded,
    failed,
  })
}
