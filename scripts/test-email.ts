/**
 * scripts/test-email.ts
 * Sends a test weekly digest email to verify the full email pipeline.
 *
 * Run:
 *   npx tsx --env-file=.env.local scripts/test-email.ts
 *
 * What to check after running:
 *  1. Email arrives in inbox within 30 seconds
 *  2. All 6 sections visible: header, metrics, competitor moves, ideas, one change, footer
 *  3. Unsubscribe link is present (clicking it returns 404 — expected, endpoint not built yet)
 *  4. Layout looks correct on desktop
 *  5. No broken images or layout issues (there are no images — this is by design)
 */

import { sendWeeklyDigest } from '@/lib/email'
import type { DigestResult } from '@/types'

const USER_ID = '848f7497-9a46-40a3-8d90-a96d1c9cf909'

const fakeDigest: DigestResult = {
  id: 'test-digest-id',
  userId: USER_ID,
  generatedAt: new Date().toISOString(),
  overallGapScore: 58,
  sections: {
    thisWeek:
      'Your channel averaged 8,400 views per video this week — up 12% from last week. ' +
      'Your top performer was "How I Saved $10,000 in 12 Months" at 14,200 views.',
    competitorMoves:
      'Finance With Sarah published a video that hit 89,000 views in 48 hours — ' +
      '2.1x her channel average. The title used a specific dollar amount in the hook.',
    videoIdeas:
      '1. My Exact Investment Portfolio at 25\n' +
      '2. I Tracked Every Rupee for 90 Days\n' +
      '3. What Happened After I Put Rs50K Into Index Funds',
    oneChange:
      'Post one video before Sunday. Your data shows Tuesday and Wednesday get ' +
      '31% more impressions from Browse — your current Sunday uploads miss that window entirely.',
  },
  rawMarkdown: '',
  videoIdeasParsed: [
    {
      title: 'My Exact Investment Portfolio at 25',
      opportunityScore: 87,
      reasoning:
        'Portfolio reveal videos average 2x niche views. Finance With Sarah\'s version got 89K — ' +
        'you have none in this format.',
    },
    {
      title: 'I Tracked Every Rupee for 90 Days',
      opportunityScore: 81,
      reasoning:
        'Competitor video got 52K views at 1.82x their average. Personal accountability ' +
        'format drives highest CTR in finance niche.',
    },
    {
      title: 'What Happened After I Put Rs50K Into Index Funds',
      opportunityScore: 74,
      reasoning:
        'Results-reveal format with a specific number in the title. Smart Money Moves ' +
        'used this 3x in the last quarter with 67K avg views.',
    },
  ],
}

async function main() {
  console.log('--- ShowStencil email test ---')
  console.log('userId:', USER_ID)
  console.log('gap score:', fakeDigest.overallGapScore)
  console.log('ideas:', fakeDigest.videoIdeasParsed.length)
  console.log('')
  console.log('Sending weekly digest email...')

  const start = Date.now()
  const ok = await sendWeeklyDigest(USER_ID, fakeDigest)
  const elapsed = Date.now() - start

  if (ok) {
    console.log(`\nSUCCESS — email sent in ${elapsed}ms`)
    console.log('Check your inbox. It should arrive within 30 seconds.')
    console.log('\nChecklist:')
    console.log('  □ Email arrived in inbox')
    console.log('  □ Header shows channel name + gap score badge')
    console.log('  □ Metric cards: avg views / competitor avg / revenue gap')
    console.log('  □ Competitor moves section (may be empty if no viral videos in DB)')
    console.log('  □ 3 video idea cards with score badges')
    console.log('  □ "One thing to change" highlighted box')
    console.log('  □ "View full analysis →" CTA button')
    console.log('  □ Unsubscribe link in footer (clicking it = 404 is fine)')
  } else {
    console.error('\nFAILED — check the error output above')
    console.log('\nCommon issues:')
    console.log('  • Resend domain not verified → go to resend.com/domains and verify showstencil.com')
    console.log('    OR use onboarding@resend.dev as RESEND_FROM_EMAIL for sandbox testing')
    console.log('  • RESEND_API_KEY not set → check .env.local')
    console.log('  • user_settings missing unsubscribe_token column →')
    console.log('    Run in Supabase SQL editor:')
    console.log('    ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS unsubscribe_token TEXT;')
  }
}

main().catch(console.error)
