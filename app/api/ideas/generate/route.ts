import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { createServiceClient } from '@/lib/supabase'
import Anthropic from '@anthropic-ai/sdk'
import { generateAndCacheInsightsForCompetitor } from '@/lib/competitor-insights'
import { deleteAllUserThumbnails, setIdeasRefreshAvailable } from '@/lib/db'
import type { Idea } from '@/types'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

// ─── Plan resolution ───────────────────────────────────────────────────────

type PlanType = 'free' | 'starter' | 'pro'

function resolvePlan(row: {
  subscription_status: string | null
  subscription_plan: string | null
  trial_ends_at: string | null
} | null): PlanType {
  if (!row) return 'free'
  const { subscription_status, subscription_plan, trial_ends_at } = row
  if (subscription_status === 'on_trial' && trial_ends_at && new Date(trial_ends_at) < new Date()) return 'free'
  if (subscription_status === 'on_trial' || subscription_status === 'active' || subscription_status === 'past_due') {
    return (subscription_plan as PlanType) ?? 'free'
  }
  return 'free'
}

// ─── Helpers ───────────────────────────────────────────────────────────────

function formatDuration(seconds: number | null | undefined): string {
  if (!seconds) return 'unknown length'
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return s > 0 ? `${m}m ${s}s` : `${m}m`
}

function formatRelativeDate(isoDate: string | null | undefined): string {
  if (!isoDate) return 'recently'
  const days = Math.floor((Date.now() - new Date(isoDate).getTime()) / (1000 * 60 * 60 * 24))
  if (days === 0) return 'today'
  if (days === 1) return 'yesterday'
  return `${days} days ago`
}

// ─── Bracket-depth JSON array extractor (same as competitor-insights.ts) ──

function extractJsonArray(raw: string): unknown[] {
  const arrayStartIndex = raw.search(/\[\s*\{/)
  if (arrayStartIndex === -1) return []

  let depth = 0
  let inString = false
  let escaped = false
  let arrayEnd = -1

  for (let i = arrayStartIndex; i < raw.length; i++) {
    const ch = raw[i]
    if (escaped) { escaped = false; continue }
    if (ch === '\\' && inString) { escaped = true; continue }
    if (ch === '"') { inString = !inString; continue }
    if (inString) continue
    if (ch === '[' || ch === '{') depth++
    if (ch === ']' || ch === '}') {
      depth--
      if (depth === 0 && ch === ']') { arrayEnd = i; break }
    }
  }

  if (arrayEnd === -1) return []
  try {
    const parsed = JSON.parse(raw.slice(arrayStartIndex, arrayEnd + 1))
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

// ─── POST /api/ideas/generate ─────────────────────────────────────────────

export async function POST(_req: Request) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const userId = session.user.id
    const supabase = createServiceClient()

    // ── 1. Resolve plan ────────────────────────────────────────────────────
    const { data: userData } = await supabase
      .from('users')
      .select('subscription_status, subscription_plan, trial_ends_at, name, niche_id, sub_niche')
      .eq('id', userId)
      .single()

    const plan = resolvePlan(userData)

    if (plan === 'free') {
      return NextResponse.json({ error: 'upgrade_required' }, { status: 403 })
    }

    // ── 2. Check ideas_refresh_available flag ─────────────────────────────
    // Controlled by user_settings.ideas_refresh_available
    // Set to false after generation, reset to true every Monday by cache-cleanup cron
    const { data: userSettings } = await supabase
      .from('user_settings')
      .select('ideas_refresh_available')
      .eq('user_id', userId)
      .maybeSingle()

    const canGenerate = userSettings?.ideas_refresh_available ?? true
    // Default true if no settings row — new users can always generate

    if (!canGenerate) {
      return NextResponse.json(
        {
          error: 'ideas_not_available',
          message: 'New ideas are available every Monday when competitor data refreshes.',
        },
        { status: 429 }
      )
    }

    // ── 2b. Delete existing thumbnails before generating new ideas ────────────
    await deleteAllUserThumbnails(userId)

    // ── 3. Check competitor insights readiness ─────────────────────────────
    const { data: competitors } = await supabase
      .from('competitors')
      .select('id, channel_name, insights, insights_generated_at, tier, sub_niche, avg_views_per_video')
      .eq('user_id', userId)
      .eq('is_active', true)

    const sevenDaysAgoMs = Date.now() - 7 * 24 * 60 * 60 * 1000
    const missing = (competitors ?? []).filter((c) => {
      if (!c.insights) return true
      if (Array.isArray(c.insights) && (c.insights as unknown[]).length === 0) return true
      if (!c.insights_generated_at) return true
      return new Date(c.insights_generated_at).getTime() < sevenDaysAgoMs
    })

    // ── 4. Generate missing insights in parallel ───────────────────────────
    if (missing.length > 0) {
      console.log(`[ideas/generate] Auto-generating insights for ${missing.length} competitor(s) in parallel`)
      await Promise.allSettled(
        missing.map(async (comp) => {
          try {
            console.log('[ideas/generate] Generating insights for', comp.channel_name)
            await generateAndCacheInsightsForCompetitor(comp.id, userId)
            console.log('[ideas/generate] Insights done for', comp.channel_name)
          } catch (err) {
            console.error('[ideas/generate] Insights failed for', comp.channel_name, err)
          }
        })
      )
    }

    // ── 5. Re-fetch competitors with fresh insights ────────────────────────
    const { data: freshCompetitors } = await supabase
      .from('competitors')
      .select('id, channel_name, tier, sub_niche, avg_views_per_video, insights')
      .eq('user_id', userId)
      .eq('is_active', true)
      .not('insights', 'is', null)

    const competitorIds = (freshCompetitors ?? []).map((c) => c.id)

    // ── 5a-5e. Gather prompt data in parallel ─────────────────────────────
    const ninetyDaysAgoIso = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString()

    const [
      topUserVideosResult,
      competitorVideosResult,
      latestSnapshotResult,
      avgDurationResult,
    ] = await Promise.all([
      supabase
        .from('videos')
        .select('title, view_count, avg_view_duration_seconds, ctr, duration_seconds, published_at')
        .eq('user_id', userId)
        .not('view_count', 'is', null)
        .order('view_count', { ascending: false })
        .limit(5),
      competitorIds.length > 0
        ? supabase
            .from('competitor_videos')
            .select('title, view_count, duration_seconds, published_at, competitor_id')
            .in('competitor_id', competitorIds)
            .gte('published_at', ninetyDaysAgoIso)
            .order('view_count', { ascending: false })
        : Promise.resolve({ data: [] }),
      supabase
        .from('channel_snapshots')
        .select('subscriber_count, avg_views_per_video')
        .eq('user_id', userId)
        .not('subscriber_count', 'is', null)
        .order('snapshot_date', { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from('videos')
        .select('duration_seconds')
        .eq('user_id', userId)
        .not('duration_seconds', 'is', null)
        .gt('duration_seconds', 0),
    ])

    const topUserVideos = topUserVideosResult.data ?? []
    const allCompetitorVideos = competitorVideosResult.data ?? []
    const latestSnapshot = latestSnapshotResult.data
    const userVideosForDuration = avgDurationResult.data ?? []

    // Compute user avg duration in minutes
    const userAvgDurationSeconds =
      userVideosForDuration.length > 0
        ? userVideosForDuration.reduce((sum, v) => sum + (v.duration_seconds ?? 0), 0) /
          userVideosForDuration.length
        : 600 // 10-minute default
    const avgDurationMinutes = Math.round(userAvgDurationSeconds / 60)

    // ── Per-competitor winning videos (beat avg by >30%) ──────────────────
    type VideoRow = {
      title: string | null
      view_count: number | null
      duration_seconds: number | null
      published_at: string | null
      competitor_id: string
    }

    const competitorsForPrompt = (freshCompetitors ?? []).map((comp) => {
      const compAvg = comp.avg_views_per_video ?? 0
      const threshold = compAvg * 1.30
      const compVideos = (allCompetitorVideos as VideoRow[]).filter(
        (v) => v.competitor_id === comp.id,
      )
      const winning = compVideos
        .filter((v) => (v.view_count ?? 0) >= threshold)
        .sort((a, b) => (b.view_count ?? 0) - (a.view_count ?? 0))
        .slice(0, 5)
      const fallback = compVideos.slice(0, 3)

      return {
        channel_name: comp.channel_name,
        tier: comp.tier,
        sub_niche: comp.sub_niche,
        avg_views_per_video: compAvg,
        insights: (comp.insights ?? []) as Array<{
          priority: string
          title: string
          description: string
        }>,
        winningVideos: winning,
        fallbackVideos: fallback,
      }
    })

    // ── 6. Build prompt ────────────────────────────────────────────────────
    const ideaCount = plan === 'pro' ? 10 : 3
    const channelName = userData?.name ?? 'Your Channel'
    const nicheId = userData?.niche_id ?? 'general'
    const subNiche = userData?.sub_niche ?? nicheId
    const subscriberCount = latestSnapshot?.subscriber_count?.toLocaleString() ?? 'unknown'
    const avgViewsPerVideo = latestSnapshot?.avg_views_per_video?.toLocaleString() ?? 'unknown'

    const userVideosSection = topUserVideos.length > 0
      ? topUserVideos.map((v) =>
          `- "${v.title}" — ${(v.view_count ?? 0).toLocaleString()} views, ${formatDuration(v.duration_seconds)} long` +
          (v.ctr ? `, ${v.ctr.toFixed(1)}% CTR` : '') +
          (v.avg_view_duration_seconds ? `, avg watch ${formatDuration(v.avg_view_duration_seconds)}` : ''),
        ).join('\n')
      : '- No video data available yet'

    const competitorSection = competitorsForPrompt.length > 0
      ? competitorsForPrompt.map((c) => {
          const avgFmt = c.avg_views_per_video.toLocaleString()
          const insightLines = c.insights
            .map((i) => `  - [${i.priority.toUpperCase()}] ${i.title}: ${i.description}`)
            .join('\n')
          const winningLines =
            c.winningVideos.length > 0
              ? c.winningVideos.map((v) =>
                  `  - "${v.title}" — ${(v.view_count ?? 0).toLocaleString()} views ` +
                  `(${Math.round(((v.view_count ?? 0) / (c.avg_views_per_video || 1)) * 100)}% of their avg), ` +
                  `${formatDuration(v.duration_seconds)} long, published ${formatRelativeDate(v.published_at)}`,
                ).join('\n')
              : c.fallbackVideos.length > 0
                ? `  - No videos beat their avg by 30%+. Top recent for context:\n` +
                  c.fallbackVideos.map((v) => `  - "${v.title}" (${(v.view_count ?? 0).toLocaleString()})`).join('\n')
                : '  - No recent video data available'

          return (
            `${c.channel_name} (Tier ${c.tier}, sub-niche: ${c.sub_niche || 'general'}, avg ${avgFmt} views/video):\n\n` +
            `Their AI-generated insights:\n${insightLines}\n\n` +
            `Their proven winning videos (beating their own avg of ${avgFmt} by more than 30%):\n${winningLines}`
          )
        }).join('\n\n---\n\n')
      : 'No competitor data with insights available yet.'

    const systemPrompt = `You are a YouTube content strategist generating original video ideas for a specific creator. Every idea must be grounded in the data provided. You will be given the creator's top performing videos, summaries of what is working for their competitors, and the specific videos that overperformed for each competitor. Your job is to find fresh angles on proven topics — never copy a competitor's title, never copy their framing, never reuse their thumbnail concept. Same topic is acceptable. Same execution is not.

Hard rules you must follow:
- Every claim in your output must reference specific numbers or specific titles from the data given
- Never use the words "consider", "you might want to", "perhaps", "could potentially"
- Never write generic advice like "make engaging content" or "focus on quality"
- The creator's name is given — use it explicitly, do not say "your channel" or "your audience"
- If you suggest a longer-than-average duration, you must cite the specific competitor video and view count that proves longer videos win on this topic
- Thumbnail descriptions must be executable by a designer who has never seen a reference — describe the subject, expression, background, text overlay (with exact wording), and colour palette
- Output strictly in the JSON format specified — no preamble, no markdown, no commentary outside the JSON
- Every idea must fit within the creator's sub-niche of "${subNiche}". If a competitor's winning video is outside this sub-niche, use it only as a structural signal (title format, duration, thumbnail style) — never as a topic to replicate. The topic itself must come from within "${subNiche}" or be a natural adjacent topic that "${channelName}"'s existing audience would expect from them based on their top performing videos.

GENERATE THREE HOOKS PER IDEA, RANKED BY BOLDNESS:

Hook 1 (goes in content_brief sentence 1): SAFE
  - The conventional opener for this topic
  - Informational tone, no controversy
  - This is the version a cautious creator would use

hook_2: BOLDER
  - Takes a stronger stance, makes a more direct claim
  - References the topic with more confidence (~1.5x the assertiveness of Hook 1)

hook_3: MOST CONTROVERSIAL
  - The boldest possible opener that still aligns with the topic
  - Willing to call out competitors, industry conventions, or popular beliefs by name
  - Highest CTR potential but riskiest for brand-safe creators
  - Must NOT be defamatory or include personal attacks — controversy is in the take, not the person

All three hooks MUST lead seamlessly into the same Angle, Structure, and Takeaway. They are alternative openers for the SAME video, not three different videos. hook_2 and hook_3 contain ONLY the hook text — no angle, no structure, no takeaway. Each hook must be a complete, self-contained opening sentence or paragraph that could be used as-is.`

    const userPrompt = `CREATOR PROFILE
Channel name: ${channelName}
Niche: ${nicheId} — ${subNiche}
Subscribers: ${subscriberCount}
Current avg views per video: ${avgViewsPerVideo}
Current avg video duration: ${avgDurationMinutes} minutes

WHAT ${channelName}'S AUDIENCE LOVES (top 5 videos by view count)
${userVideosSection}

COMPETITOR INTELLIGENCE
${competitorSection}

YOUR TASK
Generate exactly ${ideaCount} original video ideas for ${channelName}. Rank them by opportunity score, highest first.

For each idea, find the intersection between:
1. A topic that has demand evidence in the competitor data above (multiple competitors covering it successfully, or a clear winner that beat its channel's average)
2. The format and angle that ${channelName}'s top videos prove their audience responds to
3. A fresh framing that does not copy any competitor's title or approach

For duration: look at how long the winning competitor videos on similar topics ran. If those winning videos are longer than ${channelName}'s current avg of ${avgDurationMinutes} minutes AND the topic has enough depth to justify length, suggest the longer range and cite the data. If the winning videos are shorter or comparable, suggest matching ${channelName}'s current avg.

Respond in this exact JSON structure with no text before or after:

[
  {
    "title": "the video title — must be original, not a copy of any competitor title above",
    "opportunity_score": 85,
    "thumbnail_description": "specific visual description: who is in it, expression, background, text overlay with exact wording, colour palette",
    "content_brief": "Exactly 4 sentences separated by '. ': Sentence 1 = SAFE Hook (the conventional opening a cautious creator would use). Sentence 2 = Angle (what makes this different from competitor coverage). Sentence 3 = Structure (what the video covers step by step). Sentence 4 = Takeaway (the single thing the viewer walks away knowing).",
    "hook_2": "BOLDER version of the hook — a single self-contained opening sentence or paragraph. More direct, stronger stance, ~1.5x the assertiveness of the safe hook. Hook text only — no angle, structure, or takeaway.",
    "hook_3": "MOST CONTROVERSIAL version of the hook — a single self-contained opening sentence or paragraph. Calls out industry conventions, popular beliefs, or competitors by name if relevant. Highest CTR potential. Hook text only — no angle, structure, or takeaway.",
    "suggested_duration_min": 12,
    "suggested_duration_max": 16,
    "duration_reasoning": "one sentence citing specific data: e.g. 'Graham Stephan's investing video ran 14 minutes and pulled 2.1x his channel average — longer-form on this topic outperforms in finance.'",
    "why_now": "one sentence on the trend or competitor signal making this timely",
    "topic_source": "one sentence naming which competitor video(s) prove demand for this topic"
  }
]`

    // ── 7. Call Claude ─────────────────────────────────────────────────────
    console.log('[ideas/generate] Calling Claude for', ideaCount, 'ideas')
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 5000, // bumped from 3500 — hook_2 + hook_3 per idea adds ~150-200 output tokens each
      temperature: 0.7,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
    })

    const textBlock = response.content.find((b) => b.type === 'text')
    const rawText = textBlock?.type === 'text' ? textBlock.text : ''

    // ── 8. Parse with bracket-depth matcher ───────────────────────────────
    const parsed = extractJsonArray(rawText)
    if (parsed.length === 0) {
      console.error('[ideas/generate] Claude returned no parseable JSON. Raw:', rawText.slice(0, 400))
      return NextResponse.json({ error: 'Failed to parse ideas from AI response — please try again.' }, { status: 500 })
    }

    // ── 9. Save individual idea rows ──────────────────────────────────────
    const generatedAt = new Date().toISOString()
    const ideaRows = parsed
      .slice(0, ideaCount)
      .map((item: unknown) => {
        const idea = item as Record<string, unknown>

        const hook2 = idea.hook_2 && String(idea.hook_2).trim() ? String(idea.hook_2).trim() : null
        const hook3 = idea.hook_3 && String(idea.hook_3).trim() ? String(idea.hook_3).trim() : null
        if (!hook2) console.warn('[ideas/generate] hook_2 missing or empty for idea:', String(idea.title ?? ''))
        if (!hook3) console.warn('[ideas/generate] hook_3 missing or empty for idea:', String(idea.title ?? ''))

        return {
          user_id: userId,
          generated_at: generatedAt,
          title: String(idea.title ?? ''),
          opportunity_score: Number(idea.opportunity_score ?? 0),
          thumbnail_description: String(idea.thumbnail_description ?? ''),
          content_brief: String(idea.content_brief ?? ''),
          hook_2: hook2,
          hook_3: hook3,
          suggested_duration_min: Number(idea.suggested_duration_min ?? 0),
          suggested_duration_max: Number(idea.suggested_duration_max ?? 0),
          duration_reasoning: String(idea.duration_reasoning ?? ''),
          why_now: String(idea.why_now ?? ''),
          topic_source: idea.topic_source ? String(idea.topic_source) : null,
        }
      })

    const { data: savedRows, error: insertError } = await supabase
      .from('ideas')
      .insert(ideaRows)
      .select('*')

    if (insertError) {
      console.error('[ideas/generate] Insert error:', insertError.message)
      return NextResponse.json({ error: 'Failed to save ideas: ' + insertError.message }, { status: 500 })
    }

    // Ideas saved successfully — disable the Generate Ideas button until next
    // Monday's cache-cleanup cron sets ideas_refresh_available = true again
    await setIdeasRefreshAvailable(userId, false)

    // ── 10. Prune ideas older than 4 weeks ────────────────────────────────
    const fourWeeksAgo = new Date(Date.now() - 28 * 24 * 60 * 60 * 1000).toISOString()
    await supabase.from('ideas').delete().eq('user_id', userId).lt('generated_at', fourWeeksAgo)

    // ── 11. Compute regenerateAvailableAt ─────────────────────────────────
    let regenerateAvailableAt: string | null = null
    if (plan === 'starter') {
      const now = new Date()
      const nextYear = now.getUTCMonth() === 11 ? now.getUTCFullYear() + 1 : now.getUTCFullYear()
      const nextMonth = (now.getUTCMonth() + 1) % 12
      regenerateAvailableAt = new Date(Date.UTC(nextYear, nextMonth, 1)).toISOString()
    } else if (plan === 'pro') {
      regenerateAvailableAt = new Date(new Date(generatedAt).getTime() + 7 * 24 * 60 * 60 * 1000).toISOString()
    }

    const ideas = (savedRows ?? []).map((row) => ({
      id: row.id,
      user_id: row.user_id,
      title: row.title,
      opportunity_score: row.opportunity_score,
      thumbnail_description: row.thumbnail_description,
      content_brief: row.content_brief,
      hook_2: row.hook_2 ?? null,
      hook_3: row.hook_3 ?? null,
      suggested_duration_min: row.suggested_duration_min,
      suggested_duration_max: row.suggested_duration_max,
      duration_reasoning: row.duration_reasoning,
      why_now: row.why_now,
      topic_source: row.topic_source ?? null,
      generated_at: row.generated_at,
      planned_at: row.planned_at ?? null,
      made_at: row.made_at ?? null,
      thumbnail_image_url: null,
      thumbnail_generated_at: null,
      thumbnail_source_type: null,
    })) as Idea[]

    return NextResponse.json({ ideas, generatedAt, regenerateAvailableAt })
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Generation failed'
    console.error('[ideas/generate]', error)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
