import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'

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

  return NextResponse.json({
    deleted_cache_rows: deletedCache ?? 0,
    deleted_history_rows: deletedHistory ?? 0,
    deleted_competitor_rows: deletedCompetitors ?? 0,
  })
}
