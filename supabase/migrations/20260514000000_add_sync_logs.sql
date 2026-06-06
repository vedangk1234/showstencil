CREATE TABLE IF NOT EXISTS public.sync_logs (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at   TIMESTAMPTZ NOT NULL    DEFAULT NOW(),
  user_id      UUID        REFERENCES public.users(id) ON DELETE SET NULL,
  email        TEXT,
  route        TEXT        NOT NULL    DEFAULT '/api/sync',
  status       INTEGER     NOT NULL,
  message      TEXT,
  duration_ms  INTEGER,
  ip           TEXT,
  country      TEXT,
  city         TEXT,
  user_agent   TEXT,
  channel_id   TEXT,
  videos_synced INTEGER
);

ALTER TABLE public.sync_logs ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT ON public.sync_logs TO service_role;
