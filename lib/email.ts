/**
 * lib/email.ts
 * All email-sending functions for ShowStencil using the Resend SDK.
 *
 * Requires:
 *  - RESEND_API_KEY in env
 *  - RESEND_FROM_EMAIL in env  (e.g. "digest@showstencil.com")
 *
 * Requires the `unsubscribe_token` column on the user_settings table.
 * Provision once in Supabase:
 *
 *   ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS unsubscribe_token TEXT;
 *
 * Never throws — all functions return a boolean or primitive on failure.
 *
 * sendWeeklyDigest flow:
 *  1. Load user
 *  2. Check weekly_digest_enabled
 *  3. Load gap score for revenue gap
 *  4. Load latest channel snapshot for user avg views + Tier 1 competitor avg
 *  5. Load ALL active competitors for the email competitor section
 *  6. Generate unsubscribe token
 *  7. Render + send via Resend
 *  8. Update digests.email_sent_at
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
  process.env.NEXT_PUBLIC_APP_URL ?? 'https://showstencil.com'

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
 *  3. Load latest gap score for revenue gap
 *  4. Load latest channel snapshot for user avg views + Tier 1 competitor avg
 *  5. Load ALL active competitors for the competitor section
 *  6. Generate unsubscribe token
 *  7. Render WeeklyDigestEmail to HTML
 *  8. Send via Resend
 *  9. Update digests.email_sent_at
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

    // 3. Load latest gap score for revenue gap
    const { data: gapScore } = await supabase
      .from('gap_scores')
      .select('estimated_revenue_gap')
      .eq('user_id', userId)
      .order('calculated_at', { ascending: false })
      .limit(1)
      .single()

    const revenueGap = gapScore?.estimated_revenue_gap ?? 0

    // 4. Load latest channel snapshot for user avg views
    const { data: snapshot } = await supabase
      .from('channel_snapshots')
      .select('avg_views_per_video')
      .eq('user_id', userId)
      .order('snapshot_date', { ascending: false })
      .limit(1)
      .single()

    const userAvgViews = snapshot?.avg_views_per_video ?? 0

    // Load real Tier 1 competitor avg views from DB
    const { data: tier1Competitors } = await supabase
      .from('competitors')
      .select('avg_views_per_video')
      .eq('user_id', userId)
      .eq('tier', 1)
      .eq('is_active', true)
      .eq('is_dominator', false)
      .not('avg_views_per_video', 'is', null)

    const competitorAvgViews =
      tier1Competitors && tier1Competitors.length > 0
        ? Math.round(
            tier1Competitors.reduce((sum, c) => sum + (c.avg_views_per_video ?? 0), 0) /
              tier1Competitors.length,
          )
        : 0

    // 6. Load ALL active competitors for the competitor section
    const { data: allCompetitors } = await supabase
      .from('competitors')
      .select('channel_name, tier, is_dominator, subscriber_count, avg_views_per_video, upload_frequency_30d, sub_niche')
      .eq('user_id', userId)
      .eq('is_active', true)
      .order('tier', { ascending: true })

    const competitors = (allCompetitors ?? []).map((c) => ({
      channelName: c.channel_name ?? 'Unknown',
      tier: c.tier as number | null,
      isDominator: (c.is_dominator ?? false) as boolean,
      subscriberCount: c.subscriber_count as number | null,
      avgViewsPerVideo: c.avg_views_per_video as number | null,
      uploadFrequency30d: c.upload_frequency_30d as number | null,
      subNiche: c.sub_niche as string | null,
    }))

    // 7. Generate unsubscribe token
    const unsubscribeToken = await generateUnsubscribeToken(userId)

    // 7b. Format week date from digest timestamp
    const weekDate = new Date(digestData.generatedAt).toLocaleDateString('en-US', {
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    })

    // 7c. Render email component to HTML
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
        competitors,
        oneChange: digestData.sections.oneChange,
        unsubscribeToken,
        viewFullAnalysisUrl: `${APP_URL}/digest/${digestData.id}`,
      }),
    )

    // 10. Send via Resend
    const firstName = user.name?.split(' ')[0] ?? 'creator'
    const subject = `Your weekly analysis is ready, ${firstName}`

    const { data: sendData, error: sendError } = await resend.emails.send({
      from: 'ShowStencil <digest@showstencil.com>',
      replyTo: process.env.SUPPORT_EMAIL ?? 'support@showstencil.com',
      to: user.email,
      subject,
      html: emailHtml,
      headers: {
        'X-Priority': '1',
        'X-MSMail-Priority': 'High',
        Importance: 'high',
        'List-Unsubscribe': `<${APP_URL}/api/unsubscribe?token=${unsubscribeToken}>`,
        'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
      },
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
      from: 'ShowStencil <digest@showstencil.com>',
      replyTo: process.env.SUPPORT_EMAIL ?? 'support@showstencil.com',
      to: user.email,
      subject,
      html: emailHtml,
      headers: {
        'List-Unsubscribe': `<${APP_URL}/api/unsubscribe?token=${unsubscribeToken}>`,
        'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
      },
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
    .in('subscription_status', ['on_trial', 'active', 'past_due'])

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
