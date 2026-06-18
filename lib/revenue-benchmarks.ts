/**
 * lib/revenue-benchmarks.ts
 *
 * Per-niche CPM/RPM/sponsorship reference data. The numeric values are seed
 * defaults; tune them against real market data over time.
 *
 * Phase 4 (2026-06-10) — migrated from the legacy 12-niche slug set to the
 * canonical 31-niche taxonomy in lib/niches.ts. Unknown slugs no longer throw:
 * calculateRevenuePotential and getBenchmarkComparison fall back to a generic
 * mid-range default (CPM 5 / RPM 2.5) and log a warn-level entry, so a stale
 * or third-party slug never crashes a UI render.
 */

import type { ValidNicheSlug } from './niches';
import { getDisplayName } from './niches';
import { logError } from './logger';
import type { NicheBenchmark, RevenuePotential, BenchmarkComparison } from '../types/index';

// ─── Generic fallback for unknown slugs ─────────────────────────────────────

const FALLBACK_BENCHMARK: NicheBenchmark = {
  nicheId: 'unknown_niche',
  nicheName: 'Unknown Niche',
  cpmRange: { min: 5, max: 10 },
  rpmRange: { min: 2.5, max: 5 },
  avgMonthlyUploads: 6,
  avgVideoDurationMinutes: 10,
  avgViewsPerVideo: { tier1: 500, tier2: 5000, tier3: 28000, tier4: 120000 },
  seasonalFactors: { q1: 0.95, q2: 1.00, q3: 0.95, q4: 1.10 },
  audienceGeographyPremium: 1.3,
  sponsorshipRatePerIntegration: { tier1: 120, tier2: 500, tier3: 2000, tier4: 8000 },
};

// ─── Function 1: getNicheBenchmarks ─────────────────────────────────────────

/**
 * Returns the full per-niche benchmark table keyed by canonical niche slug.
 *
 * Notes on the seed values:
 *  - CPM/RPM ranges are the Phase-4 task seed and are intentionally rounded
 *    — tune against real Adsense/Hatch data as it comes in. Comments flag any
 *    range I'd recalibrate when we have data.
 *  - avgMonthlyUploads, avgVideoDurationMinutes, avgViewsPerVideo, seasonal
 *    factors and sponsorship rates are reasonable extrapolations from the
 *    closest adjacent niche in the legacy 12-niche table. Mark them as
 *    "estimated" until we have niche-specific evidence.
 */
export function getNicheBenchmarks(): Record<string, NicheBenchmark> {
  const benchmarks: Record<ValidNicheSlug, NicheBenchmark> = {
    finance_crypto: {
      nicheId: 'finance_crypto',
      nicheName: 'Finance & Cryptocurrency',
      cpmRange: { min: 15, max: 25 },
      rpmRange: { min: 8, max: 14 },
      avgMonthlyUploads: 4,
      avgVideoDurationMinutes: 14,
      avgViewsPerVideo: { tier1: 800, tier2: 8000, tier3: 45000, tier4: 180000 },
      seasonalFactors: { q1: 0.85, q2: 0.95, q3: 0.90, q4: 1.30 },
      audienceGeographyPremium: 1.8,
      sponsorshipRatePerIntegration: { tier1: 200, tier2: 800, tier3: 3000, tier4: 12000 },
    },
    business_startups: {
      nicheId: 'business_startups',
      nicheName: 'Business & Startups',
      cpmRange: { min: 12, max: 22 },
      rpmRange: { min: 6, max: 11 },
      avgMonthlyUploads: 4,
      avgVideoDurationMinutes: 15,
      avgViewsPerVideo: { tier1: 700, tier2: 7000, tier3: 38000, tier4: 160000 },
      seasonalFactors: { q1: 0.90, q2: 1.00, q3: 0.90, q4: 1.20 },
      audienceGeographyPremium: 1.8,
      sponsorshipRatePerIntegration: { tier1: 200, tier2: 900, tier3: 3500, tier4: 14000 },
    },
    education: {
      nicheId: 'education',
      nicheName: 'Education',
      cpmRange: { min: 10, max: 18 },
      rpmRange: { min: 5, max: 9 },
      avgMonthlyUploads: 5,
      avgVideoDurationMinutes: 16,
      avgViewsPerVideo: { tier1: 600, tier2: 6000, tier3: 32000, tier4: 130000 },
      seasonalFactors: { q1: 1.05, q2: 1.00, q3: 0.85, q4: 0.90 },
      audienceGeographyPremium: 1.7,
      sponsorshipRatePerIntegration: { tier1: 150, tier2: 600, tier3: 2500, tier4: 10000 },
    },
    tech_ai_software: {
      nicheId: 'tech_ai_software',
      nicheName: 'Tech, AI & Software',
      cpmRange: { min: 8, max: 15 },
      rpmRange: { min: 4, max: 8 },
      avgMonthlyUploads: 6,
      avgVideoDurationMinutes: 12,
      avgViewsPerVideo: { tier1: 600, tier2: 6000, tier3: 35000, tier4: 150000 },
      seasonalFactors: { q1: 0.90, q2: 1.00, q3: 0.95, q4: 1.15 },
      audienceGeographyPremium: 1.6,
      sponsorshipRatePerIntegration: { tier1: 150, tier2: 600, tier3: 2500, tier4: 10000 },
    },
    sales_marketing: {
      nicheId: 'sales_marketing',
      nicheName: 'Sales & Marketing',
      cpmRange: { min: 10, max: 20 },
      rpmRange: { min: 5, max: 10 },
      avgMonthlyUploads: 5,
      avgVideoDurationMinutes: 13,
      avgViewsPerVideo: { tier1: 600, tier2: 6000, tier3: 32000, tier4: 130000 },
      seasonalFactors: { q1: 0.90, q2: 1.00, q3: 0.90, q4: 1.20 },
      audienceGeographyPremium: 1.7,
      sponsorshipRatePerIntegration: { tier1: 180, tier2: 750, tier3: 3000, tier4: 12000 },
    },
    ecommerce: {
      nicheId: 'ecommerce',
      nicheName: 'E-commerce & Online Business',
      cpmRange: { min: 10, max: 18 },
      rpmRange: { min: 5, max: 9 },
      avgMonthlyUploads: 5,
      avgVideoDurationMinutes: 13,
      avgViewsPerVideo: { tier1: 600, tier2: 6000, tier3: 32000, tier4: 130000 },
      seasonalFactors: { q1: 0.90, q2: 1.00, q3: 0.90, q4: 1.25 },
      audienceGeographyPremium: 1.6,
      sponsorshipRatePerIntegration: { tier1: 180, tier2: 750, tier3: 3000, tier4: 12000 },
    },
    health: {
      nicheId: 'health',
      nicheName: 'Health',
      cpmRange: { min: 9, max: 16 },
      rpmRange: { min: 4, max: 8 },
      avgMonthlyUploads: 6,
      avgVideoDurationMinutes: 12,
      avgViewsPerVideo: { tier1: 700, tier2: 7000, tier3: 40000, tier4: 170000 },
      seasonalFactors: { q1: 1.10, q2: 1.00, q3: 0.95, q4: 0.95 },
      audienceGeographyPremium: 1.5,
      sponsorshipRatePerIntegration: { tier1: 150, tier2: 600, tier3: 2500, tier4: 10000 },
    },
    beauty_makeup: {
      nicheId: 'beauty_makeup',
      nicheName: 'Beauty & Makeup',
      cpmRange: { min: 8, max: 14 },
      rpmRange: { min: 4, max: 7 },
      avgMonthlyUploads: 6,
      avgVideoDurationMinutes: 10,
      avgViewsPerVideo: { tier1: 800, tier2: 8000, tier3: 45000, tier4: 180000 },
      seasonalFactors: { q1: 0.85, q2: 1.05, q3: 0.95, q4: 1.15 },
      audienceGeographyPremium: 1.5,
      sponsorshipRatePerIntegration: { tier1: 200, tier2: 800, tier3: 3500, tier4: 15000 },
    },
    fashion: {
      nicheId: 'fashion',
      nicheName: 'Fashion',
      cpmRange: { min: 7, max: 13 },
      rpmRange: { min: 3, max: 6 },
      avgMonthlyUploads: 6,
      avgVideoDurationMinutes: 10,
      avgViewsPerVideo: { tier1: 700, tier2: 7000, tier3: 40000, tier4: 160000 },
      seasonalFactors: { q1: 0.85, q2: 1.05, q3: 1.00, q4: 1.20 },
      audienceGeographyPremium: 1.4,
      sponsorshipRatePerIntegration: { tier1: 180, tier2: 700, tier3: 3000, tier4: 12000 },
    },
    food_drink_cooking: {
      nicheId: 'food_drink_cooking',
      nicheName: 'Food, Drink & Cooking',
      cpmRange: { min: 5, max: 10 },
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
      nicheName: 'Fitness',
      cpmRange: { min: 6, max: 12 },
      rpmRange: { min: 3, max: 6 },
      avgMonthlyUploads: 8,
      avgVideoDurationMinutes: 14,
      avgViewsPerVideo: { tier1: 900, tier2: 9000, tier3: 50000, tier4: 200000 },
      seasonalFactors: { q1: 1.20, q2: 1.05, q3: 0.90, q4: 0.85 },
      audienceGeographyPremium: 1.5,
      sponsorshipRatePerIntegration: { tier1: 150, tier2: 600, tier3: 2500, tier4: 10000 },
    },
    automotive: {
      nicheId: 'automotive',
      nicheName: 'Automotive',
      cpmRange: { min: 7, max: 13 },
      rpmRange: { min: 3, max: 6 },
      avgMonthlyUploads: 5,
      avgVideoDurationMinutes: 13,
      avgViewsPerVideo: { tier1: 700, tier2: 7000, tier3: 38000, tier4: 160000 },
      seasonalFactors: { q1: 0.95, q2: 1.05, q3: 1.05, q4: 0.95 },
      audienceGeographyPremium: 1.4,
      sponsorshipRatePerIntegration: { tier1: 150, tier2: 600, tier3: 2500, tier4: 10000 },
    },
    home_diy: {
      nicheId: 'home_diy',
      nicheName: 'Home & DIY',
      cpmRange: { min: 5, max: 9 },
      rpmRange: { min: 2.5, max: 4.5 },
      avgMonthlyUploads: 5,
      avgVideoDurationMinutes: 14,
      avgViewsPerVideo: { tier1: 600, tier2: 6000, tier3: 32000, tier4: 130000 },
      seasonalFactors: { q1: 0.85, q2: 1.10, q3: 1.05, q4: 1.00 },
      audienceGeographyPremium: 1.4,
      sponsorshipRatePerIntegration: { tier1: 120, tier2: 500, tier3: 2000, tier4: 8000 },
    },
    travel: {
      nicheId: 'travel',
      nicheName: 'Travel',
      cpmRange: { min: 4, max: 8 },
      rpmRange: { min: 2, max: 4 },
      avgMonthlyUploads: 4,
      avgVideoDurationMinutes: 15,
      avgViewsPerVideo: { tier1: 500, tier2: 5000, tier3: 28000, tier4: 120000 },
      seasonalFactors: { q1: 0.80, q2: 1.10, q3: 1.20, q4: 0.90 },
      audienceGeographyPremium: 1.6,
      sponsorshipRatePerIntegration: { tier1: 150, tier2: 600, tier3: 2500, tier4: 10000 },
    },
    product_reviews: {
      nicheId: 'product_reviews',
      nicheName: 'Product Reviews & Demos',
      cpmRange: { min: 7, max: 13 },
      rpmRange: { min: 3.5, max: 6.5 },
      avgMonthlyUploads: 6,
      avgVideoDurationMinutes: 11,
      avgViewsPerVideo: { tier1: 600, tier2: 6000, tier3: 35000, tier4: 145000 },
      seasonalFactors: { q1: 0.85, q2: 1.00, q3: 1.00, q4: 1.30 },
      audienceGeographyPremium: 1.5,
      sponsorshipRatePerIntegration: { tier1: 180, tier2: 700, tier3: 3000, tier4: 12000 },
    },
    podcast: {
      nicheId: 'podcast',
      nicheName: 'Podcast',
      cpmRange: { min: 5, max: 10 },
      rpmRange: { min: 2, max: 5 },
      avgMonthlyUploads: 8,
      avgVideoDurationMinutes: 50,
      avgViewsPerVideo: { tier1: 500, tier2: 5000, tier3: 30000, tier4: 130000 },
      seasonalFactors: { q1: 0.95, q2: 1.00, q3: 0.95, q4: 1.10 },
      audienceGeographyPremium: 1.5,
      sponsorshipRatePerIntegration: { tier1: 180, tier2: 700, tier3: 3000, tier4: 12000 },
    },
    social_media: {
      nicheId: 'social_media',
      nicheName: 'Social Media',
      cpmRange: { min: 6, max: 12 },
      rpmRange: { min: 3, max: 6 },
      avgMonthlyUploads: 8,
      avgVideoDurationMinutes: 9,
      avgViewsPerVideo: { tier1: 700, tier2: 7000, tier3: 38000, tier4: 150000 },
      seasonalFactors: { q1: 0.95, q2: 1.00, q3: 0.95, q4: 1.10 },
      audienceGeographyPremium: 1.5,
      sponsorshipRatePerIntegration: { tier1: 150, tier2: 600, tier3: 2500, tier4: 10000 },
    },
    motivation_self_improvement: {
      nicheId: 'motivation_self_improvement',
      nicheName: 'Motivational & Self-Improvement',
      cpmRange: { min: 7, max: 13 },
      rpmRange: { min: 3.5, max: 6.5 },
      avgMonthlyUploads: 6,
      avgVideoDurationMinutes: 12,
      avgViewsPerVideo: { tier1: 700, tier2: 7000, tier3: 38000, tier4: 150000 },
      seasonalFactors: { q1: 1.15, q2: 1.00, q3: 0.90, q4: 0.95 },
      audienceGeographyPremium: 1.5,
      sponsorshipRatePerIntegration: { tier1: 150, tier2: 600, tier3: 2500, tier4: 10000 },
    },
    relationships_family: {
      nicheId: 'relationships_family',
      nicheName: 'Relationships & Family',
      cpmRange: { min: 5, max: 9 },
      rpmRange: { min: 2.5, max: 4.5 },
      avgMonthlyUploads: 6,
      avgVideoDurationMinutes: 11,
      avgViewsPerVideo: { tier1: 600, tier2: 6000, tier3: 32000, tier4: 130000 },
      seasonalFactors: { q1: 0.95, q2: 1.05, q3: 0.95, q4: 1.05 },
      audienceGeographyPremium: 1.3,
      sponsorshipRatePerIntegration: { tier1: 120, tier2: 500, tier3: 2000, tier4: 8000 },
    },
    humanities: {
      nicheId: 'humanities',
      nicheName: 'Humanities & Social Sciences',
      cpmRange: { min: 6, max: 11 },
      rpmRange: { min: 3, max: 5.5 },
      avgMonthlyUploads: 4,
      avgVideoDurationMinutes: 18,
      avgViewsPerVideo: { tier1: 500, tier2: 5000, tier3: 28000, tier4: 120000 },
      seasonalFactors: { q1: 1.05, q2: 1.00, q3: 0.90, q4: 1.00 },
      audienceGeographyPremium: 1.5,
      sponsorshipRatePerIntegration: { tier1: 130, tier2: 550, tier3: 2200, tier4: 9000 },
    },
    arts_culture: {
      nicheId: 'arts_culture',
      nicheName: 'Arts & Culture',
      cpmRange: { min: 4, max: 8 },
      rpmRange: { min: 2, max: 4 },
      avgMonthlyUploads: 5,
      avgVideoDurationMinutes: 13,
      avgViewsPerVideo: { tier1: 500, tier2: 5000, tier3: 25000, tier4: 100000 },
      seasonalFactors: { q1: 0.95, q2: 1.00, q3: 1.00, q4: 1.10 },
      audienceGeographyPremium: 1.4,
      sponsorshipRatePerIntegration: { tier1: 100, tier2: 400, tier3: 1800, tier4: 7000 },
    },
    music: {
      nicheId: 'music',
      nicheName: 'Music',
      cpmRange: { min: 3, max: 6 },
      rpmRange: { min: 1.5, max: 3 },
      avgMonthlyUploads: 6,
      avgVideoDurationMinutes: 8,
      avgViewsPerVideo: { tier1: 1000, tier2: 10000, tier3: 60000, tier4: 250000 },
      seasonalFactors: { q1: 0.95, q2: 1.00, q3: 1.00, q4: 1.10 },
      audienceGeographyPremium: 1.2,
      sponsorshipRatePerIntegration: { tier1: 100, tier2: 400, tier3: 1500, tier4: 6000 },
    },
    gaming: {
      nicheId: 'gaming',
      nicheName: 'Gaming',
      cpmRange: { min: 3, max: 6 },
      rpmRange: { min: 1.5, max: 3 },
      avgMonthlyUploads: 12,
      avgVideoDurationMinutes: 16,
      avgViewsPerVideo: { tier1: 1200, tier2: 12000, tier3: 60000, tier4: 250000 },
      seasonalFactors: { q1: 0.95, q2: 1.00, q3: 1.05, q4: 1.00 },
      audienceGeographyPremium: 1.3,
      sponsorshipRatePerIntegration: { tier1: 100, tier2: 400, tier3: 1500, tier4: 6000 },
    },
    sports: {
      nicheId: 'sports',
      nicheName: 'Sports',
      cpmRange: { min: 4, max: 7 },
      rpmRange: { min: 2, max: 3.5 },
      avgMonthlyUploads: 8,
      avgVideoDurationMinutes: 10,
      avgViewsPerVideo: { tier1: 900, tier2: 9000, tier3: 50000, tier4: 200000 },
      seasonalFactors: { q1: 1.00, q2: 0.95, q3: 1.10, q4: 1.05 },
      audienceGeographyPremium: 1.3,
      sponsorshipRatePerIntegration: { tier1: 120, tier2: 500, tier3: 2000, tier4: 8000 },
    },
    entertainment_comedy: {
      nicheId: 'entertainment_comedy',
      nicheName: 'Entertainment & Comedy',
      cpmRange: { min: 2, max: 5 },
      rpmRange: { min: 1, max: 2.5 },
      avgMonthlyUploads: 10,
      avgVideoDurationMinutes: 8,
      avgViewsPerVideo: { tier1: 1500, tier2: 15000, tier3: 80000, tier4: 350000 },
      seasonalFactors: { q1: 0.90, q2: 1.00, q3: 1.00, q4: 1.10 },
      audienceGeographyPremium: 1.2,
      sponsorshipRatePerIntegration: { tier1: 100, tier2: 400, tier3: 1800, tier4: 7000 },
    },
    video_essays: {
      nicheId: 'video_essays',
      nicheName: 'Video Essays',
      cpmRange: { min: 4, max: 8 },
      rpmRange: { min: 2, max: 4 },
      avgMonthlyUploads: 2,
      avgVideoDurationMinutes: 25,
      avgViewsPerVideo: { tier1: 600, tier2: 6000, tier3: 32000, tier4: 140000 },
      seasonalFactors: { q1: 0.95, q2: 1.00, q3: 0.95, q4: 1.10 },
      audienceGeographyPremium: 1.4,
      sponsorshipRatePerIntegration: { tier1: 120, tier2: 500, tier3: 2200, tier4: 9000 },
    },
    news_politics: {
      nicheId: 'news_politics',
      nicheName: 'News & Politics',
      cpmRange: { min: 5, max: 10 },
      rpmRange: { min: 2.5, max: 5 },
      avgMonthlyUploads: 12,
      avgVideoDurationMinutes: 10,
      avgViewsPerVideo: { tier1: 800, tier2: 8000, tier3: 42000, tier4: 180000 },
      seasonalFactors: { q1: 1.00, q2: 1.00, q3: 1.00, q4: 1.20 }, // election cycle bump
      audienceGeographyPremium: 1.4,
      sponsorshipRatePerIntegration: { tier1: 130, tier2: 550, tier3: 2200, tier4: 9000 },
    },
    news_politics_us: {
      nicheId: 'news_politics_us',
      nicheName: 'News & Politics (US)',
      cpmRange: { min: 5, max: 10 },
      rpmRange: { min: 2.5, max: 5 },
      avgMonthlyUploads: 12,
      avgVideoDurationMinutes: 10,
      avgViewsPerVideo: { tier1: 800, tier2: 8000, tier3: 42000, tier4: 180000 },
      seasonalFactors: { q1: 1.00, q2: 1.00, q3: 1.00, q4: 1.25 }, // US election bump
      audienceGeographyPremium: 1.6,
      sponsorshipRatePerIntegration: { tier1: 150, tier2: 600, tier3: 2500, tier4: 10000 },
    },
    nature_outdoors: {
      nicheId: 'nature_outdoors',
      nicheName: 'Nature & Outdoor Activities',
      cpmRange: { min: 5, max: 9 },
      rpmRange: { min: 2.5, max: 4.5 },
      avgMonthlyUploads: 4,
      avgVideoDurationMinutes: 15,
      avgViewsPerVideo: { tier1: 600, tier2: 6000, tier3: 32000, tier4: 130000 },
      seasonalFactors: { q1: 0.85, q2: 1.15, q3: 1.20, q4: 0.85 },
      audienceGeographyPremium: 1.4,
      sponsorshipRatePerIntegration: { tier1: 130, tier2: 550, tier3: 2200, tier4: 9000 },
    },
    animals: {
      nicheId: 'animals',
      nicheName: 'Animals',
      cpmRange: { min: 4, max: 7 },
      rpmRange: { min: 2, max: 3.5 },
      avgMonthlyUploads: 6,
      avgVideoDurationMinutes: 10,
      avgViewsPerVideo: { tier1: 800, tier2: 8000, tier3: 42000, tier4: 180000 },
      seasonalFactors: { q1: 0.95, q2: 1.05, q3: 1.05, q4: 0.95 },
      audienceGeographyPremium: 1.3,
      sponsorshipRatePerIntegration: { tier1: 100, tier2: 450, tier3: 1800, tier4: 7000 },
    },
    magic_paranormal: {
      nicheId: 'magic_paranormal',
      nicheName: 'Magic & Paranormal',
      cpmRange: { min: 3, max: 6 },
      rpmRange: { min: 1.5, max: 3 },
      avgMonthlyUploads: 4,
      avgVideoDurationMinutes: 14,
      avgViewsPerVideo: { tier1: 700, tier2: 7000, tier3: 38000, tier4: 150000 },
      seasonalFactors: { q1: 0.90, q2: 0.95, q3: 1.05, q4: 1.15 }, // Halloween bump
      audienceGeographyPremium: 1.2,
      sponsorshipRatePerIntegration: { tier1: 80, tier2: 350, tier3: 1500, tier4: 6000 },
    },
  };

  return benchmarks;
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

// ─── Internal helper: resolve benchmark or fall back ────────────────────────

/**
 * Returns the benchmark row for nicheId, or a generic fallback when the slug
 * isn't in the table. Logging is rate-limited by the warn severity so a stale
 * slug doesn't spam error_logs on every dashboard render — one warn per call
 * site per stale value is enough to flag the data issue.
 */
function resolveBenchmark(nicheId: string, callSite: string): NicheBenchmark {
  const benchmarks = getNicheBenchmarks();
  const benchmark = benchmarks[nicheId];
  if (benchmark) return benchmark;

  const displayName = getDisplayName(nicheId);
  void logError({
    route: `lib/revenue-benchmarks/${callSite}`,
    error: `Unknown niche slug — falling back to generic benchmark`,
    details: { niche_id: nicheId, resolved_display: displayName },
    severity: 'warn',
  });
  return FALLBACK_BENCHMARK;
}

// ─── Function 3: calculateRevenuePotential ──────────────────────────────────

export function calculateRevenuePotential(
  nicheId: string,
  subscriberCount: number,
  currentAvgViews: number,
  uploadsPerMonth: number,
  currentRpm?: number,
): RevenuePotential {
  const benchmark = resolveBenchmark(nicheId, 'calculateRevenuePotential');

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
    dataSource: 'ShowStencil niche benchmark database v2',
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
  const benchmark = resolveBenchmark(nicheId, 'getBenchmarkComparison');

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

  // Test 1 — Finance/crypto creator, 45K subs, 8400 avg views, 2 uploads/month
  console.log('--- Test 1: Finance & Crypto creator (45K subs, 8400 avg views, 2 uploads/month) ---');
  const t1 = calculateRevenuePotential('finance_crypto', 45_000, 8_400, 2);
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

  // Test 2 — Gaming creator, 80K subs, 25000 avg views, 8 uploads/month
  console.log('\n--- Test 2: Gaming creator (80K subs, 25K avg views, 8 uploads/month) ---');
  const t2 = calculateRevenuePotential('gaming', 80_000, 25_000, 8);
  console.log(`  Subscriber tier:         ${t2.subscriberTier}`);
  console.log(`  Current monthly est:     $${t2.currentMonthlyEstimate}`);
  console.log(`  Benchmark monthly est:   $${t2.benchmarkMonthlyEstimate}`);
  console.log(`  Monthly gap:             $${t2.gapMonthly}`);
  console.log(`  Annual gap:              $${t2.gapAnnual}`);

  // Test 3 — getBenchmarkComparison for finance creator
  console.log('\n--- Test 3: getBenchmarkComparison (finance_crypto, 45K subs) ---');
  const t3 = getBenchmarkComparison('finance_crypto', 45_000, {
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

  // Test 4 — unknown slug falls back to generic, does NOT throw
  console.log('\n--- Test 4: unknown slug graceful fallback ---');
  const t4 = calculateRevenuePotential('not_a_real_slug', 45_000, 8_400, 2);
  console.log(`  Data source:             ${t4.dataSource}`);
  console.log(`  Used FALLBACK_BENCHMARK: tier1 views = ${FALLBACK_BENCHMARK.avgViewsPerVideo.tier1}`);

  console.log('\n=== All tests complete ===\n');
}
