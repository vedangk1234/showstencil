import Anthropic from '@anthropic-ai/sdk'
import type { Insight } from '@/types'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export interface InsightUserMetrics {
  channel_name: string
  subscriber_count: number
  avg_views_per_video: number
  avg_ctr: number
  avg_view_duration_seconds: number
  avg_video_length_seconds: number | null
  upload_frequency_per_month: number
  sub_niche: string
  estimated_monthly_revenue: number | null
  rpm: number | null
  best_videos: Array<{
    title: string
    view_count: number | null
    duration_seconds: number | null
  }>
  worst_videos: Array<{
    title: string
    view_count: number | null
    duration_seconds: number | null
  }>
  gap_scores: {
    overall: number | null
    views_gap: number | null
    ctr_gap: number | null
    watch_time_gap: number | null
    upload_frequency_gap: number | null
    estimated_revenue_gap_usd: number | null
    primary_bottleneck: string | null
  } | null
  subscriber_growth: {
    current: number
    thirtyDaysAgo: number
    netChange: number
    growthRatePct: number
    trend: 'growing' | 'flat' | 'declining'
  } | null
}

export interface InsightCompetitorMetrics {
  channel_name: string
  subscriber_count: number
  avg_views: number
  avg_video_length_seconds: number
  upload_frequency_per_month: number
  sub_niche: string
  top_videos: Array<{ title: string; views: number }>
  publishing_days: string[]
  viral_videos: Array<{
    title: string
    view_count: number | null
    performance_vs_avg: number | null
    published_at: string | null
  }>
}

export async function generateCompetitorInsights(
  user: InsightUserMetrics,
  competitor: InsightCompetitorMetrics,
): Promise<Insight[]> {
  const prompt = `
You are a sharp YouTube analytics consultant. Compare these two
channels and generate 6-8 strategic insights. Be specific — use
exact numbers from the data. Never give generic advice.

═══════════════════════════════════════════════════════
USER CHANNEL: ${user.channel_name}
═══════════════════════════════════════════════════════
Subscribers: ${user.subscriber_count.toLocaleString()}
Subscriber trend (last 30 days): ${
  user.subscriber_growth
    ? `${user.subscriber_growth.trend} — ${user.subscriber_growth.netChange > 0 ? '+' : ''}${user.subscriber_growth.netChange.toLocaleString()} subs (${user.subscriber_growth.growthRatePct}% growth)`
    : 'No trend data'
}
Avg views per video: ${user.avg_views_per_video.toLocaleString()}
CTR: ${user.avg_ctr.toFixed(1)}%
Avg watch time: ${Math.floor(user.avg_view_duration_seconds / 60)}m ${user.avg_view_duration_seconds % 60}s
Avg video length: ${
  user.avg_video_length_seconds
    ? `${Math.floor(user.avg_video_length_seconds / 60)}m ${user.avg_video_length_seconds % 60}s`
    : 'Unknown'
}
Upload frequency: ${user.upload_frequency_per_month} videos/month (last 30 days)
Sub-niche: ${user.sub_niche}
${user.estimated_monthly_revenue != null ? `Est. monthly revenue: $${user.estimated_monthly_revenue.toFixed(0)}` : ''}
${user.rpm != null ? `RPM: $${user.rpm.toFixed(2)}` : ''}

Top performing videos:
${
  user.best_videos.length > 0
    ? user.best_videos.map((v, i) =>
        `  ${i + 1}. "${v.title}" — ${(v.view_count ?? 0).toLocaleString()} views${v.duration_seconds ? ` · ${Math.floor(v.duration_seconds / 60)}m` : ''}`
      ).join('\n')
    : '  No video data available'
}

Worst performing videos:
${
  user.worst_videos.length > 0
    ? user.worst_videos.map((v, i) =>
        `  ${i + 1}. "${v.title}" — ${(v.view_count ?? 0).toLocaleString()} views${v.duration_seconds ? ` · ${Math.floor(v.duration_seconds / 60)}m` : ''}`
      ).join('\n')
    : '  No video data available'
}

${user.gap_scores ? `
Gap scores vs niche (0–100, higher = bigger opportunity):
  Overall gap score: ${user.gap_scores.overall ?? 'N/A'}/100
  Views gap: ${user.gap_scores.views_gap ?? 'N/A'}/100
  CTR gap: ${user.gap_scores.ctr_gap ?? 'N/A'}/100
  Watch time gap: ${user.gap_scores.watch_time_gap ?? 'N/A'}/100
  Upload frequency gap: ${user.gap_scores.upload_frequency_gap ?? 'N/A'}/100
  Primary bottleneck: ${user.gap_scores.primary_bottleneck ?? 'Unknown'}
  Estimated monthly revenue gap: $${(user.gap_scores.estimated_revenue_gap_usd ?? 0).toFixed(0)}
` : ''}

═══════════════════════════════════════════════════════
COMPETITOR: ${competitor.channel_name}
═══════════════════════════════════════════════════════
Subscribers: ${competitor.subscriber_count?.toLocaleString() ?? 'Unknown'}
Avg views per video: ${competitor.avg_views?.toLocaleString() ?? 'Unknown'}
Avg video length: ${
  competitor.avg_video_length_seconds
    ? `${Math.floor(competitor.avg_video_length_seconds / 60)}m ${competitor.avg_video_length_seconds % 60}s`
    : 'Unknown'
}
Upload frequency: ${competitor.upload_frequency_per_month} videos/month (last 30 days)
Sub-niche: ${competitor.sub_niche}
Top publishing days (last 30 days): ${competitor.publishing_days.join(', ')}

Top 5 videos by views:
${competitor.top_videos.map((v, i) =>
  `  ${i + 1}. "${v.title}" — ${v.views.toLocaleString()} views`
).join('\n')}

${competitor.viral_videos.length > 0 ? `
Viral breakout videos (3× their normal views within 48 hours):
${competitor.viral_videos.map((v, i) =>
  `  ${i + 1}. "${v.title}" — ${(v.view_count ?? 0).toLocaleString()} views (${((v.performance_vs_avg ?? 1)).toFixed(1)}× their average)`
).join('\n')}
` : 'No recent viral videos detected for this competitor.'}

═══════════════════════════════════════════════════════
INSTRUCTIONS
═══════════════════════════════════════════════════════
Generate 6-8 insights as a JSON array. Each insight must:

1. Reference specific numbers from the data above
2. Name ${user.channel_name} and ${competitor.channel_name} directly
3. Prioritize by impact — use gap scores to rank what matters most
4. For best/worst video patterns: identify what the top performers
   have in common (length, topic, format) that the worst performers lack
5. For viral videos: identify the title/format pattern and whether
   ${user.channel_name} has ever used it
6. For subscriber growth: frame recommendations differently based
   on trend (growing = double down, flat = fix content-audience fit,
   declining = urgent pivot needed)
7. For revenue: calculate the dollar impact of closing specific gaps
8. Never say "likely" or "suggests" when you have exact data —
   use the numbers directly

Return ONLY valid JSON — no markdown, no explanation, no preamble:
[
  {
    "type": "observation" | "recommendation" | "strength" | "gap",
    "title": "5-8 word specific title (include a number if possible)",
    "description": "2-3 sentences. Every sentence must contain at least one specific number from the data. Name both channels. End with a concrete next action.",
    "priority": "high" | "medium" | "low"
  }
]

Priority rules:
- "high": directly tied to the primary_bottleneck OR estimated_revenue_gap > $100/month
- "medium": gap score > 50 OR subscriber growth is flat/declining
- "low": observations and minor optimizations

Generate exactly 6-8 insights. No more, no less.
`.trim()

  try {
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1800,
      messages: [{ role: 'user', content: prompt }],
    })

    const textBlock = response.content.find((b) => b.type === 'text')
    if (!textBlock || textBlock.type !== 'text') return []

    const raw = textBlock.text
    // Extract the JSON array even if Claude wraps it in markdown or adds preamble
    const arrayMatch = raw.match(/\[[\s\S]*\]/)
    if (!arrayMatch) return []
    const insights = JSON.parse(arrayMatch[0])
    return Array.isArray(insights) ? insights : []
  } catch (error) {
    console.error('[competitor-insights] Generation failed:', error)
    return []
  }
}
