'use client'

interface UserVideoRow {
  duration_seconds: number | null
  published_at: string | null
  view_count: number | null
}

interface OverviewTabProps {
  user: { name?: string | null }
  userSnapshot: Record<string, unknown> | null
  userVideos: UserVideoRow[]
  competitor: Record<string, unknown>
  competitorVideos: Record<string, unknown>[]
}

function fmt(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return Math.round(n).toLocaleString()
}

function fmtOrDash(n: number | null | undefined): string {
  if (n == null) return '—'
  return fmt(n)
}

function fmtDuration(s: number): string {
  const m = Math.floor(s / 60)
  const sec = Math.round(s % 60)
  return `${m}m ${String(sec).padStart(2, '0')}s`
}

function fmtDurationOrDash(s: number | null | undefined): string {
  if (s == null || s === 0) return '—'
  return fmtDuration(s)
}

const DASH_SPAN = (
  <span style={{ color: '#444444', fontSize: 13, fontFamily: 'monospace' }}>—</span>
)

const NOT_PUBLIC = (
  <div>
    <div style={{ color: '#888888', fontSize: 13, fontFamily: 'monospace', fontStyle: 'italic' }}>
      Not publicly available
    </div>
    <div style={{ color: '#333333', fontSize: 10, fontFamily: 'monospace', marginTop: 2 }}>
      YouTube doesn&apos;t expose this for other channels
    </div>
  </div>
)

export function OverviewTab({ userSnapshot, userVideos, competitor, competitorVideos }: OverviewTabProps) {
  if (!userSnapshot) {
    return (
      <div style={{
        padding: '48px 24px',
        textAlign: 'center',
        background: '#0a0a0a',
        border: '1px dashed #1a1a1a',
        borderRadius: 8,
      }}>
        <p style={{ color: '#888888', fontSize: 13, margin: '0 0 6px' }}>
          Overview data is still syncing.
        </p>
        <p style={{ color: '#444444', fontSize: 12, margin: 0 }}>
          Data syncs overnight — check back tomorrow.
        </p>
      </div>
    )
  }

  // ── User-side computed metrics ───────────────────────────────────────────
  const userAvgVideoLength =
    userVideos.length > 0
      ? Math.round(
          userVideos.reduce((sum, v) => sum + (v.duration_seconds ?? 0), 0) / userVideos.length,
        )
      : null

  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
  const recentUserVideos = userVideos.filter(
    (v) => v.published_at && new Date(v.published_at) >= thirtyDaysAgo,
  )
  const userUploadFrequency = recentUserVideos.length

  // ── Competitor-side computed metrics ─────────────────────────────────────
  // Prefer stored columns (written by daily cron / track pipeline).
  // Fall back to computing from loaded videos array.
  // Return null (not 0) when there is genuinely no data — renders "—".
  const compAvgViews: number | null =
    (competitor.avg_views_per_video as number | null) ??
    (competitorVideos.length > 0
      ? competitorVideos.reduce((sum, v) => sum + ((v.view_count as number) || 0), 0) /
        competitorVideos.length
      : null)

  const compAvgLength: number | null =
    (competitor.avg_video_length_seconds as number | null) ??
    (competitorVideos.length > 0
      ? competitorVideos.reduce((sum, v) => sum + ((v.duration_seconds as number) || 0), 0) /
        competitorVideos.length
      : null)

  const compUploadFreq: number | null =
    (competitor.upload_frequency_30d as number | null) ??
    (competitorVideos.length > 0
      ? competitorVideos.filter(
          (v) => v.published_at && new Date(v.published_at as string) >= thirtyDaysAgo,
        ).length
      : null)

  const compVideoCount: number | null =
    (competitor.video_count as number | null) ??
    (competitorVideos.length > 0 ? competitorVideos.length : null)

  // "—" when no videos loaded; actual count (possibly 0) when videos are present
  const viralCount = competitorVideos.filter((v) => v.is_viral).length
  const viralDisplay = competitorVideos.length === 0 ? '—' : String(viralCount)

  // Gap for total videos (positive = competitor has more, shown as −X in red)
  const totalVideosGap = (() => {
    const userCount = (userSnapshot?.videos_count as number | null) ?? (userVideos.length || null)
    if (userCount == null || compVideoCount == null) return null
    return compVideoCount - userCount
  })()

  // Gap for avg views (null when we have no data to compare)
  const avgViewsGap =
    compAvgViews != null
      ? compAvgViews - ((userSnapshot?.avg_views_per_video as number) || 0)
      : null

  const metrics = [
    {
      label: 'Subscribers',
      user: fmt((userSnapshot?.subscriber_count as number) || 0),
      competitorEl: (
        <span style={{ color: '#ffffff', fontSize: 13, fontFamily: 'monospace' }}>
          {fmt((competitor.subscriber_count as number) || 0)}
        </span>
      ),
      gap: ((competitor.subscriber_count as number) || 0) - ((userSnapshot?.subscriber_count as number) || 0),
    },
    {
      label: 'Total videos',
      user: fmtOrDash((userSnapshot?.videos_count as number | null) ?? (userVideos.length || null)),
      competitorEl: compVideoCount != null
        ? <span style={{ color: '#ffffff', fontSize: 13, fontFamily: 'monospace' }}>{fmt(compVideoCount)}</span>
        : DASH_SPAN,
      gap: totalVideosGap,
    },
    {
      label: 'Avg views / video',
      user: fmtOrDash((userSnapshot?.avg_views_per_video as number | null)),
      competitorEl: compAvgViews != null
        ? <span style={{ color: '#ffffff', fontSize: 13, fontFamily: 'monospace' }}>{fmt(compAvgViews)}</span>
        : DASH_SPAN,
      gap: avgViewsGap,
    },
    {
      label: 'Avg video length',
      user: fmtDurationOrDash(userAvgVideoLength),
      competitorEl: (compAvgLength != null && compAvgLength > 0)
        ? <span style={{ color: '#ffffff', fontSize: 13, fontFamily: 'monospace' }}>{fmtDuration(compAvgLength)}</span>
        : DASH_SPAN,
      gap: null,
    },
    {
      label: 'Upload frequency',
      user: `${userUploadFrequency} / month`,
      competitorEl: compUploadFreq != null
        ? <span style={{ color: '#ffffff', fontSize: 13, fontFamily: 'monospace' }}>{compUploadFreq} / month</span>
        : DASH_SPAN,
      gap: null,
      note: 'Based on last 30 days',
    },
    {
      label: 'CTR',
      user: `${((userSnapshot?.avg_ctr as number) || 0).toFixed(1)}%`,
      competitorEl: NOT_PUBLIC,
      gap: null,
    },
    {
      label: 'Avg watch time',
      user: (() => {
        const s = userSnapshot?.avg_view_duration_seconds as number | undefined
        return s && s > 0 ? fmtDuration(s) : '—'
      })(),
      competitorEl: NOT_PUBLIC,
      gap: null,
    },
    {
      label: 'Viral videos',
      user: '—',
      competitorEl: (
        <span style={{ color: viralCount > 0 ? '#fbbf24' : '#ffffff', fontSize: 13, fontFamily: 'monospace' }}>
          {viralDisplay}
        </span>
      ),
      gap: null,
      note: 'Videos with 3× normal velocity in first 48h',
    },
  ]

  return (
    <div>
      <p style={{ color: '#888888', fontSize: 13, marginBottom: 20 }}>
        Side-by-side comparison with{' '}
        <strong style={{ color: '#ffffff' }}>{competitor.channel_name as string}</strong>
      </p>

      <div style={{ border: '1px solid #1a1a1a', borderRadius: 8, overflow: 'hidden' }}>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 130px 200px 100px',
            gap: 16,
            padding: '10px 20px',
            background: '#080808',
            borderBottom: '1px solid #111111',
          }}
        >
          {['Metric', 'You', competitor.channel_name as string, 'Gap'].map((h) => (
            <span
              key={h}
              style={{
                fontSize: 10,
                fontWeight: 600,
                color: '#444444',
                fontFamily: 'monospace',
                textTransform: 'uppercase',
                letterSpacing: '0.1em',
              }}
            >
              {h}
            </span>
          ))}
        </div>

        {metrics.map((m, i) => (
          <div
            key={i}
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 130px 200px 100px',
              gap: 16,
              padding: '14px 20px',
              borderBottom: i < metrics.length - 1 ? '1px solid #111111' : 'none',
              alignItems: 'center',
            }}
          >
            <div>
              <span style={{ color: '#888888', fontSize: 13 }}>{m.label}</span>
              {'note' in m && m.note && (
                <div style={{ color: '#333333', fontSize: 10, fontFamily: 'monospace', marginTop: 2 }}>
                  {m.note}
                </div>
              )}
            </div>
            <span style={{ color: '#ffffff', fontSize: 13, fontFamily: 'monospace' }}>{m.user}</span>
            {m.competitorEl}
            <span
              style={{
                fontSize: 12,
                fontFamily: 'monospace',
                color:
                  m.gap == null
                    ? '#444444'
                    : m.gap > 0
                    ? '#f87171'
                    : m.gap < 0
                    ? '#4ade80'
                    : '#444444',
              }}
            >
              {m.gap == null || m.gap === 0
                ? '—'
                : `${m.gap > 0 ? '−' : '+'}${fmt(Math.abs(m.gap))}`}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
