/**
 * scripts/test-trend-alert.ts
 * Tests the trend alert email pipeline end-to-end.
 *
 * Test 1 — sends a real trend alert email to the test user's inbox.
 * Test 2 — calls checkAndSendAlerts() and verifies it runs without error.
 *
 * Run:
 *   npx tsx --env-file=.env.local scripts/test-trend-alert.ts
 */

import { sendTrendAlert, checkAndSendAlerts } from '@/lib/email'
import type { ViralVideo } from '@/types'

const USER_ID = '848f7497-9a46-40a3-8d90-a96d1c9cf909'

const fakeViralVideo: ViralVideo = {
  videoId: 'test_viral_001',
  title: 'I Quit My Job to Invest Full Time',
  channelId: 'comp_finance_sarah',
  channelName: 'Finance With Sarah',
  viewCount: 89000,
  velocityScore: 245,
  publishedAt: new Date(Date.now() - 31 * 3600000).toISOString(), // 31 hours ago
  thumbnailUrl: '',
  performanceVsAvg: 2.13,
}

const suggestedAngle =
  'Show your audience what actually happened when you tracked your investments full-time for 30 days — ' +
  'use real numbers to contrast the expectation vs reality.'

async function main() {
  console.log('=== Trend Alert Email Test ===\n')

  // ── Test 1: send a real email ────────────────────────────────────────────
  console.log('--- Test 1: sendTrendAlert ---')
  console.log('userId:', USER_ID)
  console.log('video:', fakeViralVideo.title)
  console.log('channel:', fakeViralVideo.channelName)
  console.log('views:', fakeViralVideo.viewCount.toLocaleString())
  console.log('performance:', fakeViralVideo.performanceVsAvg + 'x avg')
  console.log('')
  console.log('Sending trend alert email...')

  const start1 = Date.now()
  const ok = await sendTrendAlert(USER_ID, fakeViralVideo, suggestedAngle)
  const elapsed1 = Date.now() - start1

  if (ok) {
    console.log(`\nSUCCESS — sent (or skipped) in ${elapsed1}ms`)
    console.log('Check your inbox. It should arrive within 30 seconds.')
    console.log('\nChecklist:')
    console.log('  □ Email arrived in inbox (subject: "Trend alert: I Quit My Job...")')
    console.log('  □ Header: "Trend alert in your niche" + NIXLYTICS logo')
    console.log('  □ Red alert banner: "A video just hit 89.0K views in 31 hours"')
    console.log('  □ Video card shows channel, bold title, 2.1x performance')
    console.log('  □ Opportunity section with suggested angle')
    console.log('  □ Yellow timing note: "72 hours" visible')
    console.log('  □ "View full analysis →" CTA button')
    console.log('  □ Unsubscribe link in footer')
  } else {
    console.error('\nFAILED — check the error output above')
    console.log('\nCommon issues:')
    console.log('  • RESEND_API_KEY not set → check .env.local')
    console.log('  • Resend domain not verified → use onboarding@resend.dev for testing')
    console.log('  • user_settings table missing columns → run the SQL in CLAUDE.md Part 4')
  }

  console.log('')

  // ── Test 2: checkAndSendAlerts ───────────────────────────────────────────
  console.log('--- Test 2: checkAndSendAlerts ---')
  console.log('Running full alert check for all eligible users...')

  const start2 = Date.now()
  const result = await checkAndSendAlerts()
  const elapsed2 = Date.now() - start2

  console.log(`\nResult: ${JSON.stringify(result)} (${elapsed2}ms)`)

  if (typeof result.checked === 'number' && typeof result.sent === 'number') {
    console.log('\nSUCCESS — checkAndSendAlerts ran without error')
    console.log(`  Users checked: ${result.checked}`)
    console.log(`  Alerts sent:   ${result.sent}`)
    if (result.sent === 0) {
      console.log(
        '  (0 sent is correct — the test video ID "test_viral_001" is not in the DB,\n' +
        '   and seeded viral videos may be already alerted or not meeting criteria)',
      )
    }
  } else {
    console.error('\nFAILED — unexpected return shape:', result)
  }

  console.log('\n=== Test Complete ===')
}

main().catch(console.error)
