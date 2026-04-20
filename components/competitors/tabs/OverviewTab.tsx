'use client'

interface OverviewTabProps {
  user: { name?: string | null }
  userSnapshot: Record<string, unknown> | null
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
  return `${m}:${String(sec).padStart(2, '0')}`
}

export function OverviewTab({ userSnapshot, competitor, competitorVideos }: OverviewTabProps) {
  const compAvgViews =
    competitorVideos.length > 0
      ? competitorVideos.reduce((sum, v) => sum + ((v.view_count as number) || 0), 0) /
        competitorVideos.length
      : 0

  const compAvgDuration =
    competitorVideos.length > 0
      ? competitorVideos.reduce((sum, v) => sum + ((v.duration_seconds as number) || 0), 0) /
        competitorVideos.length
      : 0

  const thirtyDaysAgo = new Date()
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
  const recentUploads = competitorVideos.filter(
    (v) => new Date(v.published_at as string) > thirtyDaysAgo,
  ).length
  const compUploadsPerWeek = recentUploads / 4.3
  const userUploadsPerWeek = ((userSnapshot?.videos_count as number) || 0) / 52

  const metrics = [
    {
      label: 'Subscribers',
      user: fmt((userSnapshot?.subscriber_count as number) || 0),
      competitor: fmt((competitor.subscriber_count as number) || 0),
      gap: ((competitor.subscriber_count as number) || 0) - ((userSnapshot?.subscriber_count as number) || 0),
    },
    {
      label: 'Avg views / video',
      user: fmt((userSnapshot?.avg_views_per_video as number) || 0),
      competitor: fmt(compAvgViews),
      gap: compAvgViews - ((userSnapshot?.avg_views_per_video as number) || 0),
    },
    {
      label: 'CTR',
      user: `${(((userSnapshot?.avg_ctr as number) || 0) * 100).toFixed(1)}%`,
      competitor: 'N/A',
      gap: 0,
    },
    {
      label: 'Avg watch time',
      user: fmtDuration((userSnapshot?.avg_view_duration_seconds as number) || 0),
      competitor: fmtDuration(compAvgDuration),
      gap: compAvgDuration - ((userSnapshot?.avg_view_duration_seconds as number) || 0),
    },
    {
      label: 'Upload frequency',
      user: `${userUploadsPerWeek.toFixed(1)}/week`,
      competitor: `${compUploadsPerWeek.toFixed(1)}/week`,
      gap: compUploadsPerWeek - userUploadsPerWeek,
    },
    {
      label: 'Total videos',
      user: fmt((userSnapshot?.videos_count as number) || 0),
      competitor: fmt((competitor.video_count as number) || competitorVideos.length || 0),
      gap: 0,
    },
  ]

  return (
    <div>
      <p style={{ color: '#888888', fontSize: 13, marginBottom: 20 }}>
        Side-by-side comparison with <strong style={{ color: '#ffffff' }}>{competitor.channel_name as string}</strong>
      </p>

      <div style={{ border: '1px solid #1a1a1a', borderRadius: 8, overflow: 'hidden' }}>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 120px 160px 100px',
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
              gridTemplateColumns: '1fr 120px 160px 100px',
              gap: 16,
              padding: '14px 20px',
              borderBottom: i < metrics.length - 1 ? '1px solid #111111' : 'none',
              alignItems: 'center',
            }}
          >
            <span style={{ color: '#888888', fontSize: 13 }}>{m.label}</span>
            <span style={{ color: '#ffffff', fontSize: 13, fontFamily: 'monospace' }}>{m.user}</span>
            <span style={{ color: '#ffffff', fontSize: 13, fontFamily: 'monospace' }}>{m.competitor}</span>
            <span
              style={{
                fontSize: 12,
                fontFamily: 'monospace',
                color: m.gap > 0 ? '#f87171' : m.gap < 0 ? '#4ade80' : '#444444',
              }}
            >
              {m.gap !== 0 ? (m.gap > 0 ? '−' : '+') : ''}
              {m.gap !== 0 ? fmt(Math.abs(m.gap)) : '—'}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
