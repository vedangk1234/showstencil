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

  return NextResponse.json({
    deleted_cache_rows: deletedCache ?? 0,
    deleted_history_rows: deletedHistory ?? 0,
    deleted_competitor_rows: deletedCompetitors ?? 0,
    deleted_thumbnail_jobs: deletedJobs ?? 0,
    deleted_thumbnails: deletedThumbnails,
  })
}
