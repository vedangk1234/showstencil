-- PR-7 — Concurrency + cost controls: atomic thumbnail quota + DB-backed rate limiter.
-- Idempotent (CREATE OR REPLACE / IF NOT EXISTS). Safe to re-run.

-- ===========================================================================
-- 1. Atomic thumbnail quota
-- ===========================================================================
-- Replaces the read-modify-write in lib/access.ts (two concurrent generations
-- could both read used=5 and both write 6 → a free generation). reserve_* does the
-- monthly reset AND the under-limit increment atomically in one transaction, and
-- returns whether the reservation succeeded. release_* refunds on generation failure
-- so a failed generation never permanently consumes quota.

CREATE OR REPLACE FUNCTION public.reserve_thumbnail_quota(
  p_user_id uuid,
  p_limit int,
  p_reset_days int DEFAULT 30
)
RETURNS TABLE (allowed boolean, quota_used int, quota_reset_at timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_used  int;
  v_reset timestamptz;
BEGIN
  -- Atomic monthly reset when the window has elapsed (or was never set).
  UPDATE public.users
     SET thumbnails_generated_this_month = 0,
         thumbnails_quota_reset_at = now() + make_interval(days => p_reset_days)
   WHERE id = p_user_id
     AND (thumbnails_quota_reset_at IS NULL OR thumbnails_quota_reset_at < now());

  -- Atomic reserve: increment only while strictly under the limit.
  UPDATE public.users
     SET thumbnails_generated_this_month = COALESCE(thumbnails_generated_this_month, 0) + 1
   WHERE id = p_user_id
     AND COALESCE(thumbnails_generated_this_month, 0) < p_limit
  RETURNING thumbnails_generated_this_month, thumbnails_quota_reset_at
       INTO v_used, v_reset;

  IF v_used IS NULL THEN
    -- No row updated → at/over limit (or user missing). Report current state.
    SELECT COALESCE(thumbnails_generated_this_month, 0), thumbnails_quota_reset_at
      INTO v_used, v_reset
      FROM public.users
     WHERE id = p_user_id;
    RETURN QUERY SELECT false, COALESCE(v_used, 0), v_reset;
  ELSE
    RETURN QUERY SELECT true, v_used, v_reset;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.release_thumbnail_quota(p_user_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.users
     SET thumbnails_generated_this_month = GREATEST(COALESCE(thumbnails_generated_this_month, 0) - 1, 0)
   WHERE id = p_user_id;
$$;

GRANT EXECUTE ON FUNCTION public.reserve_thumbnail_quota(uuid, int, int) TO service_role;
GRANT EXECUTE ON FUNCTION public.release_thumbnail_quota(uuid) TO service_role;

-- ===========================================================================
-- 2. DB-backed fixed-window rate limiter
-- ===========================================================================
-- Per (user, endpoint) minute + day fixed-window counters. check_rate_limit does
-- the count-and-test atomically and returns whether the request is within BOTH
-- limits. Fixed windows keyed on date_trunc — a new window resets the count to 1.

CREATE TABLE IF NOT EXISTS public.rate_limits (
  user_id      uuid        NOT NULL,
  endpoint     text        NOT NULL,
  window_kind  text        NOT NULL,          -- 'minute' | 'day'
  window_start timestamptz NOT NULL,
  count        int         NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, endpoint, window_kind)
);

ALTER TABLE public.rate_limits ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.rate_limits TO service_role;

CREATE OR REPLACE FUNCTION public.check_rate_limit(
  p_user_id  uuid,
  p_endpoint text,
  p_per_min  int,
  p_per_day  int
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_now       timestamptz := now();
  v_min_start timestamptz := date_trunc('minute', v_now);
  v_day_start timestamptz := date_trunc('day', v_now);
  v_min_count int;
  v_day_count int;
BEGIN
  INSERT INTO public.rate_limits (user_id, endpoint, window_kind, window_start, count)
       VALUES (p_user_id, p_endpoint, 'minute', v_min_start, 1)
  ON CONFLICT (user_id, endpoint, window_kind) DO UPDATE
       SET count = CASE WHEN public.rate_limits.window_start = v_min_start
                        THEN public.rate_limits.count + 1 ELSE 1 END,
           window_start = v_min_start
  RETURNING count INTO v_min_count;

  INSERT INTO public.rate_limits (user_id, endpoint, window_kind, window_start, count)
       VALUES (p_user_id, p_endpoint, 'day', v_day_start, 1)
  ON CONFLICT (user_id, endpoint, window_kind) DO UPDATE
       SET count = CASE WHEN public.rate_limits.window_start = v_day_start
                        THEN public.rate_limits.count + 1 ELSE 1 END,
           window_start = v_day_start
  RETURNING count INTO v_day_count;

  RETURN v_min_count <= p_per_min AND v_day_count <= p_per_day;
END;
$$;

GRANT EXECUTE ON FUNCTION public.check_rate_limit(uuid, text, int, int) TO service_role;
