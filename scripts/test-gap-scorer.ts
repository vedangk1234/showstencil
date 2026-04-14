/**
 * scripts/test-gap-scorer.ts
 * Test the gap scorer end-to-end using real data from Supabase.
 * Reads channel snapshot + competitor metrics from DB, calculates gap score,
 * saves the result, and verifies it was persisted.
 *
 * Run: npx tsx --env-file=.env.local scripts/test-gap-scorer.ts
 * (Seed first: npx tsx --env-file=.env.local scripts/seed-test-data.ts)
 */

import { createServiceClient } from '../lib/supabase';
import { getChannelSnapshots, getCompetitorMetricsFromDB } from '../lib/db';
import { calculateGapScore, saveGapScore } from '../lib/gap-scorer';
import type { UserMetrics } from '../types';

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
    throw new Error('No users found. Sign in at http://localhost:3000 first.');
  }

  const userId = users[0].id;

  // -------------------------------------------------------------------------
  // 2. Read channel snapshot from DB
  // -------------------------------------------------------------------------
  const snapshots = await getChannelSnapshots(userId, 30);

  if (snapshots.length === 0) {
    throw new Error(
      'No channel snapshots found for this user. Run seed-test-data.ts first:\n' +
      '  npx tsx --env-file=.env.local scripts/seed-test-data.ts',
    );
  }

  const latestSnapshot = snapshots[snapshots.length - 1];

  // -------------------------------------------------------------------------
  // 3. Build UserMetrics from the snapshot
  // -------------------------------------------------------------------------
  const userMetrics: UserMetrics = {
    avgViewsPerVideo: latestSnapshot.avg_views_per_video ?? 0,
    ctr: latestSnapshot.avg_ctr ?? 0,
    avgViewDurationSeconds: latestSnapshot.avg_view_duration_seconds ?? 0,
    uploadsPerMonth: 2, // not stored in snapshot — use known value for test
    subscriberCount: latestSnapshot.subscriber_count ?? 0,
    nicheId: 'finance',
    recentVideoTitles: [], // not needed for gap scoring
  };

  // -------------------------------------------------------------------------
  // 4. Read competitor metrics from DB
  // -------------------------------------------------------------------------
  const competitorMetrics = await getCompetitorMetricsFromDB(userId);

  if (competitorMetrics.length === 0) {
    throw new Error(
      'No competitor metrics found. Run seed-test-data.ts first:\n' +
      '  npx tsx --env-file=.env.local scripts/seed-test-data.ts',
    );
  }

  // -------------------------------------------------------------------------
  // 5. Print input summary
  // -------------------------------------------------------------------------
  console.log('=== REAL DB GAP SCORE TEST ===\n');

  const subsFmt = (n: number) => n >= 1000 ? `${Math.round(n / 1000)}K` : String(n);
  const secsFmt = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return sec === 0 ? `${m}m` : `${m}m ${sec}s`;
  };

  console.log('User channel:');
  console.log(`  Subscribers:     ${userMetrics.subscriberCount.toLocaleString('en-US')}`);
  console.log(`  Avg views/video: ${userMetrics.avgViewsPerVideo.toLocaleString('en-US')}`);
  console.log(`  CTR:             ${(userMetrics.ctr * 100).toFixed(1)}%`);
  console.log(`  Watch time:      ${secsFmt(userMetrics.avgViewDurationSeconds)}`);
  console.log(`  Uploads/month:   ${userMetrics.uploadsPerMonth}`);

  console.log(`\nCompetitors loaded from DB: ${competitorMetrics.length}`);
  for (const c of competitorMetrics) {
    const tier = `Tier ${c.tier}`;
    console.log(
      `  - ${c.channelName} (${subsFmt(c.subscriberCount)} subs) — ${tier}` +
      `  avg ${c.avgViewsPerVideo.toLocaleString('en-US')} views/video`,
    );
  }

  // -------------------------------------------------------------------------
  // 6. Calculate gap score
  // -------------------------------------------------------------------------
  const result = calculateGapScore(userMetrics, competitorMetrics);

  // -------------------------------------------------------------------------
  // 7. Save to DB
  // -------------------------------------------------------------------------
  const saved = await saveGapScore(userId, result);

  // -------------------------------------------------------------------------
  // 8. Print results
  // -------------------------------------------------------------------------
  console.log('\nGap Score Results:');
  console.log(`  Overall score:       ${result.overallScore}/100`);
  console.log(`  Tier 1 score:        ${result.tier1Score}/100`);
  console.log(`  Biggest opportunity: ${result.biggestOpportunity}`);
  console.log(`  Primary bottleneck:  ${result.primaryBottleneck}`);
  console.log(`  Top competitor:      ${result.topCompetitor}`);

  console.log('\nRevenue Gap:');
  console.log(`  Your monthly estimate:   $${result.revenueGap.userMonthlyEstimate.toFixed(0)}`);
  console.log(`  Tier 1 avg monthly:      $${result.revenueGap.tier1AvgMonthly.toFixed(0)}`);
  console.log(`  Monthly gap:             $${result.revenueGap.gapMonthly.toFixed(0)}`);
  console.log(`  Annual gap:              $${result.revenueGap.annualGap.toFixed(0)}`);

  console.log('\nMetric Breakdown:');
  console.log(`  Views:     ${result.breakdown.viewsGap.label}`);
  console.log(`  CTR:       ${result.breakdown.ctrGap.label}`);
  console.log(`  WatchTime: ${result.breakdown.watchTimeGap.label}`);
  console.log(`  Uploads:   ${result.breakdown.uploadFrequencyGap.label}`);

  console.log(`\nGap score saved to Supabase: ${saved ? 'YES' : 'NO — check logs above'}`);

  // -------------------------------------------------------------------------
  // 9. Verify the row exists in Supabase
  // -------------------------------------------------------------------------
  console.log('\nVerifying in Supabase...');
  const { data: savedRows } = await supabase
    .from('gap_scores')
    .select('*')
    .eq('user_id', userId)
    .order('calculated_at', { ascending: false })
    .limit(1);

  if (savedRows && savedRows.length > 0) {
    const row = savedRows[0];
    console.log('Gap score row saved successfully:');
    console.log('  ID:                ', row.id);
    console.log('  Overall score:     ', row.overall_score);
    console.log('  Calculated at:     ', row.calculated_at);
    console.log('  Primary bottleneck:', row.primary_bottleneck);
  } else {
    console.log('ERROR: Gap score was not saved to database');
    process.exit(1);
  }
}

run().catch((err) => {
  console.error('\nTest failed:', (err as Error).message);
  process.exit(1);
});
