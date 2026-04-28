import Anthropic from '@anthropic-ai/sdk'
import { generateCompetitorInsights } from '../lib/competitor-insights'

async function main() {
  const user = {
    channel_name: 'Vedang (Test Channel)',
    subscriber_count: 45000,
    avg_views_per_video: 8400,
    avg_ctr: 2.86,
    avg_view_duration_seconds: 380,
    avg_video_length_seconds: 720,
    upload_frequency_per_month: 3,
    sub_niche: 'Personal Finance & Money Management',
    estimated_monthly_revenue: 168,
    rpm: 3.20,
    best_videos: [
      { title: 'How I Saved $10,000 in 6 Months on a $45k Salary', view_count: 34200, duration_seconds: 780 },
      { title: '5 Credit Card Mistakes That Cost Me $2,000', view_count: 21500, duration_seconds: 650 },
      { title: 'My Honest Net Worth at 27 (Full Breakdown)', view_count: 18900, duration_seconds: 820 },
    ],
    worst_videos: [
      { title: 'Q&A — Your Finance Questions Answered', view_count: 1200, duration_seconds: 540 },
      { title: 'Weekly Vlog: Grocery Shopping on a Budget', view_count: 980, duration_seconds: 420 },
      { title: 'Reading Your Comments About Money', view_count: 1450, duration_seconds: 380 },
    ],
    gap_scores: {
      overall: 58,
      views_gap: 81,
      ctr_gap: 45,
      watch_time_gap: 15,
      upload_frequency_gap: 85,
      estimated_revenue_gap_usd: 395,
      primary_bottleneck: 'upload frequency',
    },
    subscriber_growth: {
      current: 45000,
      thirtyDaysAgo: 42300,
      netChange: 2700,
      growthRatePct: 6.4,
      trend: 'growing' as const,
    },
  }

  const competitor = {
    channel_name: 'Humphrey Yang',
    subscriber_count: 2010000,
    avg_views: 255005,
    avg_video_length_seconds: 780,
    upload_frequency_per_month: 4,
    sub_niche: 'Personal Finance & Investing',
    publishing_days: ['Thursday'],
    top_videos: [
      { title: 'I Tried Every Budgeting Method for 30 Days', views: 1200000 },
      { title: 'Why Your 401k Is Failing You (And What to Do)', views: 980000 },
      { title: 'The Truth About Index Funds Nobody Tells You', views: 870000 },
      { title: 'I Calculated Exactly How Much I Need to Retire', views: 740000 },
      { title: 'Living on $30/Day for a Month Challenge', views: 690000 },
    ],
    viral_videos: [
      {
        title: 'BREAKING: The Stock Market Just Changed Forever',
        view_count: 1800000,
        performance_vs_avg: 7.1,
        published_at: '2026-02-14T00:00:00Z',
      },
      {
        title: 'WTF Just Happened to Interest Rates',
        view_count: 1400000,
        performance_vs_avg: 5.5,
        published_at: '2026-01-28T00:00:00Z',
      },
    ],
  }

  console.log('Calling generateCompetitorInsights with expanded data...\n')
  const start = Date.now()
  const insights = await generateCompetitorInsights(user, competitor)
  const elapsed = Date.now() - start

  console.log(`\n=== RESULTS (${elapsed}ms) ===`)
  console.log(`Insight count: ${insights.length}\n`)

  insights.forEach((ins, i) => {
    console.log(`[${i + 1}] [${ins.priority?.toUpperCase()}] [${ins.type}]`)
    console.log(`    Title: ${ins.title}`)
    console.log(`    ${ins.description}`)
    console.log()
  })

  // Validation checks
  const raw = JSON.stringify(insights)
  const checks = [
    { label: 'Names Humphrey Yang', pass: raw.includes('Humphrey') },
    { label: 'Names user channel', pass: raw.includes('Vedang') },
    { label: 'References best video title', pass: raw.includes('$10,000') || raw.includes('10,000') || raw.includes('Credit Card') || raw.includes('Net Worth') },
    { label: 'References worst video format', pass: raw.includes('Q&A') || raw.includes('Vlog') || raw.includes('Comments') },
    { label: 'References gap score or bottleneck', pass: raw.includes('upload') || raw.includes('frequency') || raw.includes('85') || raw.includes('58') },
    { label: 'References subscriber growth', pass: raw.includes('6.4') || raw.includes('2,700') || raw.includes('growing') || raw.includes('6%') },
    { label: 'References viral video pattern', pass: raw.includes('BREAKING') || raw.includes('WTF') || raw.includes('viral') || raw.includes('urgency') },
    { label: 'References revenue or RPM', pass: raw.includes('168') || raw.includes('3.20') || raw.includes('RPM') || raw.includes('revenue') || raw.includes('395') },
    { label: '6-8 insights generated', pass: insights.length >= 6 && insights.length <= 8 },
  ]

  console.log('=== VALIDATION ===')
  let passed = 0
  checks.forEach(c => {
    const icon = c.pass ? '✓' : '✗'
    console.log(`  ${icon} ${c.label}`)
    if (c.pass) passed++
  })
  console.log(`\n${passed}/${checks.length} checks passed`)
}

main().catch(console.error)
