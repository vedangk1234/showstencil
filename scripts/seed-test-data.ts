/**
 * scripts/seed-test-data.ts
 * Seed Supabase with realistic test data for a finance YouTube creator.
 * Used to test the full DB → gap scorer → save pipeline end-to-end.
 *
 * Run: npx tsx --env-file=.env.local scripts/seed-test-data.ts
 */

import { createServiceClient } from '../lib/supabase';

async function run() {
  const supabase = createServiceClient();

  // -------------------------------------------------------------------------
  // 1. Resolve the test user
  // -------------------------------------------------------------------------
  const { data: users, error: userError } = await supabase
    .from('users')
    .select('id, email')
    .limit(1);

  if (userError) throw new Error(`Failed to fetch users: ${userError.message}`);
  if (!users || users.length === 0) {
    throw new Error(
      'No users found in the database. Sign in at http://localhost:3000 first to create a user row.',
    );
  }

  const userId = users[0].id;
  console.log(`Seeding data for user: ${users[0].email} (${userId})\n`);

  // -------------------------------------------------------------------------
  // 2. Channel snapshot
  // -------------------------------------------------------------------------
  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD

  // Clear any existing snapshot for today before inserting
  await supabase
    .from('channel_snapshots')
    .delete()
    .eq('user_id', userId)
    .eq('snapshot_date', today);

  const { error: snapshotError } = await supabase.from('channel_snapshots').insert({
    user_id: userId,
    snapshot_date: today,
    subscriber_count: 45000,
    total_views: 2100000,
    videos_count: 47,
    avg_views_per_video: 8400,
    avg_ctr: 0.021,
    avg_view_duration_seconds: 380,
    avg_like_ratio: 0.042,
    estimated_monthly_revenue: 166.32,
    rpm: 2.20,
    momentum_score: 34,
  });

  if (snapshotError) throw new Error(`Failed to insert channel snapshot: ${snapshotError.message}`);
  console.log('✓ Channel snapshot inserted');

  // -------------------------------------------------------------------------
  // 3. Competitors
  // -------------------------------------------------------------------------
  const now = new Date().toISOString();

  // Remove existing test competitors for this user to avoid duplicates
  await supabase
    .from('competitors')
    .delete()
    .eq('user_id', userId)
    .in('youtube_channel_id', ['comp_finance_sarah', 'comp_money_marcus', 'comp_smart_money']);

  const { data: competitorRows, error: competitorError } = await supabase
    .from('competitors')
    .insert([
      {
        user_id: userId,
        youtube_channel_id: 'comp_finance_sarah',
        channel_name: 'Finance With Sarah',
        channel_thumbnail: 'https://example.com/sarah.jpg',
        subscriber_count: 112000,
        total_views: 8900000,
        tier: 1,
        is_auto_detected: true,
        is_active: true,
        last_synced_at: now,
      },
      {
        user_id: userId,
        youtube_channel_id: 'comp_money_marcus',
        channel_name: 'Money With Marcus',
        channel_thumbnail: 'https://example.com/marcus.jpg',
        subscriber_count: 89000,
        total_views: 6200000,
        tier: 1,
        is_auto_detected: true,
        is_active: true,
        last_synced_at: now,
      },
      {
        user_id: userId,
        youtube_channel_id: 'comp_smart_money',
        channel_name: 'Smart Money Moves',
        channel_thumbnail: 'https://example.com/smart.jpg',
        subscriber_count: 67000,
        total_views: 4100000,
        tier: 1,
        is_auto_detected: true,
        is_active: true,
        last_synced_at: now,
      },
    ])
    .select('id, channel_name');

  if (competitorError) throw new Error(`Failed to insert competitors: ${competitorError.message}`);
  if (!competitorRows || competitorRows.length !== 3) {
    throw new Error('Expected 3 competitor rows to be returned');
  }

  const sarahId = competitorRows.find((c) => c.channel_name === 'Finance With Sarah')!.id;
  const marcusId = competitorRows.find((c) => c.channel_name === 'Money With Marcus')!.id;
  const smartId = competitorRows.find((c) => c.channel_name === 'Smart Money Moves')!.id;

  console.log('✓ 3 competitors inserted');

  // -------------------------------------------------------------------------
  // 4. Competitor videos
  // -------------------------------------------------------------------------
  function daysAgo(n: number): string {
    const d = new Date();
    d.setDate(d.getDate() - n);
    return d.toISOString();
  }

  // Clean up any existing videos for these competitors
  await supabase
    .from('competitor_videos')
    .delete()
    .in('competitor_id', [sarahId, marcusId, smartId]);

  const videoRows = [
    // Finance With Sarah — 4 videos
    {
      competitor_id: sarahId,
      youtube_video_id: 'sarah_v1',
      title: 'How to Build Wealth in Your 20s',
      published_at: daysAgo(14),
      view_count: 52000,
      like_count: 2100,
      comment_count: 340,
      duration_seconds: 920,
      velocity_score: 45.2,
      performance_vs_avg: 1.24,
      is_viral: false,
    },
    {
      competitor_id: sarahId,
      youtube_video_id: 'sarah_v2',
      title: 'The Truth About Passive Income',
      published_at: daysAgo(21),
      view_count: 38000,
      like_count: 1560,
      comment_count: 210,
      duration_seconds: 840,
      velocity_score: 31.1,
      performance_vs_avg: 0.91,
      is_viral: false,
    },
    {
      competitor_id: sarahId,
      youtube_video_id: 'sarah_v3',
      title: 'I Quit My Job to Invest Full Time',
      published_at: daysAgo(7),
      view_count: 89000,
      like_count: 4200,
      comment_count: 780,
      duration_seconds: 1080,
      velocity_score: 128.4,
      performance_vs_avg: 2.13,
      is_viral: true,
    },
    {
      competitor_id: sarahId,
      youtube_video_id: 'sarah_v4',
      title: 'Stop Wasting Money on These 5 Things',
      published_at: daysAgo(30),
      view_count: 41000,
      like_count: 1890,
      comment_count: 290,
      duration_seconds: 760,
      velocity_score: 28.5,
      performance_vs_avg: 0.98,
      is_viral: false,
    },

    // Money With Marcus — 4 videos
    {
      competitor_id: marcusId,
      youtube_video_id: 'marcus_v1',
      title: 'I Invested $500 Every Month for a Year',
      published_at: daysAgo(10),
      view_count: 44000,
      like_count: 1820,
      comment_count: 290,
      duration_seconds: 860,
      velocity_score: 52.1,
      performance_vs_avg: 1.29,
      is_viral: false,
    },
    {
      competitor_id: marcusId,
      youtube_video_id: 'marcus_v2',
      title: 'Stop Making These Money Mistakes',
      published_at: daysAgo(17),
      view_count: 31000,
      like_count: 1240,
      comment_count: 180,
      duration_seconds: 740,
      velocity_score: 28.7,
      performance_vs_avg: 0.91,
      is_viral: false,
    },
    {
      competitor_id: marcusId,
      youtube_video_id: 'marcus_v3',
      title: 'My $100K Investment Portfolio Revealed',
      published_at: daysAgo(5),
      view_count: 67000,
      like_count: 3100,
      comment_count: 560,
      duration_seconds: 1120,
      velocity_score: 198.2,
      performance_vs_avg: 1.96,
      is_viral: true,
    },
    {
      competitor_id: marcusId,
      youtube_video_id: 'marcus_v4',
      title: 'Roth IRA vs 401k in 2026',
      published_at: daysAgo(25),
      view_count: 28000,
      like_count: 1100,
      comment_count: 150,
      duration_seconds: 680,
      velocity_score: 18.3,
      performance_vs_avg: 0.82,
      is_viral: false,
    },

    // Smart Money Moves — 4 videos
    {
      competitor_id: smartId,
      youtube_video_id: 'smart_v1',
      title: 'Dave Ramsey Was Wrong About This',
      published_at: daysAgo(12),
      view_count: 38000,
      like_count: 1560,
      comment_count: 240,
      duration_seconds: 800,
      velocity_score: 39.6,
      performance_vs_avg: 1.33,
      is_viral: false,
    },
    {
      competitor_id: smartId,
      youtube_video_id: 'smart_v2',
      title: 'Index Funds vs ETFs Explained',
      published_at: daysAgo(19),
      view_count: 24000,
      like_count: 980,
      comment_count: 140,
      duration_seconds: 720,
      velocity_score: 19.8,
      performance_vs_avg: 0.84,
      is_viral: false,
    },
    {
      competitor_id: smartId,
      youtube_video_id: 'smart_v3',
      title: 'How I Made $10K Passive Income Last Month',
      published_at: daysAgo(8),
      view_count: 52000,
      like_count: 2400,
      comment_count: 420,
      duration_seconds: 960,
      velocity_score: 87.3,
      performance_vs_avg: 1.82,
      is_viral: true,
    },
    {
      competitor_id: smartId,
      youtube_video_id: 'smart_v4',
      title: 'The 4% Rule Explained Simply',
      published_at: daysAgo(28),
      view_count: 19000,
      like_count: 780,
      comment_count: 110,
      duration_seconds: 640,
      velocity_score: 12.1,
      performance_vs_avg: 0.66,
      is_viral: false,
    },
  ];

  const { error: videosError } = await supabase.from('competitor_videos').insert(videoRows);

  if (videosError) throw new Error(`Failed to insert competitor videos: ${videosError.message}`);
  console.log('✓ 12 competitor videos inserted');

  // -------------------------------------------------------------------------
  // Summary
  // -------------------------------------------------------------------------
  console.log('\nSeeded successfully:');
  console.log('  - 1 channel snapshot');
  console.log('  - 3 competitors');
  console.log('  - 12 competitor videos');
  console.log(`  - userId: ${userId}`);
}

run().catch((err) => {
  console.error('\nSeed failed:', (err as Error).message);
  process.exit(1);
});
