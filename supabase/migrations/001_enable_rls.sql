-- Enable Row Level Security on all tables
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE channel_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE videos ENABLE ROW LEVEL SECURITY;
ALTER TABLE competitors ENABLE ROW LEVEL SECURITY;
ALTER TABLE competitor_videos ENABLE ROW LEVEL SECURITY;
ALTER TABLE gap_scores ENABLE ROW LEVEL SECURITY;
ALTER TABLE digests ENABLE ROW LEVEL SECURITY;
ALTER TABLE trends ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_settings ENABLE ROW LEVEL SECURITY;

-- ── users ────────────────────────────────────────────────────────────────────
CREATE POLICY "Users can view own data" ON users FOR SELECT USING (auth.uid()::text = id::text);
CREATE POLICY "Users can insert own data" ON users FOR INSERT WITH CHECK (auth.uid()::text = id::text);
CREATE POLICY "Users can update own data" ON users FOR UPDATE USING (auth.uid()::text = id::text);
CREATE POLICY "Users can delete own data" ON users FOR DELETE USING (auth.uid()::text = id::text);

-- ── channel_snapshots ────────────────────────────────────────────────────────
CREATE POLICY "Users can view own data" ON channel_snapshots FOR SELECT USING (auth.uid()::text = user_id::text);
CREATE POLICY "Users can insert own data" ON channel_snapshots FOR INSERT WITH CHECK (auth.uid()::text = user_id::text);
CREATE POLICY "Users can update own data" ON channel_snapshots FOR UPDATE USING (auth.uid()::text = user_id::text);
CREATE POLICY "Users can delete own data" ON channel_snapshots FOR DELETE USING (auth.uid()::text = user_id::text);

-- ── videos ───────────────────────────────────────────────────────────────────
CREATE POLICY "Users can view own data" ON videos FOR SELECT USING (auth.uid()::text = user_id::text);
CREATE POLICY "Users can insert own data" ON videos FOR INSERT WITH CHECK (auth.uid()::text = user_id::text);
CREATE POLICY "Users can update own data" ON videos FOR UPDATE USING (auth.uid()::text = user_id::text);
CREATE POLICY "Users can delete own data" ON videos FOR DELETE USING (auth.uid()::text = user_id::text);

-- ── competitors ───────────────────────────────────────────────────────────────
CREATE POLICY "Users can view own data" ON competitors FOR SELECT USING (auth.uid()::text = user_id::text);
CREATE POLICY "Users can insert own data" ON competitors FOR INSERT WITH CHECK (auth.uid()::text = user_id::text);
CREATE POLICY "Users can update own data" ON competitors FOR UPDATE USING (auth.uid()::text = user_id::text);
CREATE POLICY "Users can delete own data" ON competitors FOR DELETE USING (auth.uid()::text = user_id::text);

-- ── gap_scores ────────────────────────────────────────────────────────────────
CREATE POLICY "Users can view own data" ON gap_scores FOR SELECT USING (auth.uid()::text = user_id::text);
CREATE POLICY "Users can insert own data" ON gap_scores FOR INSERT WITH CHECK (auth.uid()::text = user_id::text);
CREATE POLICY "Users can update own data" ON gap_scores FOR UPDATE USING (auth.uid()::text = user_id::text);
CREATE POLICY "Users can delete own data" ON gap_scores FOR DELETE USING (auth.uid()::text = user_id::text);

-- ── digests ───────────────────────────────────────────────────────────────────
CREATE POLICY "Users can view own data" ON digests FOR SELECT USING (auth.uid()::text = user_id::text);
CREATE POLICY "Users can insert own data" ON digests FOR INSERT WITH CHECK (auth.uid()::text = user_id::text);
CREATE POLICY "Users can update own data" ON digests FOR UPDATE USING (auth.uid()::text = user_id::text);
CREATE POLICY "Users can delete own data" ON digests FOR DELETE USING (auth.uid()::text = user_id::text);

-- ── trends ────────────────────────────────────────────────────────────────────
CREATE POLICY "Users can view own data" ON trends FOR SELECT USING (auth.uid()::text = user_id::text);
CREATE POLICY "Users can insert own data" ON trends FOR INSERT WITH CHECK (auth.uid()::text = user_id::text);
CREATE POLICY "Users can update own data" ON trends FOR UPDATE USING (auth.uid()::text = user_id::text);
CREATE POLICY "Users can delete own data" ON trends FOR DELETE USING (auth.uid()::text = user_id::text);

-- ── user_settings ─────────────────────────────────────────────────────────────
CREATE POLICY "Users can view own data" ON user_settings FOR SELECT USING (auth.uid()::text = user_id::text);
CREATE POLICY "Users can insert own data" ON user_settings FOR INSERT WITH CHECK (auth.uid()::text = user_id::text);
CREATE POLICY "Users can update own data" ON user_settings FOR UPDATE USING (auth.uid()::text = user_id::text);
CREATE POLICY "Users can delete own data" ON user_settings FOR DELETE USING (auth.uid()::text = user_id::text);

-- ── competitor_videos (public data — any auth user can read, service role writes) ──
CREATE POLICY "Authenticated users can view competitor data" ON competitor_videos
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Service role can modify competitor data" ON competitor_videos
  FOR ALL USING (auth.role() = 'service_role');
