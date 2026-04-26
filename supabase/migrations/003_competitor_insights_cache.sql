-- Cache for AI-generated competitor insights
CREATE TABLE IF NOT EXISTS competitor_insights (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  competitor_id UUID REFERENCES competitors(id) ON DELETE CASCADE,
  insights JSONB NOT NULL,
  generated_at TIMESTAMPTZ DEFAULT NOW(),
  generation_count INTEGER DEFAULT 1,
  UNIQUE(user_id, competitor_id)
);

CREATE INDEX IF NOT EXISTS idx_competitor_insights_lookup
  ON competitor_insights(user_id, competitor_id);

ALTER TABLE competitor_insights ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own insights"
  ON competitor_insights FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Service role can write insights"
  ON competitor_insights FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role');
