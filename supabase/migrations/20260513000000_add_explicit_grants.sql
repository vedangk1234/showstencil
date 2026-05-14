-- ============================================================
-- Explicit table grants for Supabase Data API
--
-- From October 30 2026, Supabase requires explicit grants on
-- all tables for supabase-js to access them via the Data API.
-- This migration adds the necessary grants for every table
-- in the public schema so we never have to revisit this.
--
-- Grant logic:
--   authenticated  — users making requests via the anon/user JWT
--   service_role   — server-side API routes and crons
--   anon           — only searched_channels_cache (RLS policy
--                    already allows USING (true) for that table)
--
-- RLS note: all tables had RLS enabled in earlier migrations
-- EXCEPT ideas (created via scripts/create-ideas-table.ts) and
-- thumbnail_jobs (no migration file existed). Both are fixed here.
-- ============================================================

-- ── Ensure RLS is on for tables not covered by earlier migrations ──

ALTER TABLE public.ideas           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.thumbnail_jobs  ENABLE ROW LEVEL SECURITY;

-- All other tables already have RLS from prior migrations:
--   001: users, channel_snapshots, videos, competitors,
--        competitor_videos, gap_scores, digests, trends, user_settings
--   002: dominator_history, user_search_history, searched_channels_cache
--   003: competitor_insights
--   004: competitor_snapshots
-- Repeated here as IF NOT ALREADY to be safe:

ALTER TABLE public.users                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.channel_snapshots      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.videos                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.competitors            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.competitor_videos      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gap_scores             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.digests                ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trends                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_settings          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dominator_history      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_search_history    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.searched_channels_cache ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.competitor_insights    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.competitor_snapshots   ENABLE ROW LEVEL SECURITY;

-- ── Grants ────────────────────────────────────────────────────────

-- users
GRANT SELECT, INSERT, UPDATE, DELETE ON public.users TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.users TO service_role;

-- channel_snapshots
GRANT SELECT, INSERT, UPDATE, DELETE ON public.channel_snapshots TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.channel_snapshots TO service_role;

-- videos
GRANT SELECT, INSERT, UPDATE, DELETE ON public.videos TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.videos TO service_role;

-- competitors
GRANT SELECT, INSERT, UPDATE, DELETE ON public.competitors TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.competitors TO service_role;

-- competitor_videos
GRANT SELECT, INSERT, UPDATE, DELETE ON public.competitor_videos TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.competitor_videos TO service_role;

-- gap_scores
GRANT SELECT, INSERT, UPDATE, DELETE ON public.gap_scores TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.gap_scores TO service_role;

-- digests
GRANT SELECT, INSERT, UPDATE, DELETE ON public.digests TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.digests TO service_role;

-- trends
GRANT SELECT, INSERT, UPDATE, DELETE ON public.trends TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.trends TO service_role;

-- user_settings
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_settings TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_settings TO service_role;

-- dominator_history
GRANT SELECT, INSERT, UPDATE, DELETE ON public.dominator_history TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.dominator_history TO service_role;

-- user_search_history
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_search_history TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_search_history TO service_role;

-- searched_channels_cache
-- Existing RLS policy: "Anyone can read cache" (USING (true))
-- anon SELECT added to match that intent for unauthenticated reads
GRANT SELECT, INSERT, UPDATE, DELETE ON public.searched_channels_cache TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.searched_channels_cache TO service_role;
GRANT SELECT                         ON public.searched_channels_cache TO anon;

-- competitor_insights
GRANT SELECT, INSERT, UPDATE, DELETE ON public.competitor_insights TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.competitor_insights TO service_role;

-- competitor_snapshots
GRANT SELECT, INSERT, UPDATE, DELETE ON public.competitor_snapshots TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.competitor_snapshots TO service_role;

-- ideas
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ideas TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ideas TO service_role;

-- thumbnail_jobs
GRANT SELECT, INSERT, UPDATE, DELETE ON public.thumbnail_jobs TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.thumbnail_jobs TO service_role;

-- ── error_logs ────────────────────────────────────────────────────────────────
-- Permanent server-side error log. Users must never read other users' errors,
-- so no authenticated grant is issued. service_role reads for monitoring/alerts.

CREATE TABLE IF NOT EXISTS public.error_logs (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at    TIMESTAMPTZ NOT NULL    DEFAULT NOW(),
  user_id       UUID        REFERENCES public.users(id) ON DELETE SET NULL,
  route         TEXT        NOT NULL,
  error_message TEXT        NOT NULL,
  error_details JSONB,
  severity      TEXT        NOT NULL    DEFAULT 'error'
);

ALTER TABLE public.error_logs ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT ON public.error_logs TO service_role;
