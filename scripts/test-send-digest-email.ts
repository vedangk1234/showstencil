import { config } from 'dotenv'
config({ path: '.env.local', override: true })

import { sendWeeklyDigest } from '../lib/email'
import { createServiceClient } from '../lib/supabase'
import type { DigestResult } from '../types'

const TEST_EMAIL = 'vedangk2912@gmail.com'

;(async () => {
  const supabase = createServiceClient()

  const { data: user } = await supabase
    .from('users')
    .select('id, name')
    .eq('email', TEST_EMAIL)
    .single()

  if (!user) {
    console.error('User not found:', TEST_EMAIL)
    process.exit(1)
  }

  console.log(`Found user: ${user.name} (${user.id})`)

  const { data: digest } = await supabase
    .from('digests')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(1)
    .single()

  if (!digest) {
    console.error('No digest found for user — run generateDigest first')
    process.exit(1)
  }

  console.log(`Using digest from: ${digest.created_at}`)

  const digestResult: DigestResult = {
    id: digest.id as string,
    userId: user.id,
    generatedAt: digest.created_at,
    overallGapScore: (digest.key_metrics as { overallGapScore?: number })?.overallGapScore ?? 0,
    sections: {
      thisWeek: '',
      competitorMoves: '',
      videoIdeas: '',
      oneChange: '',
    },
    rawMarkdown: digest.content ?? '',
    videoIdeasParsed: (digest.video_ideas as DigestResult['videoIdeasParsed']) ?? [],
  }

  console.log(`Gap score: ${digestResult.overallGapScore}`)
  console.log(`Ideas: ${digestResult.videoIdeasParsed.length}`)
  console.log('Sending digest email...')

  const result = await sendWeeklyDigest(user.id, digestResult)

  console.log('Email sent:', result)
  process.exit(result ? 0 : 1)
})()
