/**
 * lib/email.ts
 * All email-sending functions for Nixlytics using the Resend SDK.
 *
 * Requires:
 *  - RESEND_API_KEY in env
 *  - RESEND_FROM_EMAIL in env  (e.g. "digest@nixlytics.com")
 *
 * Requires the `unsubscribe_token` column on the user_settings table.
 * Provision once in Supabase:
 *
 *   ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS unsubscribe_token TEXT;
 *
 * Never throws — all functions return a boolean or primitive on failure.
 */

import { Resend } from 'resend'
import { render } from '@react-email/components'
import * as React from 'react'
import { createServiceClient } from '@/lib/supabase'
import { getUser, getUserSettings, upsertUserSettings } from '@/lib/db'
import { WeeklyDigestEmail } from '@/emails/weekly-digest'
import { TrendAlertEmail } from '@/emails/trend-alert'
import { detectViralVideos, findUncoveredTopics } from '@/lib/trend-detector'
import type { DigestResult, ViralVideo } from '@/types'

const resend = new Resend(process.env.RESEND_API_KEY)

const APP_URL =
  process.env.NEXT_PUBLIC_APP_URL ?? 'https://nixlytics-u6k1.vercel.app'
const FROM_EMAIL =
  process.env.RESEND_FROM_EMAIL ?? 'digest@nixlytics-u6k1.vercel.app'

// ---------------------------------------------------------------------------
// generateUnsubscribeToken
// ---------------------------------------------------------------------------

/**
 * Creates a unique unsubscribe token for the user and persists it to
 * user_settings.unsubscribe_token.
 *
 * NOTE: requires ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS unsubscribe_token TEXT;
 *
 * @returns the generated token string
 */
export async function generateUnsubscribeToken(userId: string): Promise<string> {
  const supabase = createServiceClient()
  const token = crypto.randomUUID()

  // Upsert user_settings row — creates it if it doesn't exist yet
  const { error } = await supabase.from('user_settings').upsert(
    {
      user_id: userId,
      unsubscribe_token: token,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id' },
  )

  if (error) {
    // Non-fatal — the token is still returned so the email can be sent
    console.warn('[email] generateUnsubscribeToken upsert error:', error.message)
  }

  return token
}

// ---------------------------------------------------------------------------
// sendWeeklyDigest
// ---------------------------------------------------------------------------

/**
 * Renders and sends the weekly digest email to the user.
 *
 * Flow:
 *  1. Load user from DB (email, name)
 *  2. Check user_settings.weekly_digest_enabled — skip if false
 *  3. Load latest ideas from the ideas table
 *  4. Load latest gap score for revenue gap
 *  5. Load latest channel snapshot for user avg views
 *  6. Load this user's viral competitor videos for "what competitors did"
 *  7. Generate unsubscribe token
 *  8. Render WeeklyDigestEmail to HTML
 *  9. Send via Resend
 * 10. Update digests.email_sent_at
 *
 * @returns true on success, false on any error — never throws
 */
export async function sendWeeklyDigest(
  userId: string,
  digestData: DigestResult,
): Promise<boolean> {
  try {
    const supabase = createServiceClient()

    // 1. Load user
    const user = await getUser(userId)
    if (!user) {
      console.error('[email] sendWeeklyDigest: user not found', userId)
      return false
    }

    // 2. Check notification preferences
    const { data: settings } = await supabase
      .from('user_settings')
      .select('weekly_digest_enabled')
      .eq('user_id', userId)
      .single()

    if (settings && settings.weekly_digest_enabled === false) {
      console.log(`[email] sendWeeklyDigest: digest disabled for ${user.email} — skipping`)
      return true
    }

    // 3. Load latest generated ideas from ideas table
    const { data: ideasRow } = await supabase
      .from('ideas')
      .select('ideas')
      .eq('user_id', userId)
      .order('generated_at', { ascending: false })
      .limit(1)
      .single()

    type RawIdea = { rank: number; title: string; score: number; whyNow: string }
    const rawIdeas = (ideasRow?.ideas as RawIdea[] | null) ?? null

    // Build video ideas array — prefer DB ideas, fall back to digest-parsed ideas
    const videoIdeas: { rank: number; title: string; score: number; whyNow: string }[] =
      rawIdeas && rawIdeas.length > 0
        ? rawIdeas.slice(0, 3).map((idea) => ({
            rank: idea.rank ?? 1,
            title: idea.title,
            score: idea.score ?? 50,
            whyNow: idea.whyNow ?? '',
          }))
        : digestData.videoIdeasParsed.slice(0, 3).map((idea, i) => ({
            rank: i + 1,
            title: idea.title,
            score: idea.opportunityScore ?? 50,
            whyNow: idea.reasoning,
          }))

    // 4. Load latest gap score for revenue gap
    const { data: gapScore } = await supabase
      .from('gap_scores')
      .select('estimated_revenue_gap')
      .eq('user_id', userId)
      .order('calculated_at', { ascending: false })
      .limit(1)
      .single()

    const revenueGap = gapScore?.estimated_revenue_gap ?? 0

    // 5. Load latest channel snapshot for user avg views
    const { data: snapshot } = await supabase
      .from('channel_snapshots')
      .select('avg_views_per_video')
      .eq('user_id', userId)
      .order('snapshot_date', { ascending: false })
      .limit(1)
      .single()

    const userAvgViews = snapshot?.avg_views_per_video ?? 0

    // Estimate competitor avg views from gap score
    // Higher gap score → larger competitor avg relative to user
    const competitorAvgViews =
      userAvgViews > 0
        ? Math.round(userAvgViews * (1 + digestData.overallGapScore / 100))
        : 0

    // 6. Load competitor viral videos for this user
    // First get the competitor IDs for this user
    const { data: userCompetitors } = await supabase
      .from('competitors')
      .select('id, channel_name')
      .eq('user_id', userId)
      .eq('is_active', true)

    const competitorIds = (userCompetitors ?? []).map((c) => c.id)
    const nameMap = new Map(
      (userCompetitors ?? []).map((c) => [c.id as string, c.channel_name as string | null]),
    )

    let competitorMoves: {
      videoTitle: string
      channelName: string
      viewCount: number
      performanceMultiplier: number
    }[] = []

    if (competitorIds.length > 0) {
      const { data: viralVideos } = await supabase
        .from('competitor_videos')
        .select('title, view_count, performance_vs_avg, competitor_id')
        .in('competitor_id', competitorIds)
        .eq('is_viral', true)
        .order('velocity_score', { ascending: false })
        .limit(3)

      competitorMoves = (viralVideos ?? []).map((v) => ({
        videoTitle: v.title ?? 'Untitled',
        channelName: nameMap.get(v.competitor_id) ?? 'Unknown',
        viewCount: v.view_count ?? 0,
        performanceMultiplier: v.performance_vs_avg ?? 1,
      }))
    }

    // 7. Generate unsubscribe token
    const unsubscribeToken = await generateUnsubscribeToken(userId)

    // 8. Format week date from digest timestamp
    const weekDate = new Date(digestData.generatedAt).toLocaleDateString('en-US', {
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    })

    // 9. Render email component to HTML
    const emailHtml = await render(
      React.createElement(WeeklyDigestEmail, {
        channelName: user.name ?? user.email,
        weekDate,
        gapScore: digestData.overallGapScore,
        metrics: {
          userAvgViews,
          competitorAvgViews,
          revenueGap,
        },
        competitorMoves,
        videoIdeas,
        oneChange: digestData.sections.oneChange,
        unsubscribeToken,
      }),
    )

    // 10. Send via Resend
    const subject = `Your Nixlytics digest — ${weekDate} · Gap score: ${digestData.overallGapScore} · ${videoIdeas.length} ideas ready`

    const { data: sendData, error: sendError } = await resend.emails.send({
      from: `Nixlytics <${FROM_EMAIL}>`,
      to: user.email,
      subject,
      html: emailHtml,
    })

    if (sendError) {
      console.error('[email] sendWeeklyDigest Resend error:', sendError)
      return false
    }

    console.log(
      `[email] sent weekly digest to ${user.email} — messageId: ${sendData?.id}`,
    )

    // 11. Update digests.email_sent_at for the most recent digest row
    const { data: latestDigest } = await supabase
      .from('digests')
      .select('id')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(1)
      .single()

    if (latestDigest?.id) {
      await supabase
        .from('digests')
        .update({ email_sent_at: new Date().toISOString() })
        .eq('id', latestDigest.id)
    }

    return true
  } catch (err) {
    console.error('[email] sendWeeklyDigest unexpected error:', err)
    return false
  }
}

// ---------------------------------------------------------------------------
// sendTrendAlert
// ---------------------------------------------------------------------------

/**
 * Renders and sends a viral trend alert email to the user.
 *
 * Flow:
 *  1. Load user from DB (email, channel name)
 *  2. Load user_settings — skip if alerts_enabled is false
 *  3. Skip if user already received an alert today (last_alert_sent_at)
 *  4. Get or generate unsubscribe token
 *  5. Render TrendAlertEmail to HTML
 *  6. Send via Resend
 *  7. Update user_settings.last_alert_sent_at = now()
 *
 * @returns true on success or skipped, false on send error
 */
export async function sendTrendAlert(
  userId: string,
  viralVideo: ViralVideo,
  suggestedAngle: string,
): Promise<boolean> {
  try {
    // 1. Load user
    const user = await getUser(userId)
    if (!user) {
      console.error('[email] sendTrendAlert: user not found', userId)
      return false
    }

    // 2. Check notification preferences
    const settings = await getUserSettings(userId)

    if (settings && settings.alerts_enabled === false) {
      console.log(`[email] sendTrendAlert: alerts disabled for ${user.email} — skipping`)
      return true
    }

    // 3. Check if already alerted today
    if (settings?.last_alert_sent_at) {
      const lastAlertDate = settings.last_alert_sent_at.slice(0, 10) // YYYY-MM-DD
      const todayDate = new Date().toISOString().slice(0, 10)
      if (lastAlertDate === todayDate) {
        console.log(`[email] sendTrendAlert: already sent alert today to ${user.email} — skipping`)
        return true
      }
    }

    // 4. Get existing unsubscribe token or generate a new one
    let unsubscribeToken = settings?.unsubscribe_token ?? null
    if (!unsubscribeToken) {
      unsubscribeToken = await generateUnsubscribeToken(userId)
    }

    // 5. Calculate hours old from publishedAt
    const publishedMs = viralVideo.publishedAt ? new Date(viralVideo.publishedAt).getTime() : Date.now()
    const hoursOld = Math.round((Date.now() - publishedMs) / (1000 * 60 * 60))

    // 6. Render email component to HTML
    const emailHtml = await render(
      React.createElement(TrendAlertEmail, {
        channelName: user.name ?? user.email,
        competitorChannelName: viralVideo.channelName,
        videoTitle: viralVideo.title,
        viewCount: viralVideo.viewCount,
        performanceMultiplier: viralVideo.performanceVsAvg,
        hoursOld,
        suggestedAngle,
        viewFullAnalysisUrl: `${APP_URL}/dashboard`,
        unsubscribeToken,
      }),
    )

    // 7. Send via Resend
    const subject = `Trend alert: "${viralVideo.title}" just hit ${formatViewCount(viralVideo.viewCount)} views in your niche`

    const { data: sendData, error: sendError } = await resend.emails.send({
      from: `Nixlytics Alerts <${FROM_EMAIL}>`,
      to: user.email,
      subject,
      html: emailHtml,
    })

    if (sendError) {
      console.error('[email] sendTrendAlert Resend error:', sendError)
      return false
    }

    console.log(`[email] sent trend alert to ${user.email} — messageId: ${sendData?.id}`)

    // 8. Update last_alert_sent_at
    await upsertUserSettings(userId, {
      last_alert_sent_at: new Date().toISOString(),
    })

    return true
  } catch (err) {
    console.error('[email] sendTrendAlert unexpected error:', err)
    return false
  }
}

// ---------------------------------------------------------------------------
// checkAndSendAlerts  (called by the trend-detection cron)
// ---------------------------------------------------------------------------

/**
 * Checks all eligible users for new viral videos in their niche and sends
 * a trend alert email when a fresh unalerted viral video is found.
 *
 * Rules:
 *  - Only users with onboarding_completed=true and paid/trial subscription
 *  - Max 1 alert per user per day (enforced by sendTrendAlert)
 *  - Each unique videoId is alerted at most once per user (alerted_video_ids)
 *
 * @returns { checked: number, sent: number }
 */
export async function checkAndSendAlerts(): Promise<{ checked: number; sent: number }> {
  const supabase = createServiceClient()
  let checked = 0
  let sent = 0

  // 1. Get all eligible users
  const { data: users, error: usersError } = await supabase
    .from('users')
    .select('id')
    .eq('onboarding_completed', true)
    .in('subscription_status', ['trial', 'starter', 'pro'])

  if (usersError) {
    console.error('[email] checkAndSendAlerts: users query error:', usersError.message)
    return { checked: 0, sent: 0 }
  }

  if (!users || users.length === 0) return { checked: 0, sent: 0 }

  for (const { id: userId } of users) {
    checked++

    try {
      // 2a. Get competitor IDs for this user
      const { data: competitors } = await supabase
        .from('competitors')
        .select('id')
        .eq('user_id', userId)
        .eq('is_active', true)

      const competitorIds = (competitors ?? []).map((c: { id: string }) => c.id)
      if (competitorIds.length === 0) continue

      // 2b. Find viral videos for this user's competitors
      const viralVideos = await detectViralVideos(competitorIds)
      if (viralVideos.length === 0) continue

      // 2c. Take the top viral video (highest velocity_score)
      const topVideo = viralVideos[0]

      // 2d. Load user settings to check alerted_video_ids
      const settings = await getUserSettings(userId)
      const alertedIds: string[] = settings?.alerted_video_ids ?? []

      // Skip if already alerted for this video
      if (alertedIds.includes(topVideo.videoId)) continue

      // 2e. Get user titles for topic gap analysis
      const { data: userVideos } = await supabase
        .from('videos')
        .select('title')
        .eq('user_id', userId)
        .order('published_at', { ascending: false })
        .limit(20)

      const userTitles = (userVideos ?? [])
        .map((v: { title: string | null }) => v.title)
        .filter((t): t is string => !!t)

      // Get competitor video titles for topic gap context
      const { data: compVideos } = await supabase
        .from('competitor_videos')
        .select('title')
        .in('competitor_id', competitorIds)
        .order('published_at', { ascending: false })
        .limit(30)

      const competitorTitles = (compVideos ?? [])
        .map((v: { title: string | null }) => v.title)
        .filter((t): t is string => !!t)

      // 2f. Get a suggested angle from uncovered topics analysis
      let suggestedAngle = `Cover "${topVideo.title.toLowerCase()}" from your unique perspective — ${topVideo.channelName} proved this topic converts in your niche.`

      if (userTitles.length > 0 && competitorTitles.length > 0) {
        const uncoveredTopics = await findUncoveredTopics(userTitles, competitorTitles)
        if (uncoveredTopics.length > 0) {
          suggestedAngle = uncoveredTopics[0].suggestedAngle
        }
      }

      // 2g. Send the alert
      const ok = await sendTrendAlert(userId, topVideo, suggestedAngle)

      if (ok) {
        sent++

        // 2h. Add videoId to alerted_video_ids so it is never re-sent
        const updatedIds = [...alertedIds, topVideo.videoId]
        await upsertUserSettings(userId, {
          alerted_video_ids: updatedIds,
        })
      }
    } catch (err) {
      console.error(`[email] checkAndSendAlerts: error processing user ${userId}:`, err)
      // Continue to next user — one failure must not stop the batch
    }
  }

  console.log(`[email] checkAndSendAlerts complete — checked: ${checked}, sent: ${sent}`)
  return { checked, sent }
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function formatViewCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`
  return n.toLocaleString()
}
