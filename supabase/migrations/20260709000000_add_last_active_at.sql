-- Adds last_active_at to track when a user last actively used the app.
-- Used to (1) restrict background YouTube sync to active users and
-- (2) revoke + delete auth tokens for users dormant > 30 days.
-- Compliance: YouTube API Services Terms III.E.4(a-g).
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS last_active_at TIMESTAMPTZ;
