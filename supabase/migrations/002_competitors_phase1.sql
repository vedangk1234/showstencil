-- ============================================================
-- Phase 1: Competitors System Foundation
-- ============================================================

-- Add sub-niche tracking to users table
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS sub_niche TEXT,
  ADD COLUMN IF NOT EXISTS sub_niche_keywords JSONB,
  ADD COLUMN IF NOT EXISTS sub_niche_confidence FLOAT,
  ADD COLUMN IF NOT EXISTS sub_niche_detected_at TIMESTAMP WITH TIME ZONE;

-- Add sub-niche and Dominator flag to competitors table
ALTER TABLE competitors
  ADD COLUMN IF NOT EXISTS sub_niche TEXT,
  ADD COLUMN IF NOT EXISTS sub_niche_keywords JSONB,
  ADD COLUMN IF NOT EXISTS is_dominator BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS is_searched BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS searched_at TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS sub_niche_match_score FLOAT;

-- Dominator history tracking
CREATE TABLE IF NOT EXISTS dominator_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  channel_id TEXT NOT NULL,
  channel_name TEXT,
  detected_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  is_current BOOLEAN DEFAULT TRUE,
  replaced_at TIMESTAMP WITH TIME ZONE
);

-- User search history (for Starter plan monthly limits)
CREATE TABLE IF NOT EXISTS user_search_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  channel_id TEXT NOT NULL,
  searched_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  added_as_competitor BOOLEAN DEFAULT FALSE
);

-- Cache for searched channels (avoid repeat API calls)
CREATE TABLE IF NOT EXISTS searched_channels_cache (
  channel_id TEXT PRIMARY KEY,
  channel_name TEXT,
  channel_data JSONB,
  niche_id TEXT,
  sub_niche TEXT,
  sub_niche_keywords JSONB,
  cached_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  expires_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() + INTERVAL '7 days',
  search_count INTEGER DEFAULT 1
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_competitors_sub_niche
  ON competitors(user_id, sub_niche);

CREATE INDEX IF NOT EXISTS idx_competitors_is_dominator
  ON competitors(user_id, is_dominator);

CREATE INDEX IF NOT EXISTS idx_search_history_user
  ON user_search_history(user_id, searched_at);

CREATE INDEX IF NOT EXISTS idx_cache_expires
  ON searched_channels_cache(expires_at);

-- Enable RLS on new tables
ALTER TABLE dominator_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_search_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE searched_channels_cache ENABLE ROW LEVEL SECURITY;

-- RLS policies
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'dominator_history' AND policyname = 'Users can read own dominator history'
  ) THEN
    CREATE POLICY "Users can read own dominator history"
      ON dominator_history FOR SELECT
      USING (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'user_search_history' AND policyname = 'Users can read own search history'
  ) THEN
    CREATE POLICY "Users can read own search history"
      ON user_search_history FOR SELECT
      USING (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'searched_channels_cache' AND policyname = 'Anyone can read cache'
  ) THEN
    CREATE POLICY "Anyone can read cache"
      ON searched_channels_cache FOR SELECT
      USING (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'searched_channels_cache' AND policyname = 'Service role can write cache'
  ) THEN
    CREATE POLICY "Service role can write cache"
      ON searched_channels_cache FOR ALL
      USING (auth.jwt() ->> 'role' = 'service_role');
  END IF;
END $$;
