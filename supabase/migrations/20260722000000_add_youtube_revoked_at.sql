-- Adds youtube_revoked_at to users. Set when a token refresh fails with
-- `invalid_grant` (the user revoked ShowStencil's access via their Google
-- account, or the grant otherwise expired). Used to:
--   (1) stop further sync attempts for that user (tokens are also nulled), and
--   (2) schedule deletion of that user's YouTube-derived data within 30 days
--       (purged by the daily cache-cleanup cron).
-- Compliance: YouTube API Services Terms III.E.4(a-g) — token & data lifecycle.
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS youtube_revoked_at TIMESTAMPTZ;
