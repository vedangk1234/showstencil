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
}

export async function generateCompetitorInsights(
  user: InsightUserMetrics,
  competitor: InsightCompetitorMetrics,
): Promise<Insight[]> {
  const prompt = `Compare these two YouTube channels and generate 5-7 strategic insights.

USER CHANNEL: ${user.channel_name}
- Subscribers: ${user.subscriber_count.toLocaleString()}
- Avg views/video: ${user.avg_views_per_video.toLocaleString()}
- CTR: ${user.avg_ctr.toFixed(1)}%
- Avg watch time: ${Math.floor(user.avg_view_duration_seconds / 60)}:${String(user.avg_view_duration_seconds % 60).padStart(2, '0')}
- Avg video length: ${user.avg_video_length_seconds ? `${Math.floor(user.avg_video_length_seconds / 60)}m ${user.avg_video_length_seconds % 60}s` : 'Unknown'}
- Upload frequency: ${user.upload_frequency_per_month} videos/month (last 30 days)
- Sub-niche: ${user.sub_niche}

COMPETITOR: ${competitor.channel_name}
- Subscribers: ${competitor.subscriber_count.toLocaleString()}
- Avg views: ${competitor.avg_views.toLocaleString()}
- Avg video length: ${Math.floor(competitor.avg_video_length_seconds / 60)} min
- Upload frequency: ${competitor.upload_frequency_per_month} videos/month (last 30 days)
- Sub-niche: ${competitor.sub_niche}
- Top publishing days (last 30 days): ${competitor.publishing_days.join(', ')}
- Top videos:
${competitor.top_videos
  .slice(0, 5)
  .map((v) => `  - "${v.title}" (${v.views.toLocaleString()} views)`)
  .join('\n')}

Generate 5-7 actionable insights in JSON format. Return ONLY valid JSON:
[
  {
    "type": "observation" | "recommendation" | "strength" | "gap",
    "title": "Short title (5-8 words)",
    "description": "1-2 sentence explanation with specific numbers",
    "priority": "high" | "medium" | "low"
  }
]

Guidelines:
- "observation": Factual comparison (e.g., "They post 3x more than you")
- "recommendation": Actionable advice (e.g., "Test longer video formats")
- "strength": Where user is ahead (e.g., "Your CTR beats theirs")
- "gap": Where user is behind (e.g., "Missing consistent schedule")
- Priority "high" for biggest impact items
- Focus on: frequency, video length, publishing schedule, topics, CTR
- Be specific with numbers when possible

Return ONLY the JSON array, nothing else.`

  try {
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 2000,
      messages: [{ role: 'user', content: prompt }],
    })

    const textBlock = response.content.find((b) => b.type === 'text')
    if (!textBlock || textBlock.type !== 'text') return []

    const cleaned = textBlock.text
      .replace(/```json\s*/g, '')
      .replace(/```\s*/g, '')
      .trim()

    const insights = JSON.parse(cleaned)
    return Array.isArray(insights) ? insights : []
  } catch (error) {
    console.error('[competitor-insights] Generation failed:', error)
    return []
  }
}
