/**
 * app/api/cron/refresh-data/route.ts
 * GET /api/cron/refresh-data
 *
 * Runs every day at 3:00 AM UTC (schedule: "0 3 * * *").
 * Refreshes channel snapshots and competitor video data for all active users
 * by calling the existing POST /api/sync endpoint with a cron bypass header.
 *
 * Security: requires x-cron-secret header matching CRON_SECRET env var.
 * Never lets one user's failure stop the whole batch.
 */

import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'

export async function GET(request: Request) {
  // ── Auth check ─────────────────────────────────────────────────────────────
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createServiceClient()

  // ── Load eligible users ────────────────────────────────────────────────────
  const { data: users, error } = await supabase
    .from('users')
    .select('id')
    .eq('onboarding_completed', true)
    .in('subscription_status', ['trial', 'starter', 'pro'])
    .not('youtube_access_token', 'is', null)

  if (error) {
    console.error('[cron/refresh-data] Failed to load users:', error.message)
    return NextResponse.json({ error: 'Failed to load users' }, { status: 500 })
  }

  const userList = users ?? []
  console.log(`[cron/refresh-data] Processing ${userList.length} user(s)`)

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'
  let succeeded = 0
  let failed = 0

  for (const user of userList) {
    try {
      const res = await fetch(`${appUrl}/api/sync`, {
        method: 'POST',
        headers: {
          'x-cron-user-id': user.id,
          'x-cron-secret': process.env.CRON_SECRET ?? '',
        },
      })

      if (!res.ok) {
        const body = await res.text()
        throw new Error(`HTTP ${res.status}: ${body}`)
      }

      succeeded++
      console.log(`[cron/refresh-data] Synced user ${user.id}`)
    } catch (err) {
      failed++
      console.error(`[cron/refresh-data] Failed for user ${user.id}:`, err)
    }

    // 1 second delay between users
    if (userList.indexOf(user) < userList.length - 1) {
      await new Promise((resolve) => setTimeout(resolve, 1000))
    }
  }

  console.log(`[cron/refresh-data] Done — succeeded: ${succeeded}, failed: ${failed}`)

  return NextResponse.json({
    processed: userList.length,
    succeeded,
    failed,
  })
}
