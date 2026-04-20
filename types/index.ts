// Plan types
export type PlanType = 'free' | 'starter' | 'pro';
export type SubscriptionStatus = 'free' | 'on_trial' | 'active' | 'past_due' | 'cancelled' | 'paused';

// User
export interface User {
  id: string;
  email: string;
  name: string | null;
  image: string | null;
  youtube_channel_id: string | null;
  youtube_access_token: string | null;
  youtube_refresh_token: string | null;
  token_expires_at: string | null;
  niche_id: string | null;
  niche_detected_at: string | null;
  sub_niche: string | null;
  sub_niche_keywords: string[] | null;
  sub_niche_confidence: number | null;
  sub_niche_detected_at: string | null;
  subscription_status: SubscriptionStatus;
  subscription_plan: PlanType;
  lemon_squeezy_customer_id: string | null;
  lemon_squeezy_subscription_id: string | null;
  trial_ends_at: string | null;
  current_period_end: string | null;
  onboarding_completed: boolean;
  created_at: string;
  updated_at: string;
}

// Channel snapshot (user's own data, stored daily)
export interface ChannelSnapshot {
  id: string;
  user_id: string;
  snapshot_date: string;
  subscriber_count: number | null;
  total_views: number | null;
  videos_count: number | null;
  avg_views_per_video: number | null;
  avg_ctr: number | null;
  avg_view_duration_seconds: number | null;
  avg_like_ratio: number | null;
  estimated_monthly_revenue: number | null;
  rpm: number | null;
  momentum_score: number | null;
  created_at: string;
}

// Video (user's own videos with full analytics)
export interface Video {
  id: string;
  user_id: string;
  youtube_video_id: string;
  title: string | null;
  published_at: string | null;
  duration_seconds: number | null;
  view_count: number | null;
  like_count: number | null;
  comment_count: number | null;
  share_count: number | null;
  save_count: number | null;
  ctr: number | null;
  avg_view_duration_seconds: number | null;
  retention_percentage: number | null;
  impressions: number | null;
  traffic_source_search: number | null;
  traffic_source_suggested: number | null;
  traffic_source_browse: number | null;
  traffic_source_external: number | null;
  subscriber_gain: number | null;
  revenue_estimate: number | null;
  rpm: number | null;
  thumbnail_url: string | null;
  performance_score: number | null;
  synced_at: string;
}

// Competitor (channels tracked for each user)
export interface Competitor {
  id: string;
  user_id: string;
  youtube_channel_id: string;
  channel_name: string | null;
  channel_thumbnail: string | null;
  subscriber_count: number | null;
  total_views: number | null;
  tier: 1 | 2 | 3; // 1 = similar, 2 = aspirational, 3 = dominator
  is_auto_detected: boolean;
  is_active: boolean;
  is_dominator: boolean;
  is_searched: boolean;
  searched_at: string | null;
  sub_niche: string | null;
  sub_niche_keywords: string[] | null;
  sub_niche_match_score: number | null;
  last_synced_at: string | null;
  created_at: string;
}

// Competitor video (public data only)
export interface CompetitorVideo {
  id: string;
  competitor_id: string;
  youtube_video_id: string;
  title: string | null;
  published_at: string | null;
  view_count: number | null;
  like_count: number | null;
  comment_count: number | null;
  duration_seconds: number | null;
  thumbnail_url: string | null;
  velocity_score: number | null; // views per hour in first 48hrs
  performance_vs_avg: number | null; // ratio vs that channel's average
  is_viral: boolean;
  synced_at: string;
}

// Gap score (calculated weekly)
export interface GapScore {
  id: string;
  user_id: string;
  calculated_at: string;
  overall_score: number; // 0-100, higher = bigger gap = more opportunity
  views_gap_score: number;
  ctr_gap_score: number;
  upload_frequency_gap_score: number;
  watch_time_gap_score: number;
  topic_coverage_gap_score: number;
  estimated_revenue_gap: number; // monthly dollars left on table
  primary_bottleneck: string; // which gap costs the most money
}

// Digest (Claude-generated weekly report)
export interface Digest {
  id: string;
  user_id: string;
  week_start_date: string;
  content: string; // full Claude-generated text
  video_ideas: VideoIdea[] | null;
  key_metrics: Record<string, unknown> | null;
  email_sent_at: string | null;
  opened_at: string | null;
  created_at: string;
}

// Trend (viral video detected in niche)
export interface Trend {
  id: string;
  user_id: string;
  competitor_id: string | null;
  youtube_video_id: string | null;
  title: string | null;
  channel_name: string | null;
  view_count: number | null;
  velocity_score: number | null;
  detected_at: string;
  alert_sent: boolean;
}

// User settings
export interface UserSettings {
  id: string;
  user_id: string;
  weekly_digest_enabled: boolean;
  alerts_enabled: boolean;
  alert_threshold_multiplier: number;
  last_alert_sent_at: string | null;
  alerted_video_ids: string[];
  unsubscribe_token: string | null;
  digest_day: string | null;
  timezone: string | null;
  created_at: string;
  updated_at: string;
}

// Video idea (generated by Claude, stored in digest.video_ideas)
export interface VideoIdea {
  title: string;
  opportunityScore: number;
  reason: string;
  suggestedLength: string;
  thumbnailApproach: string;
  hookDataPoint: string;
}

// Niche detection result (from Claude classification in niche-engine.ts)
export interface NicheResult {
  nicheId: string;       // one of the 12 valid niche IDs
  nicheName: string;     // human-readable display name
  confidence: number;    // 0–1 confidence score from Claude
  reasoning: string;     // one-sentence explanation of the classification
}

// Competitor candidate (from YouTube channel search in niche-engine.ts)
export interface CompetitorCandidate {
  channelId: string;
  channelName: string;
  subscriberCount: number;
  thumbnailUrl: string;
}

// Gap scorer — user metrics input
export interface UserMetrics {
  avgViewsPerVideo: number;
  ctr: number;                       // decimal (0.031 = 3.1%)
  avgViewDurationSeconds: number;
  uploadsPerMonth: number;
  subscriberCount: number;
  nicheId: string;
  recentVideoTitles: string[];       // last 10 video titles for topic analysis
}

// Gap scorer — competitor metrics input
export interface CompetitorMetrics {
  channelId: string;
  channelName: string;
  subscriberCount: number;
  avgViewsPerVideo: number;
  estimatedCtr: number;              // decimal
  avgViewDurationSeconds: number;
  uploadsPerMonth: number;
  recentVideoTitles: string[];
  tier: 1 | 2;                       // 1 = 1x-3x subs, 2 = 3x-10x subs
}

// Gap scorer — per-metric breakdown
export interface MetricScore {
  userValue: number;
  competitorAvg: number;
  gapPercent: number;                // how far behind as percentage
  score: number;                     // 0–100 contribution to overall score
  label: string;                     // e.g. "Your CTR is 42% below Tier 1 average"
}

// Gap scorer — revenue estimate
export interface RevenueEstimate {
  userMonthlyEstimate: number;       // USD
  tier1AvgMonthly: number;           // Tier 1 competitor average, USD
  gapMonthly: number;                // how much more they could earn, USD
  annualGap: number;                 // gapMonthly * 12
  cpmUsed: number;                   // CPM benchmark applied
}

// Viral video detected in a competitor channel (from trend-detector.ts)
export interface ViralVideo {
  videoId: string;
  title: string;
  channelId: string;
  channelName: string;
  viewCount: number;
  velocityScore: number;
  publishedAt: string;
  thumbnailUrl: string;
  performanceVsAvg: number; // e.g. 3.2 means 3.2x that channel's average views
}

// Topic covered by competitors but absent from the user's channel (from trend-detector.ts)
export interface UncoveredTopic {
  topic: string;              // e.g. "passive income with index funds"
  competitorCoverage: number; // how many competitors covered it
  searchDemandEstimate: 'high' | 'medium' | 'low'; // Claude's estimate
  suggestedAngle: string;     // Claude's one-line suggestion for the user's take
}

// Digest generator — structured result returned by generateDigest
export interface DigestResult {
  userId: string;
  generatedAt: string;              // ISO timestamp
  overallGapScore: number;
  sections: {
    thisWeek: string;
    competitorMoves: string;
    videoIdeas: string;
    oneChange: string;
  };
  rawMarkdown: string;              // full Claude response for in-app rendering
  videoIdeasParsed: DigestVideoIdea[];
}

// Simplified video idea type used inside DigestResult
// (distinct from the richer VideoIdea used in the Digest DB record)
export interface DigestVideoIdea {
  title: string;
  opportunityScore: number | null;
  reasoning: string;
}

// Idea generator — a single generated video idea
export interface GeneratedVideoIdea {
  rank: number;             // 1, 2, or 3
  title: string;
  score: number;            // 0-100
  whyNow: string;
  angle: string;
  format: string;           // tutorial / documentary / listicle / case study / opinion / challenge
  estimatedLength: string;
  generatedAt: string;      // ISO timestamp
}

// Idea generator — full result returned by generateVideoIdeas
export interface IdeaResult {
  userId: string;
  generatedAt: string;      // ISO timestamp
  ideas: GeneratedVideoIdea[];
  nicheId: string;
  inputGapScore: number;    // gap score used as context (0 if unavailable)
  tokensUsed: number;       // total Claude tokens consumed
  costUsd: number;          // USD cost of the Claude call
}

// Revenue benchmarks — per-niche benchmark data
export interface NicheBenchmark {
  nicheId: string;
  nicheName: string;
  cpmRange: { min: number; max: number };
  rpmRange: { min: number; max: number };
  avgMonthlyUploads: number;
  avgVideoDurationMinutes: number;
  avgViewsPerVideo: {
    tier1: number;
    tier2: number;
    tier3: number;
    tier4: number;
  };
  seasonalFactors: {
    q1: number;
    q2: number;
    q3: number;
    q4: number;
  };
  audienceGeographyPremium: number;
  sponsorshipRatePerIntegration: {
    tier1: number;
    tier2: number;
    tier3: number;
    tier4: number;
  };
}

// Revenue benchmarks — potential revenue breakdown
export interface RevenuePotential {
  currentMonthlyEstimate: number;
  benchmarkMonthlyEstimate: number;
  gapMonthly: number;
  gapAnnual: number;
  currentRpmUsed: number;
  benchmarkRpmUsed: number;
  subscriberTier: string;
  sponsorshipPotentialMonthly: number;
  totalPotentialMonthly: number;
  dataSource: string;
}

// Revenue benchmarks — comparison result
export interface BenchmarkComparison {
  niche: NicheBenchmark;
  tier: string;
  viewsVsBenchmark: { userValue: number; benchmarkValue: number; percentageDiff: number };
  uploadsVsBenchmark: { userValue: number; benchmarkValue: number; percentageDiff: number };
  durationVsBenchmark: { userValue: number; benchmarkValue: number; percentageDiff: number };
  revenuePotential: RevenuePotential;
  topInsight: string;
}

// Gap scorer — full result
export interface GapScoreResult {
  overallScore: number;              // 0–100. Higher = bigger gap = more opportunity
  tier1Score: number;                // gap vs Tier 1 only
  tier2Score: number;                // gap vs Tier 2 only
  breakdown: {
    viewsGap: MetricScore;
    ctrGap: MetricScore;
    watchTimeGap: MetricScore;
    uploadFrequencyGap: MetricScore;
  };
  topCompetitor: string;             // channelName of best-performing Tier 1 competitor
  biggestOpportunity: string;        // "views" | "ctr" | "watchTime" | "uploadFrequency"
  primaryBottleneck: string;         // plain English sentence
  revenueGap: RevenueEstimate;
  calculatedAt: string;              // ISO timestamp
}
