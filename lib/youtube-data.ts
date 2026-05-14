/**
 * lib/youtube-data.ts
 * Public YouTube Data API v3 calls — no user auth required.
 * Uses YOUTUBE_API_KEY for all requests.
 */

import { logError } from '@/lib/logger';

const BASE_URL = 'https://www.googleapis.com/youtube/v3';

function apiKey(): string {
  const key = process.env.YOUTUBE_API_KEY;
  if (!key) throw new Error('YOUTUBE_API_KEY is not set');
  return key;
}

// ---------------------------------------------------------------------------
// YouTube category ID → human-readable name
// ---------------------------------------------------------------------------

const VIDEO_CATEGORIES: Record<string, string> = {
  '1': 'Film & Animation',
  '2': 'Autos & Vehicles',
  '10': 'Music',
  '15': 'Pets & Animals',
  '17': 'Sports',
  '18': 'Short Movies',
  '19': 'Travel & Events',
  '20': 'Gaming',
  '21': 'Videoblogging',
  '22': 'People & Blogs',
  '23': 'Comedy',
  '24': 'Entertainment',
  '25': 'News & Politics',
  '26': 'Howto & Style',
  '27': 'Education',
  '28': 'Science & Technology',
  '29': 'Nonprofits & Activism',
};

// ---------------------------------------------------------------------------
// Interfaces
// ---------------------------------------------------------------------------

export interface ChannelStats {
  id: string;
  name: string;
  subscriberCount: number;
  totalViews: number;
  videoCount: number;
  thumbnail: string;
  publishedAt: string;
  country: string;
  keywords: string[];
  topicCategories: string[];
  trailerVideoId: string | null;
}

export interface VideoSummary {
  videoId: string;
  title: string;
  publishedAt: string;
  thumbnail: string;
  duration: 'medium' | 'long';
}

export interface VideoDetail {
  videoId: string;
  title: string;
  viewCount: number;
  likeCount: number;
  commentCount: number;
  duration: number; // seconds
  publishedAt: string;
  tags: string[];
  categoryId: string;
  categoryName: string;
  defaultLanguage: string;
  thumbnailHighRes: string;
  thumbnailDefault: string;
  isLiveStream: boolean;
  madeForKids: boolean;
}

export interface VideoVelocityItem {
  videoId: string;
  title: string;
  publishedAt: string;
  viewCount: number;
  hoursSincePublished: number;
  velocityScore: number;
  isViral: boolean;
  isActiveViral: boolean; // published within last 48 hours AND viral
}

export interface ChannelVideoVelocity {
  channelAvgViews: number;
  videos: VideoVelocityItem[];
}

export interface CompetitorFullProfile {
  channel: ChannelStats;
  recentVideos: VideoDetail[];
  velocityData: ChannelVideoVelocity;
  syncedAt: string;
}

export interface TopicCoverage {
  allTags: string[];
  tagFrequency: Record<string, number>;
  topTags: string[]; // top 20 by frequency
  categories: Record<string, number>;
  avgDurationSeconds: number;
  commonTitleWords: string[]; // words appearing in 3+ video titles
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Parse ISO 8601 duration (e.g. "PT4M33S") to seconds. */
function parseDuration(iso: string): number {
  const match = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!match) return 0;
  const hours = parseInt(match[1] ?? '0', 10);
  const minutes = parseInt(match[2] ?? '0', 10);
  const seconds = parseInt(match[3] ?? '0', 10);
  return hours * 3600 + minutes * 60 + seconds;
}

/**
 * Parse YouTube's channel keyword string into an array.
 * Handles quoted multi-word keywords, e.g. `"personal finance" investing`.
 */
function parseKeywords(raw: string): string[] {
  if (!raw) return [];
  const keywords: string[] = [];
  const regex = /"([^"]+)"|(\S+)/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(raw)) !== null) {
    keywords.push(match[1] ?? match[2]);
  }
  return keywords;
}

/**
 * Extract a readable topic name from a Wikipedia category URL.
 * e.g. "https://en.wikipedia.org/wiki/Personal_finance" → "Personal finance"
 */
function parseTopicCategory(url: string): string {
  const lastSegment = url.split('/').pop() ?? url;
  return decodeURIComponent(lastSegment).replace(/_/g, ' ');
}

/** Return an ISO 8601 string for N days ago. */
function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString();
}

/**
 * Compute viral velocity scores from already-fetched VideoDetail objects.
 * Extracted so both getChannelVideoVelocity and getCompetitorFullProfile
 * can reuse it without an extra API call.
 */
function computeVelocity(videos: VideoDetail[]): ChannelVideoVelocity {
  const now = Date.now();

  const channelAvgViews =
    videos.length > 0
      ? Math.round(videos.reduce((sum, v) => sum + v.viewCount, 0) / videos.length)
      : 0;

  const viralThreshold = (channelAvgViews / 48) * 3;

  const velocityVideos: VideoVelocityItem[] = videos.map((v) => {
    const publishedMs = new Date(v.publishedAt).getTime();
    const hoursSincePublished = Math.max((now - publishedMs) / 3_600_000, 1);
    const velocityScore = v.viewCount / hoursSincePublished;
    const isViral = velocityScore > viralThreshold;
    const isActiveViral = isViral && hoursSincePublished <= 48;

    return {
      videoId: v.videoId,
      title: v.title,
      publishedAt: v.publishedAt,
      viewCount: v.viewCount,
      hoursSincePublished: Math.round(hoursSincePublished * 10) / 10,
      velocityScore: Math.round(velocityScore * 100) / 100,
      isViral,
      isActiveViral,
    };
  });

  return { channelAvgViews, videos: velocityVideos };
}

// ---------------------------------------------------------------------------
// Function 1 — getChannelStats
// ---------------------------------------------------------------------------

/**
 * Fetch channel metadata including branding keywords, topic categories, and
 * the unsubscribed trailer video ID.
 *
 * @quota 1 unit (channels.list: snippet + statistics + brandingSettings + topicDetails)
 */
export async function getChannelStats(channelId: string): Promise<ChannelStats | null> {
  const url = new URL(`${BASE_URL}/channels`);
  url.searchParams.set('key', apiKey());
  url.searchParams.set('id', channelId);
  url.searchParams.set('part', 'snippet,statistics,brandingSettings,topicDetails');

  try {
    const res = await fetch(url.toString());
    if (!res.ok) {
      console.error(`[youtube-data] getChannelStats HTTP ${res.status} for ${channelId}`);
      return null;
    }

    const data = await res.json();
    const item = data.items?.[0];
    if (!item) {
      console.error(`[youtube-data] getChannelStats: no channel found for ${channelId}`);
      return null;
    }

    const rawKeywords: string = item.brandingSettings?.channel?.keywords ?? '';
    const rawTopics: string[] = item.topicDetails?.topicCategories ?? [];

    return {
      id: item.id,
      name: item.snippet.title,
      subscriberCount: parseInt(item.statistics.subscriberCount ?? '0', 10),
      totalViews: parseInt(item.statistics.viewCount ?? '0', 10),
      videoCount: parseInt(item.statistics.videoCount ?? '0', 10),
      thumbnail: item.snippet.thumbnails?.default?.url ?? '',
      publishedAt: item.snippet.publishedAt,
      country: item.snippet.country ?? '',
      keywords: parseKeywords(rawKeywords),
      topicCategories: rawTopics.map(parseTopicCategory),
      trailerVideoId: item.brandingSettings?.channel?.unsubscribedTrailer ?? null,
    };
  } catch (err) {
    console.error(`[youtube-data] getChannelStats error for ${channelId}:`, err);
    void logError({
      route: 'lib/youtube-data/getChannelStats',
      error: err instanceof Error ? err.message : String(err),
      details: { channel_id: channelId, error_stack: err instanceof Error ? err.stack : undefined },
    });
    return null;
  }
}

// ---------------------------------------------------------------------------
// Function 2 — getRecentVideos
// ---------------------------------------------------------------------------

/**
 * Fetch recent non-Shorts videos from a channel. Makes two parallel calls to
 * search.list (videoDuration=medium and long) and merges results sorted by date.
 * Defaults to the last 90 days.
 *
 * @quota 200 units (2 × 100-unit search.list calls)
 */
export async function getRecentVideos(
  channelId: string,
  maxResults: number = 20,
  publishedAfter: string = daysAgo(90),
): Promise<VideoSummary[]> {
  const durations: Array<'medium' | 'long'> = ['medium', 'long'];

  const fetches = durations.map(async (dur): Promise<VideoSummary[]> => {
    const url = new URL(`${BASE_URL}/search`);
    url.searchParams.set('key', apiKey());
    url.searchParams.set('channelId', channelId);
    url.searchParams.set('part', 'snippet');
    url.searchParams.set('order', 'date');
    url.searchParams.set('type', 'video');
    url.searchParams.set('videoDuration', dur);
    url.searchParams.set('publishedAfter', publishedAfter);
    url.searchParams.set('maxResults', String(Math.min(maxResults, 50)));

    try {
      const res = await fetch(url.toString());
      if (!res.ok) {
        console.error(
          `[youtube-data] getRecentVideos HTTP ${res.status} for ${channelId} (${dur})`,
        );
        return [];
      }

      const data = await res.json();
      const items: {
        id: { videoId: string };
        snippet: {
          title: string;
          publishedAt: string;
          thumbnails: { default?: { url: string } };
        };
      }[] = data.items ?? [];

      return items.map((item) => ({
        videoId: item.id.videoId,
        title: item.snippet.title,
        publishedAt: item.snippet.publishedAt,
        thumbnail: item.snippet.thumbnails?.default?.url ?? '',
        duration: dur,
      }));
    } catch (err) {
      console.error(`[youtube-data] getRecentVideos error for ${channelId} (${dur}):`, err);
      void logError({
        route: 'lib/youtube-data/getRecentVideos',
        error: err instanceof Error ? err.message : String(err),
        details: { channel_id: channelId, duration_filter: dur },
        severity: 'warn',
      });
      return [];
    }
  });

  const [mediumVideos, longVideos] = await Promise.all(fetches);
  const allResults = [...mediumVideos, ...longVideos];

  // Sort by date descending, deduplicate by videoId
  const seen = new Set<string>();
  return allResults
    .sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime())
    .filter((v) => {
      if (seen.has(v.videoId)) return false;
      seen.add(v.videoId);
      return true;
    });
}

// ---------------------------------------------------------------------------
// Function 3 — getVideoDetails
// ---------------------------------------------------------------------------

/**
 * Fetch full video metadata including tags, category, language, and high-res
 * thumbnails. Automatically filters out: live streams, kids content, and
 * videos under 61 seconds (Shorts).
 *
 * @quota 1 unit per batch of ≤50 video IDs
 */
export async function getVideoDetails(videoIds: string[]): Promise<VideoDetail[]> {
  if (videoIds.length === 0) return [];

  const results: VideoDetail[] = [];

  for (let i = 0; i < videoIds.length; i += 50) {
    const batch = videoIds.slice(i, i + 50);

    const url = new URL(`${BASE_URL}/videos`);
    url.searchParams.set('key', apiKey());
    url.searchParams.set('id', batch.join(','));
    url.searchParams.set('part', 'snippet,statistics,contentDetails,status');

    try {
      const res = await fetch(url.toString());
      if (!res.ok) {
        console.error(
          `[youtube-data] getVideoDetails HTTP ${res.status} for batch ${i}–${i + batch.length}`,
        );
        continue;
      }

      const data = await res.json();
      const items: {
        id: string;
        snippet: {
          title: string;
          publishedAt: string;
          tags?: string[];
          categoryId?: string;
          defaultLanguage?: string;
          thumbnails: {
            default?: { url: string };
            high?: { url: string };
            maxres?: { url: string };
          };
          liveBroadcastContent?: string;
        };
        statistics: {
          viewCount?: string;
          likeCount?: string;
          commentCount?: string;
        };
        contentDetails: { duration: string };
        status: { madeForKids?: boolean };
      }[] = data.items ?? [];

      for (const item of items) {
        const isLiveStream =
          item.snippet.liveBroadcastContent === 'live' ||
          item.snippet.liveBroadcastContent === 'upcoming';
        const madeForKids = item.status.madeForKids ?? false;
        const durationSecs = parseDuration(item.contentDetails.duration);

        // Filter out live streams, kids content, and Shorts (<61s)
        if (isLiveStream || madeForKids || durationSecs < 61) continue;

        const categoryId = item.snippet.categoryId ?? '';

        results.push({
          videoId: item.id,
          title: item.snippet.title,
          viewCount: parseInt(item.statistics.viewCount ?? '0', 10),
          likeCount: parseInt(item.statistics.likeCount ?? '0', 10),
          commentCount: parseInt(item.statistics.commentCount ?? '0', 10),
          duration: durationSecs,
          publishedAt: item.snippet.publishedAt,
          tags: item.snippet.tags ?? [],
          categoryId,
          categoryName: VIDEO_CATEGORIES[categoryId] ?? 'Unknown',
          defaultLanguage: item.snippet.defaultLanguage ?? '',
          thumbnailHighRes:
            item.snippet.thumbnails?.maxres?.url ?? item.snippet.thumbnails?.high?.url ?? '',
          thumbnailDefault: item.snippet.thumbnails?.default?.url ?? '',
          isLiveStream,
          madeForKids,
        });
      }
    } catch (err) {
      console.error(`[youtube-data] getVideoDetails error for batch ${i}:`, err);
      void logError({
        route: 'lib/youtube-data/getVideoDetails',
        error: err instanceof Error ? err.message : String(err),
        details: { batch_index: i, error_stack: err instanceof Error ? err.stack : undefined },
        severity: 'warn',
      });
    }
  }

  return results;
}

// ---------------------------------------------------------------------------
// Function 4 — getChannelVideoVelocity
// ---------------------------------------------------------------------------

/**
 * Fetch the last 10 non-Shorts videos and compute viral velocity scores.
 * A video is flagged viral when its hourly view rate exceeds 3× the channel's
 * expected hourly rate (channelAvgViews / 48). isActiveViral additionally
 * requires the video to be < 48 hours old.
 *
 * @quota ~101 units (100 search.list + 1 videos.list)
 */
export async function getChannelVideoVelocity(
  channelId: string,
): Promise<ChannelVideoVelocity | null> {
  try {
    const url = new URL(`${BASE_URL}/search`);
    url.searchParams.set('key', apiKey());
    url.searchParams.set('channelId', channelId);
    url.searchParams.set('part', 'snippet');
    url.searchParams.set('order', 'date');
    url.searchParams.set('type', 'video');
    url.searchParams.set('videoDuration', 'medium');
    url.searchParams.set('maxResults', '10');

    const searchRes = await fetch(url.toString());
    if (!searchRes.ok) {
      console.error(
        `[youtube-data] getChannelVideoVelocity search HTTP ${searchRes.status} for ${channelId}`,
      );
      return null;
    }

    const searchData = await searchRes.json();
    const videoIds: string[] = (searchData.items ?? []).map(
      (item: { id: { videoId: string } }) => item.id.videoId,
    );

    if (videoIds.length === 0) return { channelAvgViews: 0, videos: [] };

    const details = await getVideoDetails(videoIds);
    return computeVelocity(details);
  } catch (err) {
    console.error(`[youtube-data] getChannelVideoVelocity error for ${channelId}:`, err);
    void logError({
      route: 'lib/youtube-data/getChannelVideoVelocity',
      error: err instanceof Error ? err.message : String(err),
      details: { channel_id: channelId },
      severity: 'warn',
    });
    return null;
  }
}

// ---------------------------------------------------------------------------
// Function 5 — getCompetitorFullProfile
// ---------------------------------------------------------------------------

/**
 * Full competitor sync. Runs getChannelStats and getRecentVideos(20) in parallel,
 * then fetches all video details in a single batch. Velocity data is computed
 * from the same batch — no extra API calls.
 *
 * @quota ~203 units (1 channels.list + 200 search.list × 2 + 1 videos.list)
 */
export async function getCompetitorFullProfile(
  channelId: string,
): Promise<CompetitorFullProfile | null> {
  try {
    const [channelStats, summaries] = await Promise.all([
      getChannelStats(channelId),
      getRecentVideos(channelId, 20),
    ]);

    if (!channelStats) {
      console.error(
        `[youtube-data] getCompetitorFullProfile: could not fetch stats for ${channelId}`,
      );
      return null;
    }

    // One videos.list batch covers both recentVideos and velocityData
    const videoIds = summaries.map((v) => v.videoId);
    const recentVideos = await getVideoDetails(videoIds);
    const velocityData = computeVelocity(recentVideos);

    return {
      channel: channelStats,
      recentVideos,
      velocityData,
      syncedAt: new Date().toISOString(),
    };
  } catch (err) {
    console.error(`[youtube-data] getCompetitorFullProfile error for ${channelId}:`, err);
    void logError({
      route: 'lib/youtube-data/getCompetitorFullProfile',
      error: err instanceof Error ? err.message : String(err),
      details: { channel_id: channelId, error_stack: err instanceof Error ? err.stack : undefined },
    });
    return null;
  }
}

// ---------------------------------------------------------------------------
// Function 6 — getTopicCoverage
// ---------------------------------------------------------------------------

const TITLE_STOPWORDS = new Set([
  'a', 'an', 'the', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
  'of', 'with', 'is', 'it', 'my', 'i', 'you', 'your', 'we', 'our', 'this',
  'that', 'how', 'why', 'what', 'when', 'who', 'are', 'be', 'was', 'were',
  'have', 'has', 'had', 'do', 'did', 'not', 'no', 'so', 'if', 'as', 'up',
  'from', 'by', 'about', 'out', 'all', 'just', 'more', 'than', 'will', 'can',
  'get', 'got', 'its', 'im', 'vs', 'new', 'one', 'two', 'three',
]);

/**
 * Derive a topic profile from an array of VideoDetail objects for gap analysis.
 * Compare a user's output vs a competitor's to find uncovered topics.
 *
 * @quota 0 units (pure computation — no API calls)
 */
export function getTopicCoverage(videoDetails: VideoDetail[]): TopicCoverage {
  if (videoDetails.length === 0) {
    return {
      allTags: [],
      tagFrequency: {},
      topTags: [],
      categories: {},
      avgDurationSeconds: 0,
      commonTitleWords: [],
    };
  }

  // Tag frequency across all videos
  const tagFrequency: Record<string, number> = {};
  for (const video of videoDetails) {
    for (const tag of video.tags) {
      const normalized = tag.toLowerCase().trim();
      tagFrequency[normalized] = (tagFrequency[normalized] ?? 0) + 1;
    }
  }
  const allTags = Object.keys(tagFrequency);
  const topTags = allTags
    .sort((a, b) => tagFrequency[b] - tagFrequency[a])
    .slice(0, 20);

  // Category distribution
  const categories: Record<string, number> = {};
  for (const video of videoDetails) {
    const cat = video.categoryName || 'Unknown';
    categories[cat] = (categories[cat] ?? 0) + 1;
  }

  // Average duration
  const avgDurationSeconds = Math.round(
    videoDetails.reduce((sum, v) => sum + v.duration, 0) / videoDetails.length,
  );

  // Words appearing in 3+ distinct titles
  const wordTitleCount: Record<string, number> = {};
  for (const video of videoDetails) {
    const words = video.title
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length > 2 && !TITLE_STOPWORDS.has(w));

    for (const word of new Set(words)) {
      wordTitleCount[word] = (wordTitleCount[word] ?? 0) + 1;
    }
  }
  const commonTitleWords = Object.entries(wordTitleCount)
    .filter(([, count]) => count >= 3)
    .sort(([, a], [, b]) => b - a)
    .map(([word]) => word);

  return { allTags, tagFrequency, topTags, categories, avgDurationSeconds, commonTitleWords };
}
