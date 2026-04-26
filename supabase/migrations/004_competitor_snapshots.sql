-- competitor_snapshots — daily historical data per competitor
CREATE TABLE IF NOT EXISTS competitor_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  competitor_id UUID NOT NULL REFERENCES competitors(id) ON DELETE CASCADE,
  snapshot_date DATE NOT NULL,
  subscriber_count INTEGER,
  total_views BIGINT,
  video_count INTEGER,
  avg_views_per_video FLOAT,
  avg_video_length_seconds INTEGER,
  upload_frequency_30d FLOAT,
  velocity_score_avg FLOAT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(competitor_id, snapshot_date)
);

CREATE INDEX IF NOT EXISTS idx_competitor_snapshots_competitor_date
  ON competitor_snapshots(competitor_id, snapshot_date DESC);

CREATE INDEX IF NOT EXISTS idx_competitor_snapshots_date
  ON competitor_snapshots(snapshot_date DESC);

ALTER TABLE competitor_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read snapshots for their own competitors"
  ON competitor_snapshots
  FOR SELECT
  USING (
    competitor_id IN (
      SELECT id FROM competitors WHERE user_id = auth.uid()
    )
  );

-- New columns on competitors table
ALTER TABLE competitors
  ADD COLUMN IF NOT EXISTS video_count INTEGER,
  ADD COLUMN IF NOT EXISTS avg_views_per_video FLOAT,
  ADD COLUMN IF NOT EXISTS avg_video_length_seconds INTEGER,
  ADD COLUMN IF NOT EXISTS upload_frequency_30d FLOAT,
  ADD COLUMN IF NOT EXISTS insights JSONB,
  ADD COLUMN IF NOT EXISTS insights_generated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS replacement_locked_until TIMESTAMPTZ;

-- Index on competitor_videos for published_at queries
CREATE INDEX IF NOT EXISTS idx_competitor_videos_competitor_published
  ON competitor_videos(competitor_id, published_at DESC);
