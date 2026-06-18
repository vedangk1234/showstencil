// Plan types
export type PlanType = 'free' | 'starter' | 'pro';
export type SubscriptionStatus = 'free' | 'on_trial' | 'active' | 'past_due' | 'cancelled' | 'expired' | 'paused';

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
  paypal_subscription_id: string | null;
  trial_ends_at: string | null;
  current_period_end: string | null;
  onboarding_completed: boolean;
  thumbnails_generated_this_month: number;
  thumbnails_quota_reset_at: string | null;
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
  age_gender_breakdown: Array<{ ageGroup: string; gender: string; viewerPercentage: number }> | null;
  top_countries: Array<{ country: string; views: number }> | null;
  traffic_sources: Array<{ source: string; views: number; watchTimeMinutes: number; percentage: number }> | null;
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

// Insight (Claude-generated strategic insight for a competitor comparison)
export interface Insight {
  type: 'observation' | 'recommendation' | 'strength' | 'gap';
  title: string;
  description: string;
  priority: 'high' | 'medium' | 'low';
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
  video_count: number | null;
  avg_views_per_video: number | null;
  avg_video_length_seconds: number | null;
  upload_frequency_30d: number | null;
  insights: Insight[] | null;
  insights_generated_at: string | null;
  replacement_locked_until: string | null;
  last_synced_at: string | null;
  created_at: string;
}

// CompetitorSnapshot (daily historical data per competitor)
export interface CompetitorSnapshot {
  id: string;
  competitor_id: string;
  snapshot_date: string; // YYYY-MM-DD
  subscriber_count: number | null;
  total_views: number | null;
  video_count: number | null;
  avg_views_per_video: number | null;
  avg_video_length_seconds: number | null;
  upload_frequency_30d: number | null;
  velocity_score_avg: number | null;
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
  ideas_refresh_available: boolean | null;
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

// Niche detection result (from Claude classification in niche-engine.ts).
// Phase 3 (2026-06-09): migrated from the legacy 12-niche `nicheId`/`nicheName`
// shape to a slug-based shape backed by the 31-niche taxonomy in lib/niches.ts.
// `nicheSlug` is null when Claude could not classify confidently — in that case
// `requiresManualSelection` is true and callers must surface the manual picker
// rather than substituting a fallback niche.
export interface NicheResult {
  nicheSlug: string | null;        // one of VALID_NICHE_SLUGS, or null when unclassified
  confidence: number;              // 0.0–1.0 confidence score from Claude
  reasoning: string;               // one-sentence explanation of the classification or non-classification
  requiresManualSelection: boolean; // true when nicheSlug is null OR confidence is below the threshold
  source: 'cache' | 'claude' | 'manual' | 'failure';
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
  id: string;                        // saved digests row UUID
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

// Video idea stored as an individual DB row (new schema from Day 20)
export interface Idea {
  id: string;
  user_id: string;
  title: string;
  opportunity_score: number;
  thumbnail_description: string;
  content_brief: string;
  hook_2: string | null;
  hook_3: string | null;
  suggested_duration_min: number;
  suggested_duration_max: number;
  duration_reasoning: string;
  why_now: string;
  topic_source: string | null;
  generated_at: string;
  planned_at: string | null;
  made_at: string | null;
  thumbnail_image_url: string | null;
  thumbnail_generated_at: string | null;
  thumbnail_source_type: 'camera' | 'upload' | 'google_profile' | 'no_photo' | null;
}

// Thumbnail generation job (tracks async Gemini image generation)
export interface ThumbnailJob {
  id: string;
  user_id: string;
  idea_id: string;
  status: 'pending' | 'completed' | 'failed';
  thumbnail_url: string | null;
  error_message: string | null;
  created_at: string;
  completed_at: string | null;
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

// Sync attempt log (maps to sync_logs table)
export interface SyncLog {
  id: string;
  created_at: string;
  user_id: string | null;
  email: string | null;
  route: string;
  status: number;
  message: string | null;
  duration_ms: number | null;
  ip: string | null;
  country: string | null;
  city: string | null;
  user_agent: string | null;
  channel_id: string | null;
  videos_synced: number | null;
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
