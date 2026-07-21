-- PR-1 — Schema truth: codify manually-created UNIQUE constraints in migration history.
--
-- Context: several constraints were added by hand in the Supabase console and never
-- recorded as migrations, so a fresh DB rebuilt from migrations would not match prod
-- and app upserts that rely on them would fail (42P10). This migration records the
-- constraints the code depends on. It is fully idempotent — every ADD is guarded by a
-- catalog check on the exact column set, so re-running (or running against a DB that
-- already has the constraint) is a no-op.
--
-- Verified against prod on 2026-07-21:
--   * competitor_videos already has UNIQUE (competitor_id, youtube_video_id)
--     (constraint name: competitor_videos_unique) — the block below is a no-op there,
--     kept so a from-scratch rebuild still gets it.
--   * competitors had NO unique on (user_id, youtube_channel_id) — added here.
--     Required by app/api/cron/dominator-refresh upsert onConflict=user_id,youtube_channel_id.
--   * channel_snapshots had NO unique on (user_id, snapshot_date) — added here.
--     Lets saveChannelSnapshot use a single upsert instead of read+delete+insert (PR-2).
--   * competitor_insights table no longer exists — nothing to do (RLS step N/A).
--   * Duplicate-check queries for both new constraints returned zero rows before this ran.

-- 1. competitor_videos: UNIQUE (competitor_id, youtube_video_id)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint c
    WHERE c.conrelid = 'public.competitor_videos'::regclass
      AND c.contype  = 'u'
      AND (
        SELECT array_agg(a.attname ORDER BY a.attname)
        FROM unnest(c.conkey) AS k(attnum)
        JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = k.attnum
      ) = ARRAY['competitor_id','youtube_video_id']::name[]
  ) THEN
    ALTER TABLE public.competitor_videos
      ADD CONSTRAINT competitor_videos_competitor_video_unique
      UNIQUE (competitor_id, youtube_video_id);
  END IF;
END $$;

-- 2. competitors: UNIQUE (user_id, youtube_channel_id)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint c
    WHERE c.conrelid = 'public.competitors'::regclass
      AND c.contype  = 'u'
      AND (
        SELECT array_agg(a.attname ORDER BY a.attname)
        FROM unnest(c.conkey) AS k(attnum)
        JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = k.attnum
      ) = ARRAY['user_id','youtube_channel_id']::name[]
  ) THEN
    ALTER TABLE public.competitors
      ADD CONSTRAINT competitors_user_channel_unique
      UNIQUE (user_id, youtube_channel_id);
  END IF;
END $$;

-- 3. channel_snapshots: UNIQUE (user_id, snapshot_date)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint c
    WHERE c.conrelid = 'public.channel_snapshots'::regclass
      AND c.contype  = 'u'
      AND (
        SELECT array_agg(a.attname ORDER BY a.attname)
        FROM unnest(c.conkey) AS k(attnum)
        JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = k.attnum
      ) = ARRAY['snapshot_date','user_id']::name[]
  ) THEN
    ALTER TABLE public.channel_snapshots
      ADD CONSTRAINT channel_snapshots_user_date_unique
      UNIQUE (user_id, snapshot_date);
  END IF;
END $$;
