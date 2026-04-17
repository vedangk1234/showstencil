import type { NicheBenchmark, RevenuePotential, BenchmarkComparison } from '../types/index';

// ─── Function 1: getNicheBenchmarks ─────────────────────────────────────────

export function getNicheBenchmarks(): Record<string, NicheBenchmark> {
  return {
    finance: {
      nicheId: 'finance',
      nicheName: 'Personal Finance',
      cpmRange: { min: 12, max: 28 },
      rpmRange: { min: 6, max: 16 },
      avgMonthlyUploads: 4,
      avgVideoDurationMinutes: 14,
      avgViewsPerVideo: { tier1: 800, tier2: 8000, tier3: 45000, tier4: 180000 },
      seasonalFactors: { q1: 0.85, q2: 0.95, q3: 0.90, q4: 1.30 },
      audienceGeographyPremium: 1.8,
      sponsorshipRatePerIntegration: { tier1: 200, tier2: 800, tier3: 3000, tier4: 12000 },
    },
    tech: {
      nicheId: 'tech',
      nicheName: 'Technology',
      cpmRange: { min: 8, max: 18 },
      rpmRange: { min: 4, max: 10 },
      avgMonthlyUploads: 6,
      avgVideoDurationMinutes: 12,
      avgViewsPerVideo: { tier1: 600, tier2: 6000, tier3: 35000, tier4: 150000 },
      seasonalFactors: { q1: 0.90, q2: 1.00, q3: 0.95, q4: 1.15 },
      audienceGeographyPremium: 1.6,
      sponsorshipRatePerIntegration: { tier1: 150, tier2: 600, tier3: 2500, tier4: 10000 },
    },
    gaming: {
      nicheId: 'gaming',
      nicheName: 'Gaming',
      cpmRange: { min: 2, max: 6 },
      rpmRange: { min: 1, max: 3.5 },
      avgMonthlyUploads: 12,
      avgVideoDurationMinutes: 16,
      avgViewsPerVideo: { tier1: 1200, tier2: 12000, tier3: 60000, tier4: 250000 },
      seasonalFactors: { q1: 0.95, q2: 1.00, q3: 1.05, q4: 1.00 },
      audienceGeographyPremium: 1.3,
      sponsorshipRatePerIntegration: { tier1: 100, tier2: 400, tier3: 1500, tier4: 6000 },
    },
    cooking: {
      nicheId: 'cooking',
      nicheName: 'Cooking & Food',
      cpmRange: { min: 4, max: 9 },
      rpmRange: { min: 2, max: 5 },
      avgMonthlyUploads: 6,
      avgVideoDurationMinutes: 12,
      avgViewsPerVideo: { tier1: 700, tier2: 7000, tier3: 40000, tier4: 160000 },
      seasonalFactors: { q1: 0.90, q2: 1.00, q3: 0.95, q4: 1.15 },
      audienceGeographyPremium: 1.4,
      sponsorshipRatePerIntegration: { tier1: 120, tier2: 500, tier3: 2000, tier4: 8000 },
    },
    fitness: {
      nicheId: 'fitness',
      nicheName: 'Fitness & Health',
      cpmRange: { min: 5, max: 11 },
      rpmRange: { min: 2.5, max: 6 },
      avgMonthlyUploads: 8,
      avgVideoDurationMinutes: 14,
      avgViewsPerVideo: { tier1: 900, tier2: 9000, tier3: 50000, tier4: 200000 },
      seasonalFactors: { q1: 1.20, q2: 1.05, q3: 0.90, q4: 0.85 },
      audienceGeographyPremium: 1.5,
      sponsorshipRatePerIntegration: { tier1: 150, tier2: 600, tier3: 2500, tier4: 10000 },
    },
    beauty: {
      nicheId: 'beauty',
      nicheName: 'Beauty & Lifestyle',
      cpmRange: { min: 4, max: 10 },
      rpmRange: { min: 2, max: 5.5 },
      avgMonthlyUploads: 6,
      avgVideoDurationMinutes: 10,
      avgViewsPerVideo: { tier1: 800, tier2: 8000, tier3: 45000, tier4: 180000 },
      seasonalFactors: { q1: 0.85, q2: 1.05, q3: 0.95, q4: 1.15 },
      audienceGeographyPremium: 1.5,
      sponsorshipRatePerIntegration: { tier1: 200, tier2: 800, tier3: 3500, tier4: 15000 },
    },
    travel: {
      nicheId: 'travel',
      nicheName: 'Travel',
      cpmRange: { min: 3, max: 8 },
      rpmRange: { min: 1.5, max: 4.5 },
      avgMonthlyUploads: 4,
      avgVideoDurationMinutes: 15,
      avgViewsPerVideo: { tier1: 500, tier2: 5000, tier3: 28000, tier4: 120000 },
      seasonalFactors: { q1: 0.80, q2: 1.10, q3: 1.20, q4: 0.90 },
      audienceGeographyPremium: 1.6,
      sponsorshipRatePerIntegration: { tier1: 150, tier2: 600, tier3: 2500, tier4: 10000 },
    },
    education: {
      nicheId: 'education',
      nicheName: 'Education',
      cpmRange: { min: 6, max: 14 },
      rpmRange: { min: 3, max: 8 },
      avgMonthlyUploads: 5,
      avgVideoDurationMinutes: 16,
      avgViewsPerVideo: { tier1: 600, tier2: 6000, tier3: 32000, tier4: 130000 },
      seasonalFactors: { q1: 1.05, q2: 1.00, q3: 0.85, q4: 0.90 },
      audienceGeographyPremium: 1.7,
      sponsorshipRatePerIntegration: { tier1: 150, tier2: 600, tier3: 2500, tier4: 10000 },
    },
    business: {
      nicheId: 'business',
      nicheName: 'Business & Entrepreneurship',
      cpmRange: { min: 10, max: 22 },
      rpmRange: { min: 5.5, max: 12 },
      avgMonthlyUploads: 4,
      avgVideoDurationMinutes: 15,
      avgViewsPerVideo: { tier1: 700, tier2: 7000, tier3: 38000, tier4: 160000 },
      seasonalFactors: { q1: 0.90, q2: 1.00, q3: 0.90, q4: 1.20 },
      audienceGeographyPremium: 1.8,
      sponsorshipRatePerIntegration: { tier1: 200, tier2: 900, tier3: 3500, tier4: 14000 },
    },
    entertainment: {
      nicheId: 'entertainment',
      nicheName: 'Entertainment',
      cpmRange: { min: 1.5, max: 5 },
      rpmRange: { min: 0.8, max: 2.8 },
      avgMonthlyUploads: 10,
      avgVideoDurationMinutes: 12,
      avgViewsPerVideo: { tier1: 1500, tier2: 15000, tier3: 80000, tier4: 350000 },
      seasonalFactors: { q1: 0.90, q2: 1.00, q3: 1.00, q4: 1.10 },
      audienceGeographyPremium: 1.2,
      sponsorshipRatePerIntegration: { tier1: 100, tier2: 400, tier3: 1800, tier4: 7000 },
    },
    diy: {
      nicheId: 'diy',
      nicheName: 'DIY & Home Improvement',
      cpmRange: { min: 3, max: 8 },
      rpmRange: { min: 1.5, max: 4.5 },
      avgMonthlyUploads: 5,
      avgVideoDurationMinutes: 14,
      avgViewsPerVideo: { tier1: 600, tier2: 6000, tier3: 32000, tier4: 130000 },
      seasonalFactors: { q1: 0.85, q2: 1.10, q3: 1.05, q4: 1.00 },
      audienceGeographyPremium: 1.4,
      sponsorshipRatePerIntegration: { tier1: 120, tier2: 500, tier3: 2000, tier4: 8000 },
    },
    vlog: {
      nicheId: 'vlog',
      nicheName: 'Vlogging & Lifestyle',
      cpmRange: { min: 1.5, max: 4 },
      rpmRange: { min: 0.8, max: 2.2 },
      avgMonthlyUploads: 8,
      avgVideoDurationMinutes: 15,
      avgViewsPerVideo: { tier1: 400, tier2: 4000, tier3: 22000, tier4: 90000 },
      seasonalFactors: { q1: 0.90, q2: 1.00, q3: 1.05, q4: 1.05 },
      audienceGeographyPremium: 1.2,
      sponsorshipRatePerIntegration: { tier1: 100, tier2: 400, tier3: 1500, tier4: 6000 },
    },
  };
}

// ─── Function 2: getSubscriberTier ──────────────────────────────────────────

export function getSubscriberTier(
  subscriberCount: number,
): 'tier1' | 'tier2' | 'tier3' | 'tier4' {
  if (subscriberCount < 10_000) return 'tier1';
  if (subscriberCount < 100_000) return 'tier2';
  if (subscriberCount < 500_000) return 'tier3';
  return 'tier4';
}

// ─── Function 3: calculateRevenuePotential ──────────────────────────────────

export function calculateRevenuePotential(
  nicheId: string,
  subscriberCount: number,
  currentAvgViews: number,
  uploadsPerMonth: number,
  currentRpm?: number,
): RevenuePotential {
  const benchmarks = getNicheBenchmarks();
  const benchmark = benchmarks[nicheId];

  if (!benchmark) {
    throw new Error(`Unknown nicheId: ${nicheId}`);
  }

  const tier = getSubscriberTier(subscriberCount);

  // When the creator's actual RPM is unknown, use the niche minimum —
  // a conservative baseline for a creator who hasn't yet optimised ad
  // settings, audience geography, or video length.
  const rpmUsed = currentRpm ?? benchmark.rpmRange.min;

  const currentMonthlyEstimate =
    currentAvgViews > 0 && uploadsPerMonth > 0
      ? (currentAvgViews * uploadsPerMonth * rpmUsed) / 1000
      : 0;

  const benchmarkAvgViews = benchmark.avgViewsPerVideo[tier];
  // Benchmark always uses max RPM — represents what a top creator in the
  // niche/tier actually earns, setting an aspirational target for the gap.
  const benchmarkRpm = benchmark.rpmRange.max;
  const benchmarkMonthlyEstimate =
    (benchmarkAvgViews * benchmark.avgMonthlyUploads * benchmarkRpm) / 1000;

  const gapMonthly = Math.max(0, benchmarkMonthlyEstimate - currentMonthlyEstimate);

  // Sponsorship potential: 2 integrations/month at tier rate
  const sponsorshipRate = benchmark.sponsorshipRatePerIntegration[tier];
  const sponsorshipPotentialMonthly = sponsorshipRate * 2;

  const totalPotentialMonthly = benchmarkMonthlyEstimate + sponsorshipPotentialMonthly;

  return {
    currentMonthlyEstimate: Math.round(currentMonthlyEstimate),
    benchmarkMonthlyEstimate: Math.round(benchmarkMonthlyEstimate),
    gapMonthly: Math.round(gapMonthly),
    gapAnnual: Math.round(gapMonthly * 12),
    currentRpmUsed: rpmUsed,
    benchmarkRpmUsed: benchmarkRpm,
    subscriberTier: tier,
    sponsorshipPotentialMonthly: Math.round(sponsorshipPotentialMonthly),
    totalPotentialMonthly: Math.round(totalPotentialMonthly),
    dataSource: 'ShowStencil niche benchmark database v1',
  };
}

// ─── Function 4: getBenchmarkComparison ─────────────────────────────────────

export function getBenchmarkComparison(
  nicheId: string,
  subscriberCount: number,
  userMetrics: {
    avgViewsPerVideo: number;
    uploadsPerMonth: number;
    avgViewDurationSeconds: number;
    ctr: number;
  },
): BenchmarkComparison {
  const benchmarks = getNicheBenchmarks();
  const benchmark = benchmarks[nicheId];

  if (!benchmark) {
    throw new Error(`Unknown nicheId: ${nicheId}`);
  }

  const tier = getSubscriberTier(subscriberCount);
  const benchmarkAvgViews = benchmark.avgViewsPerVideo[tier];
  const benchmarkUploads = benchmark.avgMonthlyUploads;
  const benchmarkDurationSeconds = benchmark.avgVideoDurationMinutes * 60;

  const pctDiff = (user: number, bench: number): number =>
    bench === 0 ? 0 : Math.round(((user - bench) / bench) * 100);

  const viewsVsBenchmark = {
    userValue: userMetrics.avgViewsPerVideo,
    benchmarkValue: benchmarkAvgViews,
    percentageDiff: pctDiff(userMetrics.avgViewsPerVideo, benchmarkAvgViews),
  };

  const uploadsVsBenchmark = {
    userValue: userMetrics.uploadsPerMonth,
    benchmarkValue: benchmarkUploads,
    percentageDiff: pctDiff(userMetrics.uploadsPerMonth, benchmarkUploads),
  };

  const durationVsBenchmark = {
    userValue: userMetrics.avgViewDurationSeconds,
    benchmarkValue: benchmarkDurationSeconds,
    percentageDiff: pctDiff(userMetrics.avgViewDurationSeconds, benchmarkDurationSeconds),
  };

  const revenuePotential = calculateRevenuePotential(
    nicheId,
    subscriberCount,
    userMetrics.avgViewsPerVideo,
    userMetrics.uploadsPerMonth,
  );

  // Find the biggest gap to surface as the top insight
  const gaps: Array<{ label: string; diff: number }> = [
    { label: 'views', diff: viewsVsBenchmark.percentageDiff },
    { label: 'upload frequency', diff: uploadsVsBenchmark.percentageDiff },
    { label: 'video length', diff: durationVsBenchmark.percentageDiff },
  ];

  // Sort by most negative (biggest shortfall first)
  gaps.sort((a, b) => a.diff - b.diff);
  const biggest = gaps[0];

  let topInsight: string;
  if (biggest.diff >= 0) {
    topInsight = `You are at or above the ${benchmark.nicheName} benchmark across all tracked metrics — focus on consistency and increasing upload frequency to compound your growth.`;
  } else {
    const absBehind = Math.abs(biggest.diff);
    if (biggest.label === 'views') {
      topInsight = `Your average views per video are ${absBehind}% below the ${benchmark.nicheName} benchmark for your subscriber tier — closing this gap could add $${revenuePotential.gapMonthly.toLocaleString()} per month in AdSense revenue.`;
    } else if (biggest.label === 'upload frequency') {
      topInsight = `You are uploading ${absBehind}% less than the average ${benchmark.nicheName} creator at your tier — increasing cadence to ${benchmarkUploads} videos/month is your fastest lever for growth.`;
    } else {
      topInsight = `Your average video length is ${absBehind}% shorter than the ${benchmark.nicheName} benchmark — longer watch sessions signal quality to the algorithm and improve suggested traffic.`;
    }
  }

  return {
    niche: benchmark,
    tier,
    viewsVsBenchmark,
    uploadsVsBenchmark,
    durationVsBenchmark,
    revenuePotential,
    topInsight,
  };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

if (process.env.RUN_BENCHMARK_TEST === 'true') {
  console.log('\n=== Revenue Benchmark Tests ===\n');

  // Test 1 — Finance creator, 45K subs, 8400 avg views, 2 uploads/month
  console.log('--- Test 1: Finance creator (45K subs, 8400 avg views, 2 uploads/month) ---');
  const t1 = calculateRevenuePotential('finance', 45_000, 8_400, 2);
  console.log(`  Subscriber tier:         ${t1.subscriberTier}`);
  console.log(`  RPM used:                $${t1.currentRpmUsed}`);
  console.log(`  Benchmark RPM:           $${t1.benchmarkRpmUsed}`);
  console.log(`  Current monthly est:     $${t1.currentMonthlyEstimate}`);
  console.log(`  Benchmark monthly est:   $${t1.benchmarkMonthlyEstimate}`);
  console.log(`  Monthly gap:             $${t1.gapMonthly}`);
  console.log(`  Annual gap:              $${t1.gapAnnual}`);
  console.log(`  Sponsorship potential:   $${t1.sponsorshipPotentialMonthly}/month`);
  console.log(`  Total potential:         $${t1.totalPotentialMonthly}/month`);
  console.log(`  Data source:             ${t1.dataSource}`);

  const t1Pass =
    t1.currentMonthlyEstimate >= 90 &&
    t1.currentMonthlyEstimate <= 150 &&
    t1.benchmarkMonthlyEstimate >= 400 &&
    t1.benchmarkMonthlyEstimate <= 600 &&
    t1.gapMonthly >= 300 &&
    t1.gapMonthly <= 520;
  console.log(`  PASS: ${t1Pass ? '✓' : '✗ — check formula'}`);

  // Test 2 — Gaming creator, 80K subs, 25000 avg views, 8 uploads/month
  console.log('\n--- Test 2: Gaming creator (80K subs, 25K avg views, 8 uploads/month) ---');
  const t2 = calculateRevenuePotential('gaming', 80_000, 25_000, 8);
  console.log(`  Subscriber tier:         ${t2.subscriberTier}`);
  console.log(`  Current monthly est:     $${t2.currentMonthlyEstimate}`);
  console.log(`  Benchmark monthly est:   $${t2.benchmarkMonthlyEstimate}`);
  console.log(`  Monthly gap:             $${t2.gapMonthly}`);
  console.log(`  Annual gap:              $${t2.gapAnnual}`);

  // Gaming creator has 25K avg views vs 12K benchmark — they are above average
  // in views. benchmarkMonthly uses max RPM ($3.5) so can slightly exceed $500.
  const t2Pass =
    t2.currentMonthlyEstimate >= 200 &&
    t2.currentMonthlyEstimate <= 400 &&
    t2.benchmarkMonthlyEstimate >= 300 &&
    t2.benchmarkMonthlyEstimate <= 550;
  console.log(`  PASS: ${t2Pass ? '✓' : '✗ — check formula'}`);

  // Test 3 — getBenchmarkComparison for finance creator
  console.log('\n--- Test 3: getBenchmarkComparison (finance, 45K subs) ---');
  const t3 = getBenchmarkComparison('finance', 45_000, {
    avgViewsPerVideo: 8_400,
    uploadsPerMonth: 2,
    avgViewDurationSeconds: 480,
    ctr: 0.031,
  });
  console.log(`  Tier:                    ${t3.tier}`);
  console.log(`  Views vs benchmark:      ${t3.viewsVsBenchmark.userValue} vs ${t3.viewsVsBenchmark.benchmarkValue} (${t3.viewsVsBenchmark.percentageDiff}%)`);
  console.log(`  Uploads vs benchmark:    ${t3.uploadsVsBenchmark.userValue} vs ${t3.uploadsVsBenchmark.benchmarkValue} (${t3.uploadsVsBenchmark.percentageDiff}%)`);
  console.log(`  Duration vs benchmark:   ${t3.durationVsBenchmark.userValue}s vs ${t3.durationVsBenchmark.benchmarkValue}s (${t3.durationVsBenchmark.percentageDiff}%)`);
  console.log(`  Top insight:             ${t3.topInsight}`);

  const t3Pass = t3.topInsight.length > 20 && t3.tier === 'tier2';
  console.log(`  PASS: ${t3Pass ? '✓' : '✗'}`);

  console.log('\n=== All tests complete ===\n');
}
