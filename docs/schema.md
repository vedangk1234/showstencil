# ShowStencil — Database Schema

> Extracted from CLAUDE.md (PR-9). Source of truth for table shapes; keep in sync with supabase/migrations/.

## Database Schema (Supabase / PostgreSQL)

```sql
-- Users table (extends NextAuth)
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen\_random\_uuid(),
  email TEXT UNIQUE NOT NULL,
  name TEXT,
  image TEXT,
  youtube\_channel\_id TEXT,
  youtube\_access\_token TEXT,
  youtube\_refresh\_token TEXT,
  token\_expires\_at TIMESTAMPTZ,
  niche\_id TEXT,
  niche\_detected\_at TIMESTAMPTZ,
  niche\_description TEXT,                  -- user-supplied description (manual picker / "Other")
  sub\_niche TEXT,                          -- granular sub-niche detected by Claude
  sub\_niche\_keywords JSONB,               -- array of keyword strings
  sub\_niche\_confidence FLOAT,
  sub\_niche\_detected\_at TIMESTAMPTZ,
  subscription\_status TEXT DEFAULT 'free',
  subscription\_plan TEXT DEFAULT 'free',   -- 'free' | 'starter' | 'pro'
  lemon\_squeezy\_customer\_id TEXT,         -- replaces stripe_customer_id
  lemon\_squeezy\_subscription\_id TEXT,     -- replaces stripe_subscription_id
  current\_period\_end TIMESTAMPTZ,
  trial\_ends\_at TIMESTAMPTZ,
  onboarding\_completed BOOLEAN DEFAULT false,
  last\_active\_at TIMESTAMPTZ,                -- last time user actively used the app; gates active-only sync + token retention (YouTube ToS III.E.4)
  created\_at TIMESTAMPTZ DEFAULT NOW(),
  updated\_at TIMESTAMPTZ DEFAULT NOW()
);

-- Channel snapshots (user's own data, stored daily)
CREATE TABLE channel\_snapshots (
  id UUID PRIMARY KEY DEFAULT gen\_random\_uuid(),
  user\_id UUID REFERENCES users(id) ON DELETE CASCADE,
  snapshot\_date DATE NOT NULL,
  subscriber\_count INTEGER,
  total\_views BIGINT,
  videos\_count INTEGER,
  avg\_views\_per\_video FLOAT,
  avg\_ctr FLOAT,
  avg\_view\_duration\_seconds INTEGER,
  avg\_like\_ratio FLOAT,
  estimated\_monthly\_revenue FLOAT,
  rpm FLOAT,
  momentum\_score INTEGER,
  age\_gender\_breakdown JSONB,   -- [{ageGroup, gender, viewerPercentage}] from YouTube Analytics (Day 42)
  top\_countries JSONB,           -- [{country, views}] top 10 countries (Day 42)
  traffic\_sources JSONB,         -- [{source, views, watchTimeMinutes, percentage}] (Day 42)
  created\_at TIMESTAMPTZ DEFAULT NOW()
);

-- Videos (user's own videos with full analytics)
CREATE TABLE videos (
  id UUID PRIMARY KEY DEFAULT gen\_random\_uuid(),
  user\_id UUID REFERENCES users(id) ON DELETE CASCADE,
  youtube\_video\_id TEXT NOT NULL,
  title TEXT,
  published\_at TIMESTAMPTZ,
  duration\_seconds INTEGER,
  view\_count INTEGER,
  like\_count INTEGER,
  comment\_count INTEGER,
  share\_count INTEGER,
  save\_count INTEGER,
  ctr FLOAT,
  avg\_view\_duration\_seconds INTEGER,
  retention\_percentage FLOAT,
  impressions INTEGER,
  traffic\_source\_search FLOAT,
  traffic\_source\_suggested FLOAT,
  traffic\_source\_browse FLOAT,
  traffic\_source\_external FLOAT,
  subscriber\_gain INTEGER,
  revenue\_estimate FLOAT,
  rpm FLOAT,
  thumbnail\_url TEXT,
  performance\_score INTEGER,
  synced\_at TIMESTAMPTZ DEFAULT NOW()
);

-- Competitors (channels we track for each user)
CREATE TABLE competitors (
  id UUID PRIMARY KEY DEFAULT gen\_random\_uuid(),
  user\_id UUID REFERENCES users(id) ON DELETE CASCADE,
  youtube\_channel\_id TEXT NOT NULL,
  channel\_name TEXT,
  channel\_thumbnail TEXT,
  subscriber\_count INTEGER,
  total\_views BIGINT,
  tier INTEGER,                    -- 1 = Tier1, 2 = Tier2, 3 = Dominator
  is\_auto\_detected BOOLEAN DEFAULT true,
  is\_active BOOLEAN DEFAULT true,
  is\_dominator BOOLEAN DEFAULT false,   -- true = Tier 3 dominator (>10x user subs)
  is\_searched BOOLEAN DEFAULT false,    -- true = manually searched and added by user
  searched\_at TIMESTAMPTZ,
  sub\_niche TEXT,
  sub\_niche\_keywords JSONB,
  sub\_niche\_match\_score FLOAT,
  last\_synced\_at TIMESTAMPTZ,
  created\_at TIMESTAMPTZ DEFAULT NOW()
);

-- Competitor videos (public data only)
CREATE TABLE competitor\_videos (
  id UUID PRIMARY KEY DEFAULT gen\_random\_uuid(),
  competitor\_id UUID REFERENCES competitors(id) ON DELETE CASCADE,
  youtube\_video\_id TEXT NOT NULL,
  title TEXT,
  published\_at TIMESTAMPTZ,
  view\_count INTEGER,
  like\_count INTEGER,
  comment\_count INTEGER,
  duration\_seconds INTEGER,
  thumbnail\_url TEXT,
  velocity\_score FLOAT,    -- views per hour in first 48hrs
  performance\_vs\_avg FLOAT, -- ratio vs that channel's average
  is\_viral BOOLEAN DEFAULT false,
  synced\_at TIMESTAMPTZ DEFAULT NOW()
);

-- Gap scores (calculated weekly)
CREATE TABLE gap\_scores (
  id UUID PRIMARY KEY DEFAULT gen\_random\_uuid(),
  user\_id UUID REFERENCES users(id) ON DELETE CASCADE,
  calculated\_at TIMESTAMPTZ DEFAULT NOW(),
  overall\_score INTEGER,           -- 0-100, higher = bigger gap = more opportunity
  views\_gap\_score INTEGER,
  ctr\_gap\_score INTEGER,
  upload\_frequency\_gap\_score INTEGER,
  watch\_time\_gap\_score INTEGER,
  topic\_coverage\_gap\_score INTEGER,
  estimated\_revenue\_gap FLOAT,     -- monthly dollars left on table
  primary\_bottleneck TEXT          -- which gap costs the most money
);

-- Digests (Claude-generated weekly reports)
CREATE TABLE digests (
  id UUID PRIMARY KEY DEFAULT gen\_random\_uuid(),
  user\_id UUID REFERENCES users(id) ON DELETE CASCADE,
  week\_start\_date DATE NOT NULL,
  content TEXT NOT NULL,           -- full Claude-generated text
  video\_ideas JSONB,               -- array of 3 idea objects
  key\_metrics JSONB,               -- snapshot of metrics at time of generation
  email\_sent\_at TIMESTAMPTZ,
  opened\_at TIMESTAMPTZ,
  created\_at TIMESTAMPTZ DEFAULT NOW()
);

-- Trends (viral videos detected in niche)
CREATE TABLE trends (
  id UUID PRIMARY KEY DEFAULT gen\_random\_uuid(),
  user\_id UUID REFERENCES users(id) ON DELETE CASCADE,
  competitor\_id UUID REFERENCES competitors(id),
  youtube\_video\_id TEXT,
  title TEXT,
  channel\_name TEXT,
  view\_count INTEGER,
  velocity\_score FLOAT,
  detected\_at TIMESTAMPTZ DEFAULT NOW(),
  alert\_sent BOOLEAN DEFAULT false
);

-- User settings
CREATE TABLE user\_settings (
  user\_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  weekly\_digest\_enabled BOOLEAN DEFAULT true,
  alerts\_enabled BOOLEAN DEFAULT true,
  alert\_threshold\_multiplier FLOAT DEFAULT 3.0,
  last\_alert\_sent\_at TIMESTAMPTZ,
  alerted\_video\_ids TEXT[] DEFAULT '{}',
  unsubscribe\_token TEXT,              -- UUID token for one-click email unsubscribe
  digest\_day TEXT DEFAULT 'monday',
  timezone TEXT DEFAULT 'America/New\_York',
  ideas\_refresh\_available BOOLEAN DEFAULT true, -- set false after generation, true every Monday by cache-cleanup cron
  updated\_at TIMESTAMPTZ DEFAULT NOW()
);

-- Dominator history (tracks which dominators have been assigned per user over time)
CREATE TABLE dominator\_history (
  id UUID PRIMARY KEY DEFAULT gen\_random\_uuid(),
  user\_id UUID REFERENCES users(id) ON DELETE CASCADE,
  channel\_id TEXT NOT NULL,
  channel\_name TEXT,
  detected\_at TIMESTAMPTZ DEFAULT NOW(),
  is\_current BOOLEAN DEFAULT true,
  replaced\_at TIMESTAMPTZ
);

-- User search history (enforces Starter plan monthly search limit)
CREATE TABLE user\_search\_history (
  id UUID PRIMARY KEY DEFAULT gen\_random\_uuid(),
  user\_id UUID REFERENCES users(id) ON DELETE CASCADE,
  channel\_id TEXT NOT NULL,
  searched\_at TIMESTAMPTZ DEFAULT NOW(),
  added\_as\_competitor BOOLEAN DEFAULT false
);

-- Cache for searched channels (avoid repeat YouTube API calls, TTL 7 days)
CREATE TABLE searched\_channels\_cache (
  channel\_id TEXT PRIMARY KEY,
  channel\_name TEXT,
  channel\_data JSONB,
  niche\_id TEXT,
  sub\_niche TEXT,
  sub\_niche\_keywords JSONB,
  cached\_at TIMESTAMPTZ DEFAULT NOW(),
  expires\_at TIMESTAMPTZ DEFAULT NOW() + INTERVAL '7 days',
  search\_count INTEGER DEFAULT 1
);

-- competitor_snapshots — daily historical data per competitor (migration 004)
CREATE TABLE IF NOT EXISTS competitor\_snapshots (
  id UUID PRIMARY KEY DEFAULT gen\_random\_uuid(),
  competitor\_id UUID NOT NULL REFERENCES competitors(id) ON DELETE CASCADE,
  snapshot\_date DATE NOT NULL,
  subscriber\_count INTEGER,
  total\_views BIGINT,
  video\_count INTEGER,
  avg\_views\_per\_video FLOAT,
  avg\_video\_length\_seconds INTEGER,
  upload\_frequency\_30d FLOAT,
  velocity\_score\_avg FLOAT,
  created\_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(competitor\_id, snapshot\_date)
);

-- New columns on competitors table (migration 004)
-- ALTER TABLE competitors ADD COLUMN IF NOT EXISTS video\_count INTEGER;
-- ALTER TABLE competitors ADD COLUMN IF NOT EXISTS avg\_views\_per\_video FLOAT;
-- ALTER TABLE competitors ADD COLUMN IF NOT EXISTS avg\_video\_length\_seconds INTEGER;
-- ALTER TABLE competitors ADD COLUMN IF NOT EXISTS upload\_frequency\_30d FLOAT;
-- ALTER TABLE competitors ADD COLUMN IF NOT EXISTS insights JSONB;
-- ALTER TABLE competitors ADD COLUMN IF NOT EXISTS insights\_generated\_at TIMESTAMPTZ;
-- ALTER TABLE competitors ADD COLUMN IF NOT EXISTS replacement\_locked\_until TIMESTAMPTZ;

-- thumbnail_jobs — tracks async Gemini image generation jobs
CREATE TABLE IF NOT EXISTS thumbnail_jobs (
  id UUID PRIMARY KEY DEFAULT gen\_random\_uuid(),
  user\_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  idea\_id UUID NOT NULL REFERENCES ideas(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending',  -- 'pending' | 'completed' | 'failed'
  thumbnail\_url TEXT,
  error\_message TEXT,
  created\_at TIMESTAMPTZ DEFAULT NOW(),
  completed\_at TIMESTAMPTZ
);

-- error_logs — permanent server-side error log (migration 20260513)
CREATE TABLE IF NOT EXISTS public.error_logs (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at    TIMESTAMPTZ NOT NULL    DEFAULT NOW(),
  user_id       UUID        REFERENCES public.users(id) ON DELETE SET NULL,
  route         TEXT        NOT NULL,
  error_message TEXT        NOT NULL,
  error_details JSONB,
  severity      TEXT        NOT NULL    DEFAULT 'error'
);
-- RLS enabled; service_role gets INSERT + SELECT only (no authenticated grant)

-- sync_logs — every /api/sync attempt (migration 20260514)
CREATE TABLE IF NOT EXISTS public.sync_logs (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at    TIMESTAMPTZ NOT NULL    DEFAULT NOW(),
  user_id       UUID        REFERENCES public.users(id) ON DELETE SET NULL,
  email         TEXT,
  route         TEXT        NOT NULL    DEFAULT '/api/sync',
  status        INTEGER     NOT NULL,
  message       TEXT,
  duration_ms   INTEGER,
  ip            TEXT,
  country       TEXT,
  city          TEXT,
  user_agent    TEXT,
  channel_id    TEXT,
  videos_synced INTEGER
);
-- RLS enabled; service_role gets SELECT + INSERT only

-- New columns on ideas table (thumbnail + hook variants — run once):
-- ALTER TABLE ideas ADD COLUMN IF NOT EXISTS thumbnail\_image\_url TEXT;
-- ALTER TABLE ideas ADD COLUMN IF NOT EXISTS thumbnail\_generated\_at TIMESTAMPTZ;
-- ALTER TABLE ideas ADD COLUMN IF NOT EXISTS thumbnail\_source\_type TEXT; -- 'camera'|'upload'|'google\_profile'|'no\_photo'
-- ALTER TABLE ideas ADD COLUMN IF NOT EXISTS hook\_2 TEXT;
-- ALTER TABLE ideas ADD COLUMN IF NOT EXISTS hook\_3 TEXT;
-- New columns on users table (thumbnail quota tracking):
-- ALTER TABLE users ADD COLUMN IF NOT EXISTS thumbnails\_generated\_this\_month INTEGER DEFAULT 0;
-- ALTER TABLE users ADD COLUMN IF NOT EXISTS thumbnails\_quota\_reset\_at TIMESTAMPTZ;

-- last_active_at on users (migration 20260709 — YouTube ToS III.E.4 active-user token lifecycle):
-- File: supabase/migrations/20260709000000_add_last_active_at.sql
-- ALTER TABLE users ADD COLUMN IF NOT EXISTS last\_active\_at TIMESTAMPTZ;

-- Required migrations (run once in Supabase SQL editor):
-- File: supabase/migrations/002_competitors_phase1.sql
-- ALTER TABLE users ADD COLUMN IF NOT EXISTS sub_niche TEXT;
-- ALTER TABLE users ADD COLUMN IF NOT EXISTS sub_niche_keywords JSONB;
-- ALTER TABLE users ADD COLUMN IF NOT EXISTS sub_niche_confidence FLOAT;
-- ALTER TABLE users ADD COLUMN IF NOT EXISTS sub_niche_detected_at TIMESTAMPTZ;
-- ALTER TABLE users ADD COLUMN IF NOT EXISTS subscription_plan TEXT DEFAULT 'free';
-- ALTER TABLE users ADD COLUMN IF NOT EXISTS lemon_squeezy_customer_id TEXT;
-- ALTER TABLE users ADD COLUMN IF NOT EXISTS lemon_squeezy_subscription_id TEXT;
-- ALTER TABLE users ADD COLUMN IF NOT EXISTS current_period_end TIMESTAMPTZ;
-- ALTER TABLE competitors ADD COLUMN IF NOT EXISTS sub_niche TEXT;
-- ALTER TABLE competitors ADD COLUMN IF NOT EXISTS sub_niche_keywords JSONB;
-- ALTER TABLE competitors ADD COLUMN IF NOT EXISTS is_dominator BOOLEAN DEFAULT false;
-- ALTER TABLE competitors ADD COLUMN IF NOT EXISTS is_searched BOOLEAN DEFAULT false;
-- ALTER TABLE competitors ADD COLUMN IF NOT EXISTS searched_at TIMESTAMPTZ;
-- ALTER TABLE competitors ADD COLUMN IF NOT EXISTS sub_niche_match_score FLOAT;
-- ALTER TABLE user\_settings ADD COLUMN IF NOT EXISTS last\_alert\_sent\_at TIMESTAMPTZ;
-- ALTER TABLE user\_settings ADD COLUMN IF NOT EXISTS alerted\_video\_ids TEXT[] DEFAULT '{}';
-- ALTER TABLE user\_settings ADD COLUMN IF NOT EXISTS unsubscribe\_token TEXT;
```

\---

