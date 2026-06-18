/**
 * scripts/seed-test-data.ts
 * Seeds Supabase with realistic test data for a finance & crypto YouTube creator.
 * Fully idempotent — safe to run multiple times without creating duplicates.
 *
 * Phase 9 (2026-06-09): migrated from the legacy 12-niche slug set to the
 * canonical 31-niche taxonomy in lib/niches.ts. The seeded niche is now
 * 'finance_crypto'; channel-ID prefixes use the new slug.
 *
 * Run: npx tsx --env-file=.env.local scripts/seed-test-data.ts
 */

import { createServiceClient } from '../lib/supabase';

const TEST_USER_EMAIL = 'vedangk2912@gmail.com';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function randomBetween(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

function randomInt(min: number, max: number): number {
  return Math.round(randomBetween(min, max));
}

function daysAgo(n: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - n);
  d.setUTCHours(12, 0, 0, 0);
  return d.toISOString();
}

function dateStringDaysAgo(n: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}

function randomId(length = 11): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars[Math.floor(Math.random() * chars.length)];
  }
  return result;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function run() {
  const supabase = createServiceClient();

  // -------------------------------------------------------------------------
  // 1. Resolve test user
  // -------------------------------------------------------------------------
  const { data: user, error: userError } = await supabase
    .from('users')
    .select('id, niche_id, sub_niche')
    .eq('email', TEST_USER_EMAIL)
    .single();

  if (userError || !user) {
    console.error('❌ Test user not found. Sign in at http://localhost:3000 first to create the user row.');
    process.exit(1);
  }

  const userId = user.id as string;
  console.log(`\nSeeding for: ${TEST_USER_EMAIL} (${userId})\n`);

  // Ensure niche_id is exactly 'finance_crypto' (the canonical Phase-3 slug;
  // the legacy 'finance' bucket was split into the 31-niche taxonomy and
  // personal-finance content now lives under finance_crypto).
  if (user.niche_id !== 'finance_crypto' || !user.sub_niche) {
    await supabase
      .from('users')
      .update({
        niche_id: 'finance_crypto',
        sub_niche: 'Personal Finance & Money Management',
        updated_at: new Date().toISOString(),
      })
      .eq('id', userId);
    console.log('✓ Set niche_id=finance_crypto + sub_niche on user');
  }

  // -------------------------------------------------------------------------
  // 2. Competitors — upsert 3 with correct tiers
  // -------------------------------------------------------------------------

  // Define channel IDs as constants so we can reference them throughout.
  // Phase 9: synthetic channel-ID prefixes use the new slug 'finance_crypto'
  // (the dominator ID is a UC-style YouTube ID and unaffected by the rename).
  const SARAH_CHANNEL_ID = 'comp_finance_crypto_sarah';
  const MARCUS_CHANNEL_ID = 'comp_finance_crypto_marcus';
  const DOMINATOR_CHANNEL_ID = 'UCwealthempire2400000xxx';
  const OLD_SMART_CHANNEL_ID = 'comp_finance_crypto_smart_money';

  const now = new Date().toISOString();

  // Deactivate old "Smart Money Moves" if it exists
  await supabase
    .from('competitors')
    .update({ is_active: false, is_auto_detected: false })
    .eq('user_id', userId)
    .eq('youtube_channel_id', OLD_SMART_CHANNEL_ID);

  // Upsert helper: match by (user_id, channel_name) — stable dedup key.
  // youtube_channel_id can differ between seed runs if old IDs were generated differently,
  // so we never use it as the lookup key to avoid creating duplicate rows.
  async function upsertCompetitor(
    channelId: string,
    fields: Record<string, unknown>,
  ): Promise<string> {
    const channelName = fields.channel_name as string;

    const { data: existing } = await supabase
      .from('competitors')
      .select('id')
      .eq('user_id', userId)
      .eq('channel_name', channelName)
      .maybeSingle();

    if (existing) {
      // Also sync youtube_channel_id to the canonical value in case old rows differ
      await supabase
        .from('competitors')
        .update({ youtube_channel_id: channelId, ...fields, last_synced_at: now })
        .eq('id', existing.id);
      return existing.id as string;
    }

    const { data: inserted, error } = await supabase
      .from('competitors')
      .insert({ user_id: userId, youtube_channel_id: channelId, ...fields, last_synced_at: now })
      .select('id')
      .single();

    if (error || !inserted) throw new Error(`Failed to insert competitor ${channelName}: ${error?.message}`);
    return inserted.id as string;
  }

  const sarahId = await upsertCompetitor(SARAH_CHANNEL_ID, {
    channel_name: 'Finance With Sarah',
    channel_thumbnail: 'https://via.placeholder.com/240x240/3b82f6/ffffff?text=FS',
    subscriber_count: 112000,
    total_views: 14500000,
    tier: 1,
    is_dominator: false,
    is_auto_detected: true,
    is_active: true,
    is_searched: false,
    sub_niche: 'Personal Finance & Budgeting',
    sub_niche_keywords: ['budgeting', 'saving', 'personal finance', 'money tips', 'frugal living'],
    sub_niche_match_score: 0.85,
    video_count: 247,
    avg_views_per_video: 28000,
    avg_video_length_seconds: 720,
    upload_frequency_30d: 4.2,
  });

  const marcusId = await upsertCompetitor(MARCUS_CHANNEL_ID, {
    channel_name: 'Money With Marcus',
    channel_thumbnail: 'https://via.placeholder.com/240x240/8b5cf6/ffffff?text=MM',
    subscriber_count: 380000,
    total_views: 62000000,
    tier: 2,
    is_dominator: false,
    is_auto_detected: true,
    is_active: true,
    is_searched: false,
    sub_niche: 'Investing & Wealth Building',
    sub_niche_keywords: ['investing', 'stocks', 'etf', 'wealth building', 'portfolio', 'index funds'],
    sub_niche_match_score: 0.72,
    video_count: 412,
    avg_views_per_video: 95000,
    avg_video_length_seconds: 840,
    upload_frequency_30d: 3.5,
  });

  const dominatorId = await upsertCompetitor(DOMINATOR_CHANNEL_ID, {
    channel_name: 'Wealth Empire',
    channel_thumbnail: 'https://via.placeholder.com/240x240/f59e0b/ffffff?text=WE',
    subscriber_count: 2400000,
    total_views: 580000000,
    tier: 3,
    is_dominator: true,
    is_auto_detected: true,
    is_active: true,
    is_searched: false,
    sub_niche: 'Personal Finance & Wealth Building',
    sub_niche_keywords: ['wealth', 'millionaire', 'financial freedom', 'passive income', 'real estate', 'high income'],
    sub_niche_match_score: 0.65,
    video_count: 580,
    avg_views_per_video: 720000,
    avg_video_length_seconds: 960,
    upload_frequency_30d: 2.8,
    replacement_locked_until: null,
  });

  console.log('✓ Competitors upserted (Sarah Tier1, Marcus Tier2, Wealth Empire Dominator)');

  // -------------------------------------------------------------------------
  // 3. Own channel videos — 15 finance videos
  // -------------------------------------------------------------------------

  const ownVideoTitles = [
    'I Saved $10,000 in 90 Days — Here\'s Exactly How',
    'Why Most People Fail at Investing (And How to Fix It)',
    'The Truth About High-Yield Savings Accounts in 2026',
    '5 Money Habits That Will Change Your Life',
    'I Tracked Every Dollar for 30 Days — Shocking Results',
    'The Roth IRA Mistake 90% of People Make',
    'How I Built a $50K Emergency Fund From Zero',
    'Stop Doing These 3 Things With Your Credit Card',
    'Index Funds vs Individual Stocks — The Honest Truth',
    'I Lived on $40 a Week for a Month — Here\'s What Happened',
    'The Real Cost of Eating Out (You Won\'t Believe This)',
    'How to Pay Off Debt Without Living Like a Monk',
    'Why I\'m Not Buying a House in 2026',
    'The 401(k) Trap Nobody Talks About',
    'I Tried 5 Budgeting Apps — One Actually Works',
  ];

  // Fixed IDs so reruns stay idempotent
  const ownVideoIds = [
    'own_v001_fnc11', 'own_v002_fnc22', 'own_v003_fnc33', 'own_v004_fnc44', 'own_v005_fnc55',
    'own_v006_fnc66', 'own_v007_fnc77', 'own_v008_fnc88', 'own_v009_fnc99', 'own_v010_fncAA',
    'own_v011_fncBB', 'own_v012_fncCC', 'own_v013_fncDD', 'own_v014_fncEE', 'own_v015_fncFF',
  ];

  // 3 "hit" videos at indices 2, 7, 13
  const hitIndices = new Set([2, 7, 13]);

  let videosInserted = 0;

  for (let i = 0; i < 15; i++) {
    const videoId = ownVideoIds[i];

    const { data: existing } = await supabase
      .from('videos')
      .select('id')
      .eq('user_id', userId)
      .eq('youtube_video_id', videoId)
      .maybeSingle();

    if (existing) continue;

    const isHit = hitIndices.has(i);
    const publishedDaysAgo = 90 - i * 6; // spread evenly over 90 days
    const duration = randomInt(540, 1080);
    const viewBase = isHit ? randomInt(18000, 22000) : randomInt(6000, 13000);
    const noise = Math.round((Math.random() - 0.5) * 4000);
    const viewCount = Math.max(2000, viewBase + noise);
    const ctr = randomBetween(1.8, 4.5);
    const avgViewDuration = Math.round(duration * randomBetween(0.40, 0.65));

    await supabase.from('videos').insert({
      user_id: userId,
      youtube_video_id: videoId,
      title: ownVideoTitles[i],
      published_at: daysAgo(publishedDaysAgo),
      duration_seconds: duration,
      view_count: viewCount,
      like_count: Math.round(viewCount * randomBetween(0.03, 0.05)),
      comment_count: Math.round(viewCount * randomBetween(0.005, 0.01)),
      share_count: 0,
      save_count: 0,
      ctr: Math.round(ctr * 100) / 100,
      avg_view_duration_seconds: avgViewDuration,
      retention_percentage: randomBetween(35, 55),
      impressions: Math.round(viewCount / (ctr / 100)),
      traffic_source_search: randomBetween(0.15, 0.45),
      traffic_source_suggested: randomBetween(0.30, 0.55),
      traffic_source_browse: randomBetween(0.10, 0.25),
      traffic_source_external: randomBetween(0.02, 0.08),
      subscriber_gain: randomInt(5, 80),
      revenue_estimate: Math.round(viewCount * randomBetween(0.003, 0.005) * 100) / 100,
      rpm: randomBetween(2.5, 4.5),
      thumbnail_url: `https://via.placeholder.com/480x360/22c55e/ffffff?text=Video+${i + 1}`,
      performance_score: randomInt(30, 95),
      synced_at: now,
    });

    videosInserted++;
  }

  console.log(`✓ Own channel videos: ${videosInserted} inserted (skipped ${15 - videosInserted} existing)`);

  // -------------------------------------------------------------------------
  // 4. Competitor videos — ensure ≥10 per competitor
  // -------------------------------------------------------------------------

  const sarahTitles = [
    'How to Build Wealth in Your 20s',
    'The Truth About Passive Income',
    'I Quit My Job to Invest Full Time',
    'Stop Wasting Money on These 5 Things',
    'Why Your Budget Is Failing (Fix This)',
    'The Envelope Method That Saved Me $800/Month',
    'I Analyzed 100 Budget Plans — Here\'s What Works',
    'HYSA vs CDs: Where Should Your Money Go in 2026',
    'How to Negotiate a Higher Salary (Scripts Included)',
    'The No-Spend Month Challenge: Final Results',
    'Emergency Fund Math: How Much Is Actually Enough',
    'Frugal Living Hacks That Actually Move the Needle',
  ];

  const marcusTitles = [
    'I Invested $500 Every Month for a Year — Results',
    'Stop Making These Money Mistakes With Your 401k',
    'My $100K Investment Portfolio Revealed',
    'Roth IRA vs 401k in 2026 (Complete Breakdown)',
    'The ETF Strategy That Beats 90% of Investors',
    'How I Picked My First Index Fund (Step by Step)',
    'Dividend Investing: Is the Passive Income Real?',
    'Dollar Cost Averaging vs Lump Sum: The Data',
    'How Market Corrections Actually Help Long-Term Investors',
    'The S&P 500 Lesson Nobody Teaches You',
    'Should You Max Your Roth IRA Before Investing Elsewhere?',
    'Stock Market Basics in 12 Minutes (Watch This First)',
  ];

  const dominatorTitles = [
    'How I Built a $5M Portfolio From $0',
    'The Real Estate Deal That Changed My Life',
    '10 Income Streams That Made Me a Millionaire',
    'Why 99% of People Will Never Be Wealthy',
    'The FIRE Formula: Retire in 10 Years',
    'I Interview a Billionaire — Shocking Money Advice',
    'Passive Income Machines: What Actually Works in 2026',
    'The High-Income Skills Worth Learning Right Now',
    'How to Scale From $100K to $1M Net Worth',
    'Real Estate vs Stocks: Where Rich People Put Their Money',
    'The Wealth Mindset Shift That Everything Starts With',
    'I Analyzed 500 Millionaires — Here\'s the Pattern',
  ];

  interface CompetitorVideoSpec {
    competitorId: string;
    titles: string[];
    idPrefix: string;
    existingIds: string[];
    viewMin: number;
    viewMax: number;
    hitViewMin: number;
    hitViewMax: number;
    avgDuration: number;
    avgViews: number;
  }

  const competitorSpecs: CompetitorVideoSpec[] = [
    {
      competitorId: sarahId,
      titles: sarahTitles,
      idPrefix: 'sarah',
      existingIds: ['sarah_v1', 'sarah_v2', 'sarah_v3', 'sarah_v4'],
      viewMin: 18000, viewMax: 45000,
      hitViewMin: 60000, hitViewMax: 75000,
      avgDuration: 720,
      avgViews: 28000,
    },
    {
      competitorId: marcusId,
      titles: marcusTitles,
      idPrefix: 'marcus',
      existingIds: ['marcus_v1', 'marcus_v2', 'marcus_v3', 'marcus_v4'],
      viewMin: 65000, viewMax: 140000,
      hitViewMin: 180000, hitViewMax: 240000,
      avgDuration: 840,
      avgViews: 95000,
    },
    {
      competitorId: dominatorId,
      titles: dominatorTitles,
      idPrefix: 'we',
      existingIds: [],
      viewMin: 450000, viewMax: 1100000,
      hitViewMin: 1500000, hitViewMax: 1900000,
      avgDuration: 960,
      avgViews: 720000,
    },
  ];

  for (const spec of competitorSpecs) {
    const { data: existingVideos } = await supabase
      .from('competitor_videos')
      .select('id')
      .eq('competitor_id', spec.competitorId);

    const existingCount = existingVideos?.length ?? 0;
    const needed = Math.max(0, 10 - existingCount);

    for (let i = 0; i < needed; i++) {
      const titleIndex = (existingCount + i) % spec.titles.length;
      const isHit = i === 0 && existingCount === 0; // first new video can be a hit
      const publishedDaysAgo = 60 - (existingCount + i) * 5;
      const publishedAt = daysAgo(Math.max(1, publishedDaysAgo));
      const hoursOld = Math.max(1, publishedDaysAgo * 24);

      const viewCount = isHit
        ? randomInt(spec.hitViewMin, spec.hitViewMax)
        : randomInt(spec.viewMin, spec.viewMax);

      const duration = spec.avgDuration + randomInt(-200, 200);
      const velocityScore = Math.round((viewCount / hoursOld) * 10) / 10;
      const performanceVsAvg = Math.round((viewCount / spec.avgViews) * 100) / 100;

      const videoId = `${spec.idPrefix}_x${randomId(6)}`;

      await supabase.from('competitor_videos').insert({
        competitor_id: spec.competitorId,
        youtube_video_id: videoId,
        title: spec.titles[titleIndex],
        published_at: publishedAt,
        view_count: viewCount,
        like_count: Math.round(viewCount * randomBetween(0.03, 0.05)),
        comment_count: Math.round(viewCount * randomBetween(0.005, 0.01)),
        duration_seconds: Math.max(300, duration),
        thumbnail_url: `https://via.placeholder.com/480x360/6366f1/ffffff?text=${spec.idPrefix}+${existingCount + i + 1}`,
        velocity_score: velocityScore,
        performance_vs_avg: performanceVsAvg,
        is_viral: performanceVsAvg > 2.0,
        synced_at: now,
      });
    }

    const { data: finalCount } = await supabase
      .from('competitor_videos')
      .select('id')
      .eq('competitor_id', spec.competitorId);

    console.log(`✓ ${spec.idPrefix} competitor videos: ${finalCount?.length ?? 0} total (added ${needed})`);
  }

  // -------------------------------------------------------------------------
  // 5. Channel snapshots — 30 days of history (own channel)
  // -------------------------------------------------------------------------

  // Remove any all-null snapshot rows for today — these are written by sync
  // runs that fire before real data is available (e.g. token not yet refreshed,
  // or a cron that ran before the seed completed). Without this, the dashboard
  // reads today's null row as the "latest" and shows dashes for every metric.
  await supabase
    .from('channel_snapshots')
    .delete()
    .eq('user_id', userId)
    .eq('snapshot_date', new Date().toISOString().split('T')[0])
    .is('subscriber_count', null);

  // Random walk from 42000 to ~45000 over 30 days
  let subs = 42000;
  let totalViews = 3200000;
  let videosCount = 232;

  const snapshotRows: Record<string, unknown>[] = [];
  for (let daysBack = 30; daysBack >= 0; daysBack--) {
    const delta = Math.round((Math.random() - 0.3) * 200); // biased upward
    subs = Math.max(41500, subs + delta);

    // Nudge toward 45000 on final day
    if (daysBack === 0) subs = 45000;

    // Grow total views each day (avg ~0.15 videos/day × ~8400 views)
    totalViews += Math.round(randomBetween(800, 1800));

    // Increment video count ~every 6 days
    if (daysBack % 6 === 0 && daysBack > 0 && videosCount < 247) videosCount++;

    snapshotRows.push({
      user_id: userId,
      snapshot_date: dateStringDaysAgo(daysBack),
      subscriber_count: subs,
      total_views: totalViews,
      videos_count: videosCount,
      avg_views_per_video: randomInt(7000, 11000),
      avg_ctr: Math.round(randomBetween(2.0, 3.2) * 100) / 100,
      avg_view_duration_seconds: randomInt(320, 420),
      avg_like_ratio: Math.round(randomBetween(18, 28) * 10) / 10,
      estimated_monthly_revenue: Math.round(randomBetween(140, 220) * 100) / 100,
      rpm: Math.round(randomBetween(2.8, 3.6) * 100) / 100,
      momentum_score: randomInt(35, 55),
    });
  }

  // Per-row upsert: delete existing row for that date then insert fresh
  // (channel_snapshots has no composite unique constraint — avoids ON CONFLICT issues)
  let snapshotsInserted = 0;
  for (const row of snapshotRows) {
    const { data: existing } = await supabase
      .from('channel_snapshots')
      .select('id')
      .eq('user_id', userId)
      .eq('snapshot_date', row.snapshot_date as string)
      .maybeSingle();

    if (existing) {
      await supabase
        .from('channel_snapshots')
        .update(row)
        .eq('id', existing.id);
    } else {
      const { error } = await supabase.from('channel_snapshots').insert(row);
      if (error) throw new Error(`Failed to insert snapshot for ${row.snapshot_date}: ${error.message}`);
      snapshotsInserted++;
    }
  }
  console.log(`✓ Channel snapshots upserted: ${snapshotRows.length} rows (${snapshotsInserted} new)`);

  // -------------------------------------------------------------------------
  // 6. Competitor snapshots — 30 days × 3 competitors
  // -------------------------------------------------------------------------

  interface CompetitorSnapshotSpec {
    competitorId: string;
    name: string;
    finalSubs: number;
    startSubs: number;
    deltaMin: number;
    deltaMax: number;
    avgViews: number;
    viewsVariance: number;
    videoCountStart: number;
    videoCountEnd: number;
    avgDuration: number;
    durationVariance: number;
    uploadFreq: number;
    freqVariance: number;
    velocityAvg: number;
  }

  const competitorSnapshotSpecs: CompetitorSnapshotSpec[] = [
    {
      competitorId: sarahId,
      name: 'Sarah',
      finalSubs: 112000,
      startSubs: 109500,
      deltaMin: -10, deltaMax: 200,
      avgViews: 28000, viewsVariance: 4000,
      videoCountStart: 244, videoCountEnd: 247,
      avgDuration: 720, durationVariance: 60,
      uploadFreq: 4.2, freqVariance: 0.4,
      velocityAvg: 800,
    },
    {
      competitorId: marcusId,
      name: 'Marcus',
      finalSubs: 380000,
      startSubs: 374000,
      deltaMin: -50, deltaMax: 500,
      avgViews: 95000, viewsVariance: 15000,
      videoCountStart: 408, videoCountEnd: 412,
      avgDuration: 840, durationVariance: 90,
      uploadFreq: 3.5, freqVariance: 0.3,
      velocityAvg: 2400,
    },
    {
      competitorId: dominatorId,
      name: 'Wealth Empire',
      finalSubs: 2400000,
      startSubs: 2385000,
      deltaMin: -200, deltaMax: 1500,
      avgViews: 720000, viewsVariance: 120000,
      videoCountStart: 577, videoCountEnd: 580,
      avgDuration: 960, durationVariance: 100,
      uploadFreq: 2.8, freqVariance: 0.3,
      velocityAvg: 14000,
    },
  ];

  for (const spec of competitorSnapshotSpecs) {
    let compSubs = spec.startSubs;
    const compSnapshotRows: Record<string, unknown>[] = [];

    for (let daysBack = 30; daysBack >= 0; daysBack--) {
      const delta = Math.round(randomBetween(spec.deltaMin, spec.deltaMax));
      compSubs = Math.max(spec.startSubs - 1000, compSubs + delta);

      if (daysBack === 0) compSubs = spec.finalSubs;

      // Linear interpolation for video count
      const progress = (30 - daysBack) / 30;
      const videoCount = spec.videoCountStart + Math.round(progress * (spec.videoCountEnd - spec.videoCountStart));

      compSnapshotRows.push({
        competitor_id: spec.competitorId,
        snapshot_date: dateStringDaysAgo(daysBack),
        subscriber_count: compSubs,
        total_views: null, // not tracking total_views daily for competitors
        video_count: videoCount,
        avg_views_per_video: Math.round(spec.avgViews + randomBetween(-spec.viewsVariance, spec.viewsVariance)),
        avg_video_length_seconds: randomInt(spec.avgDuration - spec.durationVariance, spec.avgDuration + spec.durationVariance),
        upload_frequency_30d: Math.round((spec.uploadFreq + randomBetween(-spec.freqVariance, spec.freqVariance)) * 10) / 10,
        velocity_score_avg: Math.round(spec.velocityAvg + randomBetween(-spec.velocityAvg * 0.15, spec.velocityAvg * 0.15)),
      });
    }

    const { error: csError } = await supabase
      .from('competitor_snapshots')
      .upsert(compSnapshotRows, { onConflict: 'competitor_id,snapshot_date' });

    if (csError) throw new Error(`Failed to upsert ${spec.name} snapshots: ${csError.message}`);
    console.log(`✓ ${spec.name} competitor snapshots upserted: ${compSnapshotRows.length} rows`);
  }

  // -------------------------------------------------------------------------
  // VERIFICATION
  // -------------------------------------------------------------------------

  console.log('\n' + '═'.repeat(57));
  console.log('SEED VERIFICATION');
  console.log('═'.repeat(57));

  // Test user
  const { data: verifyUser } = await supabase
    .from('users')
    .select('id, niche_id, sub_niche')
    .eq('email', TEST_USER_EMAIL)
    .single();

  console.log('Test user');
  if (verifyUser) {
    console.log(`✓ Found: ${TEST_USER_EMAIL} (user_id: ${verifyUser.id})`);
    console.log(verifyUser.niche_id === 'finance_crypto' ? '✓ niche_id: finance_crypto' : `❌ niche_id: ${verifyUser.niche_id} (expected: finance_crypto)`);
    console.log(verifyUser.sub_niche ? `✓ sub_niche: ${verifyUser.sub_niche}` : '❌ sub_niche: null');
  } else {
    console.log('❌ User not found');
  }

  // Competitors — fetch our 3 target competitors specifically by channel ID
  const { data: targetComps } = await supabase
    .from('competitors')
    .select('id, channel_name, tier, subscriber_count, is_dominator, sub_niche, video_count, avg_views_per_video, avg_video_length_seconds, upload_frequency_30d')
    .eq('user_id', userId)
    .in('youtube_channel_id', [SARAH_CHANNEL_ID, MARCUS_CHANNEL_ID, DOMINATOR_CHANNEL_ID]);

  const { data: activeComps } = await supabase
    .from('competitors')
    .select('id')
    .eq('user_id', userId)
    .eq('is_active', true);

  console.log('\nCompetitors (active)');
  const totalActive = activeComps?.length ?? 0;
  console.log(`✓ Total active: ${totalActive} (includes any auto-detected competitors)`);

  const sarah = targetComps?.find((c) => (c.channel_name as string).includes('Sarah'));
  const marcus = targetComps?.find((c) => (c.channel_name as string).includes('Marcus'));
  const dominator = targetComps?.find((c) => c.is_dominator === true);

  console.log(sarah ? `✓ Tier 1: ${sarah.channel_name} (${(sarah.subscriber_count as number).toLocaleString()} subs)` : '❌ Tier 1 competitor missing');
  console.log(marcus ? `✓ Tier 2: ${marcus.channel_name} (${(marcus.subscriber_count as number).toLocaleString()} subs)` : '❌ Tier 2 competitor missing');
  console.log(dominator ? `✓ Tier 3 / Dominator: ${dominator.channel_name} (${(dominator.subscriber_count as number).toLocaleString()} subs)` : '❌ Dominator competitor missing');

  const allHaveSubNiche = targetComps?.every((c) => !!c.sub_niche);
  console.log(allHaveSubNiche ? '✓ All 3 have sub_niche populated' : '❌ Some competitors missing sub_niche');

  const allHaveMetrics = targetComps?.every((c) => c.video_count != null && c.avg_views_per_video != null && c.avg_video_length_seconds != null && c.upload_frequency_30d != null);
  console.log(allHaveMetrics ? '✓ All 3 have video_count, avg_views_per_video, avg_video_length, upload_frequency_30d populated' : '❌ Some competitors missing metric columns');

  const dominatorCount = targetComps?.filter((c) => c.is_dominator).length ?? 0;
  console.log(dominatorCount === 1 ? '✓ Exactly 1 has is_dominator = true' : `❌ is_dominator count: ${dominatorCount} (expected: 1)`);

  // Own channel videos
  const { data: ownVideos } = await supabase
    .from('videos')
    .select('published_at, view_count, duration_seconds')
    .eq('user_id', userId)
    .order('published_at', { ascending: true });

  console.log('\nOwn channel videos');
  const ownCount = ownVideos?.length ?? 0;
  console.log(ownCount >= 15 ? `✓ Count: ${ownCount}` : `❌ Count: ${ownCount} (expected: ≥15)`);
  if (ownVideos && ownVideos.length > 0) {
    const oldest = ownVideos[0].published_at as string;
    const newest = ownVideos[ownVideos.length - 1].published_at as string;
    console.log(`✓ Date range: ${oldest.slice(0, 10)} to ${newest.slice(0, 10)}`);
    const avgViews = Math.round(ownVideos.reduce((s, v) => s + ((v.view_count as number) ?? 0), 0) / ownVideos.length);
    console.log(`✓ Avg views: ${avgViews.toLocaleString()}`);
    const avgDur = Math.round(ownVideos.reduce((s, v) => s + ((v.duration_seconds as number) ?? 0), 0) / ownVideos.length);
    console.log(`✓ Avg duration: ${avgDur}s (~${Math.round(avgDur / 60)} min)`);
  }

  // Competitor videos
  console.log('\nCompetitor videos');
  for (const spec of competitorSpecs) {
    const { data: cv } = await supabase
      .from('competitor_videos')
      .select('id')
      .eq('competitor_id', spec.competitorId);
    const cvCount = cv?.length ?? 0;
    const label = spec.idPrefix === 'sarah' ? 'Sarah' : spec.idPrefix === 'marcus' ? 'Marcus' : 'Wealth Empire';
    console.log(cvCount >= 10 ? `✓ ${label}: ${cvCount} videos (target: ≥10)` : `❌ ${label}: ${cvCount} videos (target: ≥10)`);
  }

  // Channel snapshots
  const { data: chanSnaps } = await supabase
    .from('channel_snapshots')
    .select('snapshot_date, subscriber_count')
    .eq('user_id', userId)
    .order('snapshot_date', { ascending: true });

  console.log('\nChannel snapshots (own channel)');
  const snapCount = chanSnaps?.length ?? 0;
  console.log(snapCount >= 30 ? `✓ Total rows: ${snapCount}` : `❌ Total rows: ${snapCount} (expected: ≥30)`);
  if (chanSnaps && chanSnaps.length > 0) {
    console.log(`✓ Date range: ${chanSnaps[0].snapshot_date} to ${chanSnaps[chanSnaps.length - 1].snapshot_date}`);
    console.log(`✓ Subscriber growth: ${(chanSnaps[0].subscriber_count as number).toLocaleString()} → ${(chanSnaps[chanSnaps.length - 1].subscriber_count as number).toLocaleString()}`);
  }

  // Competitor snapshots
  const { data: compSnaps } = await supabase
    .from('competitor_snapshots')
    .select('competitor_id, snapshot_date')
    .in('competitor_id', [sarahId, marcusId, dominatorId])
    .order('snapshot_date', { ascending: true });

  console.log('\nCompetitor snapshots');
  const totalCompSnaps = compSnaps?.length ?? 0;
  console.log(totalCompSnaps >= 90 ? `✓ Total rows: ${totalCompSnaps}` : `❌ Total rows: ${totalCompSnaps} (expected: ≥90)`);

  const sarahSnaps = compSnaps?.filter((s) => s.competitor_id === sarahId).length ?? 0;
  const marcusSnaps = compSnaps?.filter((s) => s.competitor_id === marcusId).length ?? 0;
  const domSnaps = compSnaps?.filter((s) => s.competitor_id === dominatorId).length ?? 0;
  console.log(sarahSnaps >= 30 ? `✓ Sarah snapshots: ${sarahSnaps}` : `❌ Sarah snapshots: ${sarahSnaps} (expected: ≥30)`);
  console.log(marcusSnaps >= 30 ? `✓ Marcus snapshots: ${marcusSnaps}` : `❌ Marcus snapshots: ${marcusSnaps} (expected: ≥30)`);
  console.log(domSnaps >= 30 ? `✓ Wealth Empire snapshots: ${domSnaps}` : `❌ Wealth Empire snapshots: ${domSnaps} (expected: ≥30)`);

  if (compSnaps && compSnaps.length > 0) {
    const dates = compSnaps.map((s) => s.snapshot_date as string).sort();
    console.log(`✓ Date range: ${dates[0]} to ${dates[dates.length - 1]}`);
  }

  console.log('\n' + '═'.repeat(57));

  // Determine overall pass/fail
  const checks = [
    !!verifyUser,
    verifyUser?.niche_id === 'finance_crypto',
    !!verifyUser?.sub_niche,
    !!sarah, !!marcus, !!dominator,
    !!allHaveSubNiche, !!allHaveMetrics,
    dominatorCount === 1,
    ownCount >= 15,
    snapCount >= 30,
    totalCompSnaps >= 90,
    sarahSnaps >= 30, marcusSnaps >= 30, domSnaps >= 30,
  ];

  if (checks.every(Boolean)) {
    console.log('ALL CHECKS PASSED');
  } else {
    console.log('SOME CHECKS FAILED — review ❌ lines above');
    process.exit(1);
  }

  console.log('═'.repeat(57) + '\n');
}

run().catch((err) => {
  console.error('\nSeed failed:', (err as Error).message);
  process.exit(1);
});
