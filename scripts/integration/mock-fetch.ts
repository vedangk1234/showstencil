/**
 * scripts/integration/mock-fetch.ts
 * Tiny fetch interceptor for integration tests.
 *
 * Each test case calls install() with an array of route handlers, runs the code
 * under test, then restore() before the next case. Any URL that no handler
 * matches throws — tests fail loudly when sync starts hitting an unstubbed
 * endpoint instead of silently calling production.
 *
 * Used only by scripts/integration/sync-pipeline.test.ts. Not for production.
 */

export interface CallRecord {
  url: string
  method: string
  body?: string
}

export interface RouteHandler {
  name: string
  match: (url: string) => boolean
  respond: (req: { url: string; method: string; body?: string }) => Response | Promise<Response>
}

let originalFetch: typeof globalThis.fetch | null = null
let activeHandlers: RouteHandler[] = []
const callLog: CallRecord[] = []

// URLs that always passthrough to the real fetch — never intercepted, never logged.
// Supabase JS SDK uses fetch internally for every query; we need real DB calls.
const PASSTHROUGH_PATTERNS = ['supabase.co', 'supabase.in']

function shouldPassthrough(url: string): boolean {
  return PASSTHROUGH_PATTERNS.some((p) => url.includes(p))
}

export function install(handlers: RouteHandler[]): void {
  if (!originalFetch) originalFetch = globalThis.fetch
  activeHandlers = handlers
  callLog.length = 0

  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url =
      typeof input === 'string'
        ? input
        : input instanceof URL
        ? input.href
        : (input as Request).url

    // Supabase calls go through unintercepted — they hit the real DB.
    if (shouldPassthrough(url)) {
      if (!originalFetch) throw new Error('mock-fetch: original fetch not captured')
      return originalFetch(input, init)
    }

    const method = (init?.method ?? 'GET').toUpperCase()
    let body: string | undefined
    if (typeof init?.body === 'string') body = init.body

    callLog.push({ url, method, body })

    for (const h of activeHandlers) {
      if (h.match(url)) {
        return h.respond({ url, method, body })
      }
    }

    // Strict mode — no handler means we never want to hit this URL in a test.
    throw new Error(
      `mock-fetch: no handler matched ${method} ${url}\n` +
        `registered handlers: ${activeHandlers.map((h) => h.name).join(', ')}`,
    )
  }) as typeof globalThis.fetch
}

export function restore(): void {
  if (originalFetch) globalThis.fetch = originalFetch
  activeHandlers = []
  callLog.length = 0
}

export function getCallLog(): CallRecord[] {
  return [...callLog]
}

export function callsMatching(predicate: (c: CallRecord) => boolean): CallRecord[] {
  return callLog.filter(predicate)
}

// ───────────────────────────────────────────────────────────────────────────────
// Stock handlers — pre-built common responses
// ───────────────────────────────────────────────────────────────────────────────

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

/**
 * YouTube Analytics API — generic responder.
 * Inspects the `metrics=` URL param and returns one row of values keyed by metric.
 * Pass an empty `rowValues` object (or null) to simulate "no data".
 */
export function youtubeAnalyticsHandler(opts: {
  rowValues: Record<string, number> | null
  videoRows?: Array<Record<string, number | string>>
}): RouteHandler {
  return {
    name: 'youtube-analytics',
    match: (url) => url.includes('youtubeanalytics.googleapis.com'),
    respond: ({ url }) => {
      const parsed = new URL(url)
      const metricsParam = parsed.searchParams.get('metrics') ?? ''
      const dimensions = parsed.searchParams.get('dimensions') ?? ''
      const metrics = metricsParam.split(',').filter(Boolean)

      // The per-video query (`dimensions=video`) returns one row per video.
      if (dimensions === 'video') {
        const columnHeaders = [{ name: 'video' }, ...metrics.map((m) => ({ name: m }))]
        const rows = (opts.videoRows ?? []).map((v) => {
          const row: Array<string | number> = [String(v.video ?? '')]
          for (const m of metrics) row.push(typeof v[m] === 'number' ? (v[m] as number) : 0)
          return row
        })
        return jsonResponse({ columnHeaders, rows })
      }

      // Demographics + traffic + daily — return empty rows. Sync handles this gracefully;
      // the niche/sync-pipeline tests don't depend on these payloads.
      if (
        dimensions === 'ageGroup,gender' ||
        dimensions === 'country' ||
        dimensions === 'insightTrafficSourceType' ||
        dimensions === 'day'
      ) {
        return jsonResponse({ columnHeaders: metrics.map((m) => ({ name: m })), rows: [] })
      }

      // Overview (no dimensions) — single row of aggregate values.
      if (!opts.rowValues) {
        return jsonResponse({ columnHeaders: metrics.map((m) => ({ name: m })), rows: [] })
      }
      const columnHeaders = metrics.map((m) => ({ name: m }))
      const row = metrics.map((m) => opts.rowValues![m] ?? 0)
      return jsonResponse({ columnHeaders, rows: [row] })
    },
  }
}

/**
 * YouTube Data API channels.list — returns one channel with a configurable
 * subscriber count. Pass `subscriberCount: null` to simulate the API succeeding
 * but returning no subscriber data; pass `subscriberCount: undefined` to omit
 * the channel entirely (Data API returns no items).
 */
export function youtubeChannelsHandler(opts: {
  channelId: string
  subscriberCount: number | null
}): RouteHandler {
  return {
    name: 'youtube-channels',
    match: (url) => url.includes('googleapis.com/youtube/v3/channels'),
    respond: () => {
      if (opts.subscriberCount === null) {
        return jsonResponse({ items: [] })
      }
      return jsonResponse({
        items: [
          {
            id: opts.channelId,
            snippet: {
              title: 'Test Channel',
              publishedAt: '2024-01-01T00:00:00Z',
              thumbnails: { default: { url: 'https://example.com/thumb.jpg' } },
              country: 'US',
            },
            statistics: {
              subscriberCount: String(opts.subscriberCount),
              viewCount: '1000000',
              videoCount: '25',
            },
            brandingSettings: { channel: { keywords: '' } },
            topicDetails: { topicCategories: [] },
          },
        ],
      })
    },
  }
}

/**
 * YouTube Data API videos.list — returns one item per requested video ID.
 * `videoDetails` keyed by videoId; missing IDs (not present in videoDetails
 * AND not present in `missingIds`) return empty defaults.
 *
 * `missingIds` — IDs that should be OMITTED from the response entirely,
 * mirroring the real Data API behaviour when an ID is private/deleted/
 * restricted/inaccessible. The response items[] array will simply not
 * contain these IDs (no null placeholders).
 */
export function youtubeVideosHandler(opts: {
  videoDetails: Record<string, { title: string; publishedAt: string; durationSeconds?: number }>
  missingIds?: string[]
}): RouteHandler {
  const missingSet = new Set(opts.missingIds ?? [])
  return {
    name: 'youtube-videos',
    match: (url) => url.includes('googleapis.com/youtube/v3/videos'),
    respond: ({ url }) => {
      const parsed = new URL(url)
      const idsParam = parsed.searchParams.get('id') ?? ''
      const ids = idsParam.split(',').filter(Boolean)
      const items = ids
        .filter((id) => !missingSet.has(id))
        .map((id) => {
          const d = opts.videoDetails[id] ?? {
            title: `Video ${id}`,
            publishedAt: new Date().toISOString(),
            durationSeconds: 300,
          }
          const dur = d.durationSeconds ?? 300
          const minutes = Math.floor(dur / 60)
          const seconds = dur % 60
          return {
            id,
            snippet: {
              title: d.title,
              publishedAt: d.publishedAt,
              thumbnails: { high: { url: 'https://example.com/h.jpg' }, default: { url: 'https://example.com/d.jpg' } },
              tags: [],
              categoryId: '27',
              defaultLanguage: 'en',
            },
            contentDetails: {
              duration: `PT${minutes}M${seconds}S`,
            },
            statistics: {
              viewCount: '1000',
              likeCount: '50',
              commentCount: '5',
            },
            status: { madeForKids: false },
            liveStreamingDetails: undefined,
          }
        })
      return jsonResponse({ items })
    },
  }
}

/**
 * Anthropic Claude — returns a fake messages.create response with the supplied
 * text as the assistant content. Used to mock detectNiche etc.
 */
export function anthropicHandler(opts: { responseText: string }): RouteHandler {
  return {
    name: 'anthropic',
    match: (url) => url.includes('api.anthropic.com'),
    respond: () => {
      return jsonResponse({
        id: 'msg_test',
        type: 'message',
        role: 'assistant',
        model: 'claude-sonnet-4-6',
        content: [{ type: 'text', text: opts.responseText }],
        stop_reason: 'end_turn',
        usage: { input_tokens: 100, output_tokens: 50 },
      })
    },
  }
}

/**
 * Google OAuth token endpoint — controls token-refresh paths.
 * status=200 + access_token returns new token. Any other status simulates failure.
 */
export function oauth2Handler(opts: {
  status: number
  accessToken?: string
  errorMessage?: string
}): RouteHandler {
  return {
    name: 'oauth2',
    match: (url) => url.includes('oauth2.googleapis.com/token'),
    respond: () => {
      if (opts.status === 200) {
        return jsonResponse({
          access_token: opts.accessToken ?? 'refreshed_test_token',
          expires_in: 3600,
        })
      }
      return jsonResponse(
        { error: 'invalid_grant', error_description: opts.errorMessage ?? 'failed' },
        opts.status,
      )
    },
  }
}

/**
 * Catches the fire-and-forget POST to /api/users/detect-sub-niche issued by
 * syncUserChannel. We don't want it to throw and break the test.
 */
export function subNicheNoopHandler(): RouteHandler {
  return {
    name: 'sub-niche-noop',
    match: (url) => url.includes('/api/users/detect-sub-niche'),
    respond: () => jsonResponse({ ok: true }),
  }
}
