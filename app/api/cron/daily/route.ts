import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const today = new Date()
  const isMonday = today.getUTCDay() === 1
  const results: Record<string, string> = {}

  try {
    await refreshCompetitorData()
    results.competitorRefresh = 'done'

    await runTrendDetection()
    results.trendDetection = 'done'

    if (isMonday) {
      await sendWeeklyDigests()
      results.weeklyDigest = 'sent'
    } else {
      results.weeklyDigest = 'skipped — not Monday'
    }

    return NextResponse.json({ success: true, results })
  } catch (error) {
    console.error('Cron job failed:', error)
    return NextResponse.json({ error: 'Cron failed' }, { status: 500 })
  }
}

async function refreshCompetitorData() {
  console.log('Competitor refresh: will be built in Week 2')
}

async function runTrendDetection() {
  console.log('Trend detection: will be built in Week 2')
}

async function sendWeeklyDigests() {
  console.log('Weekly digest: will be built in Week 2')
}