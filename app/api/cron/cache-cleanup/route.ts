import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { deleteThumbnailFromStorage } from '@/lib/thumbnail-storage'

// Runs daily at 2 AM UTC — purges expired searched_channels_cache rows
export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createServiceClient()

  // Delete cache rows past their expiry
  const { count: deletedCache, error: cacheErr } = await supabase
    .from('searched_channels_cache')
    .delete({ count: 'exact' })
    .lt('expires_at', new Date().toISOString())

  if (cacheErr) {
    console.error('[cron/cache-cleanup] Cache delete error:', cacheErr)
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
    deleted_thumbnails: deletedThumbnails,
    ...(new Date().getUTCDay() === 1 && {
      insights_wiped: insightsWiped,
      users_ideas_enabled: usersEnabled,
    }),
  })
}
