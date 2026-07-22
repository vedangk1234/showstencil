/**
 * lib/db-videos.ts
 * Single source of truth for writing competitor_videos rows.
 *
 * All competitor-video writes upsert on the (competitor_id, youtube_video_id)
 * unique constraint (competitor_videos_unique, codified in migration
 * 20260721000000_codify_constraints.sql). Keeping one implementation avoids the
 * class of bug where individual call sites drift onto a wrong/unbacked onConflict
 * target (e.g. the old single-column 'youtube_video_id') and silently no-op.
 *
 * The upsert error is never swallowed: on failure it is logged via logError and
 * surfaced to the caller through the returned { ok, error } tuple.
 */

import { createServiceClient } from '@/lib/supabase'
import { logError } from '@/lib/logger'

export type CompetitorVideoUpsertRow = Record<string, unknown> & {
  competitor_id: string
  youtube_video_id: string
}

export interface UpsertCompetitorVideosContext {
  /** Route/module identifier for error logging, e.g. 'api/cron/refresh-data'. */
  route: string
  /** Owning user id, when known (route handlers). Omit in cron contexts. */
  userId?: string
}

/**
 * Upsert competitor_videos rows on (competitor_id, youtube_video_id).
 * Returns { ok: true } for an empty input (nothing to write).
 * On DB error, logs via logError and returns { ok: false, error }.
 */
export async function upsertCompetitorVideos(
  competitorId: string,
  rows: CompetitorVideoUpsertRow[],
  ctx: UpsertCompetitorVideosContext,
): Promise<{ ok: boolean; error: string | null }> {
  if (rows.length === 0) return { ok: true, error: null }

  const supabase = createServiceClient()
  const { error } = await supabase
    .from('competitor_videos')
    .upsert(rows, { onConflict: 'competitor_id,youtube_video_id' })

  if (error) {
    console.error(`[db-videos] competitor_videos upsert error for ${competitorId}:`, error.message)
    void logError({
      userId: ctx.userId,
      route: ctx.route,
      error: `competitor_videos upsert failed: ${error.message}`,
      details: {
        competitor_id: competitorId,
        supabase_code: error.code ?? null,
        row_count: rows.length,
      },
      severity: 'error',
    })
    return { ok: false, error: error.message }
  }

  return { ok: true, error: null }
}
