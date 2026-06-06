/**
 * lib/youtube-analytics.ts
 * Authenticated YouTube Analytics API v2 calls.
 * Fetches the signed-in user's own private channel data via their OAuth token.
 *
 * Base URL: https://youtubeanalytics.googleapis.com/v2
 * Quota: 200 units/day (each reports.query = 1 unit)
 *
 * Error contract:
 *   - 401 response → throws new Error('TOKEN_EXPIRED') — caller must refresh token
 *   - 403 response → returns null (no YouTube channel, or metric not permitted)
 *   - Other errors → logs and returns null/[] — never crashes the app
 */

import { logError } from '@/lib/logger';

const BASE_URL = 'https://youtubeanalytics.googleapis.com/v2';

// ---------------------------------------------------------------------------
// Interfaces
// ---------------------------------------------------------------------------

export interface ChannelOverview {
  totalViews: number;
  totalWatchTimeMinutes: number;
  avgViewDurationSeconds: number;
  subscribersGained: number;
  subscribersLost: number;
  netSubscribers: number;
  estimatedRevenue: number; // 0 if channel is not monetized
}

export interface VideoPerformanceItem {
  videoId: string;
  views: number;
  watchTimeMinutes: number;
  avgViewDurationSeconds: number;
  avgViewPercentage: number;
  likes: number;
  comments: number;
  shares: number;
  subscribersGained: number;
  estimatedRevenue: number;
  ctr: number; // annotationClickThroughRate (0 for most modern content)
}

export interface AudienceDemographics {
  ageGender: Array<{
    ageGroup: string;
    gender: string;
    viewerPercentage: number;
  }>;
  topCountries: Array<{
    country: string;
    views: number;
  }>;
}

export interface TrafficSourceItem {
  source: string;
  views: number;
  watchTimeMinutes: number;
  percentage: number;
}

export interface DailyAnalyticsItem {
  date: string;
  views: number;
  watchTimeMinutes: number;
  subscribersGained: number;
  estimatedRevenue: number;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

type AnalyticsRow = Array<string | number | null>;

interface AnalyticsResult {
  columnHeaders: Array<{ name: string }>;
  rows: AnalyticsRow[];
}

/** Format Date → YYYY-MM-DD for the Analytics API. */
function toApiDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Return [startDate, endDate] strings for the last N days. */
function dateRange(days: number): { startDate: string; endDate: string } {
  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - days);
  return { startDate: toApiDate(start), endDate: toApiDate(end) };
}

/**
 * Build a column-name → value map from a single Analytics API result row.
 * Handles the {columnHeaders: [{name},...], rows: [[val,...],...]} shape.
 */
function parseRow(
  headers: Array<{ name: string }>,
  row: AnalyticsRow,
): Record<string, string | number> {
  const out: Record<string, string | number> = {};
  for (let i = 0; i < headers.length; i++) {
    out[headers[i].name] = row[i] ?? 0;
  }
  return out;
}

/** Coerce an Analytics API column value to a number. */
function n(val: string | number | undefined): number {
  if (typeof val === 'number') return val;
  if (typeof val === 'string') return parseFloat(val) || 0;
  return 0;
}

/**
 * Core Analytics API caller.
 *
 * - 401 → throws TOKEN_EXPIRED (caller handles refresh)
 * - 403 → returns null (no channel / metric not permitted)
 * - Other HTTP errors → logs error, returns null
 */
async function analyticsQuery(
  accessToken: string,
  params: Record<string, string>,
): Promise<AnalyticsResult | null> {
  const url = new URL(`${BASE_URL}/reports`);
  // 'channel==MINE' is the required literal value for the authenticated user's channel.
  // URLSearchParams encodes == as %3D%3D which the API accepts.
  url.searchParams.set('ids', 'channel==MINE');
  for (const [key, val] of Object.entries(params)) {
    url.searchParams.set(key, val);
  }

  let res: Response;
  try {
    res = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
  } catch (err) {
    console.error('[youtube-analytics] network error:', err);
    void logError({
      route: 'lib/youtube-analytics/analyticsQuery',
      error: err instanceof Error ? err.message : String(err),
      details: { error_stack: err instanceof Error ? err.stack : undefined },
    });
    return null;
  }

  if (res.ok) {
    const data = await res.json();
    return {
      columnHeaders: data.columnHeaders ?? [],
      rows: data.rows ?? [],
    };
  }

  const errorBody = await res.json().catch(() => ({})) as {
    error?: { message?: string; errors?: Array<{ reason?: string }> };
  };
  const reason = errorBody?.error?.errors?.[0]?.reason ?? '';

  if (res.status === 401) {
    // 'authError' = expired/invalid token → caller must refresh.
    // 'unauthorized' = metric not permitted for this channel (e.g. estimatedRevenue
    //   on a non-monetized channel) → treat as null so callers can retry without it.
    if (reason === 'authError' || reason === '') {
      throw new Error('TOKEN_EXPIRED');
    }
    // Permission issue (unauthorized metric) — return null for graceful retry
    console.warn(
      `[youtube-analytics] 401 unauthorized — metric not permitted: ${errorBody?.error?.message ?? ''}`,
    );
    return null;
  }

  if (res.status === 403) {
    // No YouTube channel on this account, or Analytics not enabled.
    return null;
  }

  console.error(
    `[youtube-analytics] HTTP ${res.status}:`,
    errorBody?.error?.message ?? 'unknown error',
  );
  void logError({
    route: 'lib/youtube-analytics/analyticsQuery',
    error: `HTTP ${res.status}: ${errorBody?.error?.message ?? 'unknown error'}`,
    severity: 'warn',
  });
  return null;
}

/**
 * Attempt a query with `estimatedRevenue` in the metrics.
 * If it returns null (403 — likely non-monetized channel), silently retry
 * without `estimatedRevenue` and return revenue as 0.
 * Returns null only if both attempts fail (true permission error / no channel).
 */
async function queryWithRevenueRetry(
  accessToken: string,
  params: Record<string, string>,
  reportName?: string,
): Promise<{ result: AnalyticsResult; hasRevenue: boolean } | null> {
  const result = await analyticsQuery(accessToken, params);
  if (result) return { result, hasRevenue: true };

  const metricsWithout = (params.metrics ?? '')
    .split(',')
    .filter((m) => m !== 'estimatedRevenue')
    .join(',');

  if (!metricsWithout || metricsWithout === params.metrics) return null;

  console.warn(
    '[youtube-analytics] retrying without estimatedRevenue (channel may not be monetized)',
  );
  void logError({
    route: 'lib/youtube-analytics/queryWithRevenueRetry',
    error: 'Retrying Analytics call without estimatedRevenue',
    details: {
      report_name: reportName ?? 'unknown',
      retry_count: 1,
      original_metrics: params.metrics ?? null,
    },
    severity: 'warn',
  });
  const fallback = await analyticsQuery(accessToken, { ...params, metrics: metricsWithout });
  if (!fallback) {
    void logError({
      route: 'lib/youtube-analytics/queryWithRevenueRetry',
      error: 'Analytics retry without estimatedRevenue also failed',
      details: {
        report_name: reportName ?? 'unknown',
        original_metrics: params.metrics ?? null,
        retry_metrics: metricsWithout,
      },
      severity: 'error',
    });
    return null;
  }
  return { result: fallback, hasRevenue: false };
}

// ---------------------------------------------------------------------------
// Function 1 — getChannelOverview
// ---------------------------------------------------------------------------

/**
 * Aggregate channel metrics for the last 90 days.
 * Returns null if the authenticated Google account has no YouTube channel.
 *
 * @quota 1 unit (reports.query, no dimensions)
 */
export async function getChannelOverview(
  accessToken: string,
): Promise<ChannelOverview | null> {
  const { startDate, endDate } = dateRange(90);

  let attempt: Awaited<ReturnType<typeof queryWithRevenueRetry>> = null;
  try {
    attempt = await queryWithRevenueRetry(accessToken, {
      startDate,
      endDate,
      metrics:
        'views,estimatedMinutesWatched,averageViewDuration,subscribersGained,subscribersLost,estimatedRevenue',
    }, 'overview');
  } catch (err) {
    // Only TOKEN_EXPIRED propagates here. Log and rethrow so caller can refresh.
    const message = err instanceof Error ? err.message : String(err);
    void logError({
      route: 'lib/youtube-analytics/getChannelOverview',
      error: `Analytics report "overview" failed: ${message}`,
      details: { report_name: 'overview' },
      severity: message === 'TOKEN_EXPIRED' ? 'warn' : 'error',
    });
    throw err;
  }

  if (!attempt) {
    // Task 4: detect missing YouTube channel gracefully
    console.error(
      '[youtube-analytics] getChannelOverview: no YouTube channel found on this account, ' +
        'or the account does not have access to YouTube Analytics.',
    );
    void logError({
      route: 'lib/youtube-analytics/getChannelOverview',
      error: 'getChannelOverview returned null — no channel or no Analytics access',
      details: { report_name: 'overview', date_range: `${startDate}..${endDate}` },
      severity: 'error',
    });
    return null;
  }

  const { result, hasRevenue } = attempt;

  if (result.rows.length === 0) {
    // Channel exists but has no data yet (brand-new or no views in window)
    void logError({
      route: 'lib/youtube-analytics/getChannelOverview',
      error: 'Analytics report returned empty data',
      details: { report_name: 'overview', date_range: `${startDate}..${endDate}` },
      severity: 'warn',
    });
    return {
      totalViews: 0,
      totalWatchTimeMinutes: 0,
      avgViewDurationSeconds: 0,
      subscribersGained: 0,
      subscribersLost: 0,
      netSubscribers: 0,
      estimatedRevenue: 0,
    };
  }

  const row = parseRow(result.columnHeaders, result.rows[0]);
  const gained = n(row.subscribersGained);
  const lost = n(row.subscribersLost);

  return {
    totalViews: n(row.views),
    totalWatchTimeMinutes: n(row.estimatedMinutesWatched),
    avgViewDurationSeconds: n(row.averageViewDuration),
    subscribersGained: gained,
    subscribersLost: lost,
    netSubscribers: gained - lost,
    estimatedRevenue: hasRevenue ? n(row.estimatedRevenue) : 0,
  };
}

// ---------------------------------------------------------------------------
// Function 2 — getVideoPerformance
// ---------------------------------------------------------------------------

/**
 * Per-video analytics sorted by views descending for the last 90 days.
 *
 * @quota 1 unit (reports.query, dimension=video)
 */
export async function getVideoPerformance(
  accessToken: string,
  maxResults: number = 20,
): Promise<VideoPerformanceItem[]> {
  const { startDate, endDate } = dateRange(90);

  let attempt: Awaited<ReturnType<typeof queryWithRevenueRetry>> = null;
  try {
    attempt = await queryWithRevenueRetry(accessToken, {
      startDate,
      endDate,
      dimensions: 'video',
      metrics:
        'views,estimatedMinutesWatched,averageViewDuration,averageViewPercentage,likes,comments,shares,subscribersGained,estimatedRevenue,annotationClickThroughRate',
      sort: '-views',
      maxResults: String(maxResults),
    }, 'videos');
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    void logError({
      route: 'lib/youtube-analytics/getVideoPerformance',
      error: `Analytics report "videos" failed: ${message}`,
      details: { report_name: 'videos' },
      severity: message === 'TOKEN_EXPIRED' ? 'warn' : 'error',
    });
    throw err;
  }

  if (!attempt) {
    console.error('[youtube-analytics] getVideoPerformance: failed to fetch data');
    void logError({
      route: 'lib/youtube-analytics/getVideoPerformance',
      error: 'getVideoPerformance returned null',
      details: { report_name: 'videos', date_range: `${startDate}..${endDate}` },
      severity: 'error',
    });
    return [];
  }

  const { result, hasRevenue } = attempt;

  if (result.rows.length === 0) {
    void logError({
      route: 'lib/youtube-analytics/getVideoPerformance',
      error: 'Analytics report returned empty data',
      details: { report_name: 'videos', date_range: `${startDate}..${endDate}` },
      severity: 'warn',
    });
  }

  return result.rows.map((row) => {
    const r = parseRow(result.columnHeaders, row);
    return {
      videoId: String(r.video),
      views: n(r.views),
      watchTimeMinutes: n(r.estimatedMinutesWatched),
      avgViewDurationSeconds: n(r.averageViewDuration),
      avgViewPercentage: n(r.averageViewPercentage),
      likes: n(r.likes),
      comments: n(r.comments),
      shares: n(r.shares),
      subscribersGained: n(r.subscribersGained),
      estimatedRevenue: hasRevenue ? n(r.estimatedRevenue) : 0,
      ctr: n(r.annotationClickThroughRate),
    };
  });
}

// ---------------------------------------------------------------------------
// Function 3 — getAudienceDemographics
// ---------------------------------------------------------------------------

/**
 * Viewer age/gender breakdown and top 10 countries by views.
 * Makes two parallel Analytics API calls.
 *
 * @quota 2 units (2 × reports.query)
 */
export async function getAudienceDemographics(
  accessToken: string,
): Promise<AudienceDemographics | null> {
  const { startDate, endDate } = dateRange(90);

  let ageGenderResult: AnalyticsResult | null = null;
  let countriesResult: AnalyticsResult | null = null;
  try {
    [ageGenderResult, countriesResult] = await Promise.all([
      analyticsQuery(accessToken, {
        startDate,
        endDate,
        dimensions: 'ageGroup,gender',
        metrics: 'viewerPercentage',
      }),
      analyticsQuery(accessToken, {
        startDate,
        endDate,
        dimensions: 'country',
        metrics: 'views',
        sort: '-views',
        maxResults: '10',
      }),
    ]);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    void logError({
      route: 'lib/youtube-analytics/getAudienceDemographics',
      error: `Analytics report "demographics" failed: ${message}`,
      details: { report_name: 'demographics' },
      severity: message === 'TOKEN_EXPIRED' ? 'warn' : 'error',
    });
    throw err;
  }

  if (!ageGenderResult && !countriesResult) {
    console.error('[youtube-analytics] getAudienceDemographics: failed to fetch data');
    void logError({
      route: 'lib/youtube-analytics/getAudienceDemographics',
      error: 'getAudienceDemographics: both age/gender and countries returned null',
      details: { report_name: 'demographics', date_range: `${startDate}..${endDate}` },
      severity: 'error',
    });
    return null;
  }

  if ((ageGenderResult?.rows.length ?? 0) === 0 && (countriesResult?.rows.length ?? 0) === 0) {
    void logError({
      route: 'lib/youtube-analytics/getAudienceDemographics',
      error: 'Analytics report returned empty data',
      details: { report_name: 'demographics', date_range: `${startDate}..${endDate}` },
      severity: 'warn',
    });
  }

  const ageGender = (ageGenderResult?.rows ?? []).map((row) => {
    const r = parseRow(ageGenderResult!.columnHeaders, row);
    return {
      ageGroup: String(r.ageGroup),
      gender: String(r.gender),
      viewerPercentage: n(r.viewerPercentage),
    };
  });

  const topCountries = (countriesResult?.rows ?? []).map((row) => {
    const r = parseRow(countriesResult!.columnHeaders, row);
    return {
      country: String(r.country),
      views: n(r.views),
    };
  });

  return { ageGender, topCountries };
}

// ---------------------------------------------------------------------------
// Function 4 — getTrafficSources
// ---------------------------------------------------------------------------

/**
 * Views and watch time broken down by traffic source type, with percentage share.
 *
 * @quota 1 unit (reports.query, dimension=insightTrafficSourceType)
 */
export async function getTrafficSources(
  accessToken: string,
): Promise<TrafficSourceItem[]> {
  const { startDate, endDate } = dateRange(90);

  let result: AnalyticsResult | null = null;
  try {
    result = await analyticsQuery(accessToken, {
      startDate,
      endDate,
      dimensions: 'insightTrafficSourceType',
      metrics: 'views,estimatedMinutesWatched',
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    void logError({
      route: 'lib/youtube-analytics/getTrafficSources',
      error: `Analytics report "traffic" failed: ${message}`,
      details: { report_name: 'traffic' },
      severity: message === 'TOKEN_EXPIRED' ? 'warn' : 'error',
    });
    throw err;
  }

  if (!result) {
    console.error('[youtube-analytics] getTrafficSources: failed to fetch data');
    void logError({
      route: 'lib/youtube-analytics/getTrafficSources',
      error: 'getTrafficSources returned null',
      details: { report_name: 'traffic', date_range: `${startDate}..${endDate}` },
      severity: 'error',
    });
    return [];
  }

  if (result.rows.length === 0) {
    void logError({
      route: 'lib/youtube-analytics/getTrafficSources',
      error: 'Analytics report returned empty data',
      details: { report_name: 'traffic', date_range: `${startDate}..${endDate}` },
      severity: 'warn',
    });
  }

  const rows = result.rows.map((row) => {
    const r = parseRow(result.columnHeaders, row);
    return {
      source: String(r.insightTrafficSourceType),
      views: n(r.views),
      watchTimeMinutes: n(r.estimatedMinutesWatched),
    };
  });

  const totalViews = rows.reduce((sum, r) => sum + r.views, 0);

  return rows.map((r) => ({
    ...r,
    percentage: totalViews > 0 ? Math.round((r.views / totalViews) * 10000) / 100 : 0,
  }));
}

// ---------------------------------------------------------------------------
// Function 5 — getDailyAnalytics
// ---------------------------------------------------------------------------

/**
 * Day-by-day metrics for the last N days (default 30), sorted ascending.
 * Powers time-series charts on the dashboard.
 *
 * @quota 1 unit (reports.query, dimension=day)
 */
export async function getDailyAnalytics(
  accessToken: string,
  days: number = 30,
): Promise<DailyAnalyticsItem[]> {
  const { startDate, endDate } = dateRange(days);

  let attempt: Awaited<ReturnType<typeof queryWithRevenueRetry>> = null;
  try {
    attempt = await queryWithRevenueRetry(accessToken, {
      startDate,
      endDate,
      dimensions: 'day',
      metrics: 'views,estimatedMinutesWatched,subscribersGained,estimatedRevenue',
      sort: 'day',
    }, 'daily');
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    void logError({
      route: 'lib/youtube-analytics/getDailyAnalytics',
      error: `Analytics report "daily" failed: ${message}`,
      details: { report_name: 'daily' },
      severity: message === 'TOKEN_EXPIRED' ? 'warn' : 'error',
    });
    throw err;
  }

  if (!attempt) {
    console.error('[youtube-analytics] getDailyAnalytics: failed to fetch data');
    void logError({
      route: 'lib/youtube-analytics/getDailyAnalytics',
      error: 'getDailyAnalytics returned null',
      details: { report_name: 'daily', date_range: `${startDate}..${endDate}` },
      severity: 'error',
    });
    return [];
  }

  const { result, hasRevenue } = attempt;

  if (result.rows.length === 0) {
    void logError({
      route: 'lib/youtube-analytics/getDailyAnalytics',
      error: 'Analytics report returned empty data',
      details: { report_name: 'daily', date_range: `${startDate}..${endDate}` },
      severity: 'warn',
    });
  }

  return result.rows.map((row) => {
    const r = parseRow(result.columnHeaders, row);
    return {
      date: String(r.day),
      views: n(r.views),
      watchTimeMinutes: n(r.estimatedMinutesWatched),
      subscribersGained: n(r.subscribersGained),
      estimatedRevenue: hasRevenue ? n(r.estimatedRevenue) : 0,
    };
  });
}
