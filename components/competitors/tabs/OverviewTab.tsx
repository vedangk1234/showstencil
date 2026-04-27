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

function fmtDuration(s: number): string {
  const m = Math.floor(s / 60)
  const sec = Math.round(s % 60)
  return `${m}m ${String(sec).padStart(2, '0')}s`
}

export function OverviewTab({ userSnapshot, userVideos, competitor, competitorVideos }: OverviewTabProps) {
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
  const userUploadFrequency = recentUserVideos.length // videos in last 30 days

  // ── Competitor-side computed metrics ─────────────────────────────────────
  // Prefer stored columns on the competitors row (written by daily refresh cron).
  // Fall back to computing from the loaded videos array.
  const compAvgViews =
    (competitor.avg_views_per_video as number | null) ??
    (competitorVideos.length > 0
      ? competitorVideos.reduce((sum, v) => sum + ((v.view_count as number) || 0), 0) /
        competitorVideos.length
      : 0)

  const compAvgLength =
    (competitor.avg_video_length_seconds as number | null) ??
    (competitorVideos.length > 0
      ? competitorVideos.reduce((sum, v) => sum + ((v.duration_seconds as number) || 0), 0) /
        competitorVideos.length
      : 0)

  const compUploadFreq =
    (competitor.upload_frequency_30d as number | null) ??
    (() => {
      const recent = competitorVideos.filter(
        (v) => v.published_at && new Date(v.published_at as string) >= thirtyDaysAgo,
      )
      return recent.length
    })()

  const compVideoCount =
    (competitor.video_count as number | null) ?? competitorVideos.length

  const viralCount = competitorVideos.filter((v) => v.is_viral).length

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

  const metrics = [
    {
      label: 'Subscribers',
      user: fmt((userSnapshot?.subscriber_count as number) || 0),
      competitorEl: <span style={{ color: '#ffffff', fontSize: 13, fontFamily: 'monospace' }}>{fmt((competitor.subscriber_count as number) || 0)}</span>,
      gap: ((competitor.subscriber_count as number) || 0) - ((userSnapshot?.subscriber_count as number) || 0),
    },
    {
      label: 'Total videos',
      user: fmt((userSnapshot?.videos_count as number) || userVideos.length || 0),
      competitorEl: <span style={{ color: '#ffffff', fontSize: 13, fontFamily: 'monospace' }}>{fmt(compVideoCount)}</span>,
      gap: null as number | null,
    },
    {
      label: 'Avg views / video',
      user: fmt((userSnapshot?.avg_views_per_video as number) || 0),
      competitorEl: <span style={{ color: '#ffffff', fontSize: 13, fontFamily: 'monospace' }}>{fmt(compAvgViews)}</span>,
      gap: compAvgViews - ((userSnapshot?.avg_views_per_video as number) || 0),
    },
    {
      label: 'Avg video length',
      user: userAvgVideoLength != null ? fmtDuration(userAvgVideoLength) : '—',
      competitorEl: <span style={{ color: '#ffffff', fontSize: 13, fontFamily: 'monospace' }}>{fmtDuration(compAvgLength)}</span>,
      gap: null,
    },
    {
      label: 'Upload frequency',
      user: `${userUploadFrequency} / month`,
      competitorEl: <span style={{ color: '#ffffff', fontSize: 13, fontFamily: 'monospace' }}>{compUploadFreq} / month</span>,
      gap: null,
      note: 'Based on last 30 days',
    },
    {
      label: 'CTR',
      user: `${(((userSnapshot?.avg_ctr as number) || 0) * 100).toFixed(1)}%`,
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
      competitorEl: <span style={{ color: viralCount > 0 ? '#fbbf24' : '#ffffff', fontSize: 13, fontFamily: 'monospace' }}>{viralCount}</span>,
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
