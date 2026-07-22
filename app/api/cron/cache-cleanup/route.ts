import { NextResponse } from 'next/server'
import { assertCron } from '@/lib/cron-auth'
import { createServiceClient } from '@/lib/supabase'
import { deleteThumbnailFromStorage } from '@/lib/thumbnail-storage'
import { logError } from '@/lib/logger'

// Runs daily at 2 AM UTC — purges expired searched_channels_cache rows
export async function GET(request: Request) {
  const denied = assertCron(request)
  if (denied) return denied

  const supabase = createServiceClient()

  // Delete cache rows past their expiry
  const { count: deletedCache, error: cacheErr } = await supabase
    .from('searched_channels_cache')
    .delete({ count: 'exact' })
    .lt('expires_at', new Date().toISOString())

  if (cacheErr) {
    console.error('[cron/cache-cleanup] Cache delete error:', cacheErr)
    void logError({
      route: 'api/cron/cache-cleanup',
      error: 'Failed to delete expired searched_channels_cache rows',
      details: { supabaseError: cacheErr.message },
      severity: 'error',
    })
  }

  // Delete search history older than 90 days
  const ninetyDaysAgo = new Date()
  ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90)

  const { count: deletedHistory, error: histErr } = await supabase
    .from('user_search_history')
    .delete({ count: 'exact' })
    .lt('searched_at', ninetyDaysAgo.toISOString())

  if (histErr) {
    console.error('[cron/cache-cleanup] History delete error:', histErr)
    void logError({
      route: 'api/cron/cache-cleanup',
      error: 'Failed to delete old user_search_history rows',
      details: { supabaseError: histErr.message },
      severity: 'error',
    })
  }

  // Delete inactive competitors older than 30 days
  const thirtyDaysAgo = new Date()
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

  const { count: deletedCompetitors, error: compErr } = await supabase
    .from('competitors')
    .delete({ count: 'exact' })
    .eq('is_active', false)
    .lt('created_at', thirtyDaysAgo.toISOString())

  if (compErr) {
    console.error('[cron/cache-cleanup] Competitor delete error:', compErr)
    void logError({
      route: 'api/cron/cache-cleanup',
      error: 'Failed to delete inactive competitor rows',
      details: { supabaseError: compErr.message },
      severity: 'error',
    })
  }

  // Delete thumbnail_jobs older than 24 hours
  const oneDayAgo = new Date()
  oneDayAgo.setDate(oneDayAgo.getDate() - 1)

  const { count: deletedJobs, error: jobsErr } = await supabase
    .from('thumbnail_jobs')
    .delete({ count: 'exact' })
    .lt('created_at', oneDayAgo.toISOString())

  if (jobsErr) {
    console.error('[cron/cache-cleanup] thumbnail_jobs delete error:', jobsErr)
    void logError({
      route: 'api/cron/cache-cleanup',
      error: 'Failed to delete old thumbnail_jobs rows',
      details: { supabaseError: jobsErr.message },
      severity: 'error',
    })
  }

  // Reap stuck thumbnail jobs: anything still 'pending'/'processing' after 30 minutes
  // is never completing (the after() closure died). Flip to 'failed' so the client
  // stops polling — runs before the 24h delete above removes them entirely.
  const thirtyMinAgo = new Date(Date.now() - 30 * 60 * 1000)
  const { count: reapedJobs, error: reapErr } = await supabase
    .from('thumbnail_jobs')
    .update(
      { status: 'failed', error_message: 'Timed out — generation did not complete.', completed_at: new Date().toISOString() },
      { count: 'exact' },
    )
    .in('status', ['pending', 'processing'])
    .lt('created_at', thirtyMinAgo.toISOString())

  if (reapErr) {
    console.error('[cron/cache-cleanup] stuck job reap error:', reapErr)
    void logError({
      route: 'api/cron/cache-cleanup',
      error: 'Failed to reap stuck thumbnail_jobs',
      details: { supabaseError: reapErr.message },
      severity: 'error',
    })
  }

  // Expire thumbnails older than 7 days: delete from Storage + null DB columns
  const sevenDaysAgo = new Date()
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)

  const { data: expiredIdeas, error: expiredErr } = await supabase
    .from('ideas')
    .select('id, thumbnail_image_url, user_id')
    .not('thumbnail_image_url', 'is', null)
    .lt('thumbnail_generated_at', sevenDaysAgo.toISOString())

  if (expiredErr) {
    console.error('[cron/cache-cleanup] expired thumbnails fetch error:', expiredErr)
    void logError({
      route: 'api/cron/cache-cleanup',
      error: 'Failed to fetch expired thumbnail ideas',
      details: { supabaseError: expiredErr.message },
      severity: 'error',
    })
  }

  let deletedThumbnails = 0
  for (const idea of expiredIdeas ?? []) {
    if (idea.thumbnail_image_url) {
      await deleteThumbnailFromStorage(idea.thumbnail_image_url as string)
    }
    await supabase
      .from('ideas')
      .update({ thumbnail_image_url: null, thumbnail_generated_at: null, thumbnail_source_type: null })
      .eq('id', idea.id)
    deletedThumbnails++
  }

  // ── YouTube token & data lifecycle (Terms III.E.4 a–g) ────────────────────
  const now = Date.now()
  const thirtyDaysAgoIso = new Date(now - 30 * 24 * 60 * 60 * 1000).toISOString()
  const ninetyDaysAgoIso = new Date(now - 90 * 24 * 60 * 60 * 1000).toISOString()
  // 36 months ≈ retention ceiling for statistical snapshots (accepted amendment).
  const thirtySixMonthsAgo = new Date(now)
  thirtySixMonthsAgo.setMonth(thirtySixMonthsAgo.getMonth() - 36)
  const thirtySixMonthsAgoIso = thirtySixMonthsAgo.toISOString()

  // (1) Revoked users: 30 days after a user revoked access (invalid_grant on
  //     refresh → youtube_revoked_at stamped), purge all their YouTube-derived
  //     data. The account row is kept (tokens are already null); only derived
  //     data is deleted. Idempotent — re-runs delete nothing once purged.
  let purgedRevokedUsers = 0
  const { data: revokedUsers, error: revokedErr } = await supabase
    .from('users')
    .select('id')
    .not('youtube_revoked_at', 'is', null)
    .lt('youtube_revoked_at', thirtyDaysAgoIso)

  if (revokedErr) {
    void logError({
      route: 'api/cron/cache-cleanup',
      error: 'Failed to query revoked users for data purge',
      details: { supabaseError: revokedErr.message },
      severity: 'error',
    })
  }

  for (const u of revokedUsers ?? []) {
    const uid = u.id as string
    try {
      const { data: compRows } = await supabase
        .from('competitors')
        .select('id')
        .eq('user_id', uid)
      const compIds = (compRows ?? []).map((c) => c.id)
      if (compIds.length > 0) {
        await supabase.from('competitor_videos').delete().in('competitor_id', compIds)
        await supabase.from('competitor_snapshots').delete().in('competitor_id', compIds)
      }
      await supabase.from('competitors').delete().eq('user_id', uid)
      await supabase.from('channel_snapshots').delete().eq('user_id', uid)
      await supabase.from('videos').delete().eq('user_id', uid)
      await supabase.from('gap_scores').delete().eq('user_id', uid)
      await supabase.from('digests').delete().eq('user_id', uid)
      await supabase.from('trends').delete().eq('user_id', uid)
      purgedRevokedUsers++
    } catch (err) {
      void logError({
        userId: uid,
        route: 'api/cron/cache-cleanup',
        error: 'Failed to purge revoked user YouTube-derived data',
        details: { supabaseError: err instanceof Error ? err.message : String(err) },
        severity: 'error',
      })
    }
  }

  // (2) Inactive users: 90+ days since last active → null tokens so background
  //     sync stops. Account + data are kept; the user re-consents on return.
  //     Rows with a null last_active_at (never recorded) are intentionally not
  //     matched, so this never fires on users we simply have no signal for.
  const { count: deactivatedTokens, error: inactiveErr } = await supabase
    .from('users')
    .update(
      {
        youtube_access_token: null,
        youtube_refresh_token: null,
        token_expires_at: null,
        updated_at: new Date().toISOString(),
      },
      { count: 'exact' },
    )
    .not('last_active_at', 'is', null)
    .lt('last_active_at', ninetyDaysAgoIso)
    .not('youtube_access_token', 'is', null)

  if (inactiveErr) {
    void logError({
      route: 'api/cron/cache-cleanup',
      error: 'Failed to null tokens for inactive users',
      details: { supabaseError: inactiveErr.message },
      severity: 'error',
    })
  }

  // (3) Stale competitor metadata safety net: refresh crons re-sync active
  //     competitors well within 30 days (synced_at is refreshed on each upsert),
  //     so anything older than 30 days is orphaned/stale — delete it.
  const { count: deletedStaleVideos, error: staleVidErr } = await supabase
    .from('competitor_videos')
    .delete({ count: 'exact' })
    .lt('synced_at', thirtyDaysAgoIso)

  if (staleVidErr) {
    void logError({
      route: 'api/cron/cache-cleanup',
      error: 'Failed to delete stale competitor_videos rows',
      details: { supabaseError: staleVidErr.message },
      severity: 'error',
    })
  }

  // (4) Statistical snapshots retained up to 36 months, then deleted.
  const { count: deletedOldCompSnapshots } = await supabase
    .from('competitor_snapshots')
    .delete({ count: 'exact' })
    .lt('created_at', thirtySixMonthsAgoIso)

  const { count: deletedOldChannelSnapshots } = await supabase
    .from('channel_snapshots')
    .delete({ count: 'exact' })
    .lt('created_at', thirtySixMonthsAgoIso)

  // ── Monday-only: wipe competitor insights cache + enable ideas refresh ────
  // Runs only on Mondays so users get fresh competitor-data-driven insights
  // and the Generate Ideas button re-enables once per week.
  let insightsWiped = 0
  let usersEnabled = 0

  if (new Date().getUTCDay() === 1) {
    console.log('[cron/cache-cleanup] Monday detected — running weekly insights cache clear')

    // Count how many competitors currently have cached insights
    const { count: cachedCount } = await supabase
      .from('competitors')
      .select('*', { count: 'exact', head: true })
      .not('insights', 'is', null)

    console.log(`[cron/cache-cleanup] Found ${cachedCount ?? 0} competitors with cached insights`)

    // Wipe insights for ALL competitors across ALL users — forces fresh
    // generation on next user visit to the AI Insights tab or Ideas page
    const { error: wipeError } = await supabase
      .from('competitors')
      .update({ insights: null, insights_generated_at: null })
      .not('id', 'is', null)

    if (wipeError) {
      console.error('[cron/cache-cleanup] Failed to wipe insights:', wipeError.message)
      void logError({
        route: 'api/cron/cache-cleanup',
        error: 'Monday: failed to wipe competitor insights cache',
        details: { supabaseError: wipeError.message },
        severity: 'error',
      })
    } else {
      insightsWiped = cachedCount ?? 0
      console.log(`[cron/cache-cleanup] Wiped insights for ${insightsWiped} competitors`)
    }

    // Enable the Generate Ideas button for all users with an existing settings row
    const { count: flaggedCount, error: flagError } = await supabase
      .from('user_settings')
      .update({ ideas_refresh_available: true }, { count: 'exact' })
      .not('user_id', 'is', null)

    if (flagError) {
      console.error('[cron/cache-cleanup] Failed to set ideas_refresh_available:', flagError.message)
      void logError({
        route: 'api/cron/cache-cleanup',
        error: 'Monday: failed to set ideas_refresh_available on user_settings',
        details: { supabaseError: flagError.message },
        severity: 'error',
      })
    } else {
      usersEnabled = flaggedCount ?? 0
      console.log(`[cron/cache-cleanup] Enabled ideas refresh for ${usersEnabled} users`)
    }

    // Create user_settings rows for any users who don't have one yet,
    // with ideas_refresh_available = true so they can generate immediately
    const { data: usersWithoutSettings } = await supabase
      .from('users')
      .select('id')
      .not('id', 'in', supabase.from('user_settings').select('user_id'))

    if (usersWithoutSettings && usersWithoutSettings.length > 0) {
      const newRows = usersWithoutSettings.map((u) => ({
        user_id: u.id,
        ideas_refresh_available: true,
        weekly_digest_enabled: true,
        alerts_enabled: true,
        alert_threshold_multiplier: 3.0,
      }))

      const { error: insertError } = await supabase
        .from('user_settings')
        .insert(newRows)

      if (insertError) {
        console.error('[cron/cache-cleanup] Failed to create missing user_settings rows:', insertError.message)
        void logError({
          route: 'api/cron/cache-cleanup',
          error: 'Monday: failed to insert user_settings rows for new users',
          details: { supabaseError: insertError.message, rowCount: newRows.length },
          severity: 'error',
        })
      } else {
        console.log(`[cron/cache-cleanup] Created user_settings for ${newRows.length} users without settings`)
        usersEnabled += newRows.length
      }
    }

    console.log('[cron/cache-cleanup] Weekly insights cache clear complete')
  }

  return NextResponse.json({
    deleted_cache_rows: deletedCache ?? 0,
    deleted_history_rows: deletedHistory ?? 0,
    deleted_competitor_rows: deletedCompetitors ?? 0,
    deleted_thumbnail_jobs: deletedJobs ?? 0,
    reaped_stuck_jobs: reapedJobs ?? 0,
    deleted_thumbnails: deletedThumbnails,
    purged_revoked_users: purgedRevokedUsers,
    deactivated_inactive_tokens: deactivatedTokens ?? 0,
    deleted_stale_competitor_videos: deletedStaleVideos ?? 0,
    deleted_old_competitor_snapshots: deletedOldCompSnapshots ?? 0,
    deleted_old_channel_snapshots: deletedOldChannelSnapshots ?? 0,
    ...(new Date().getUTCDay() === 1 && {
      insights_wiped: insightsWiped,
      users_ideas_enabled: usersEnabled,
    }),
  })
}
