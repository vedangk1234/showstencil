'use client'

interface VideosTabProps {
  competitorVideos: Record<string, unknown>[]
}

function fmt(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return String(n)
}

function fmtDuration(s: number): string {
  const m = Math.floor(s / 60)
  const sec = Math.round(s % 60)
  return `${m}:${String(sec).padStart(2, '0')}`
}

export function VideosTab({ competitorVideos }: VideosTabProps) {
  const avgViews =
    competitorVideos.length > 0
      ? competitorVideos.reduce((sum, v) => sum + ((v.view_count as number) || 0), 0) /
        competitorVideos.length
      : 0

  if (competitorVideos.length === 0) {
    return (
      <div
        style={{
          padding: '48px 24px',
          textAlign: 'center',
          background: '#0a0a0a',
          border: '1px dashed #1a1a1a',
          borderRadius: 8,
        }}
      >
        <p style={{ color: '#888888', fontSize: 13, margin: 0 }}>No recent videos data available.</p>
      </div>
    )
  }

  return (
    <div>
      <div style={{ border: '1px solid #1a1a1a', borderRadius: 8, overflow: 'hidden' }}>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 90px 80px 80px',
            gap: 12,
            padding: '10px 20px',
            background: '#080808',
            borderBottom: '1px solid #111111',
          }}
        >
          {['Title', 'Views', 'Length', 'vs. Avg'].map((h) => (
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

        {competitorVideos.slice(0, 15).map((video, i) => {
          const views = (video.view_count as number) || 0
          const ratio = avgViews > 0 ? views / avgViews : 0
          const isAbove = ratio >= 1
          const isViral = video.is_viral as boolean

          return (
            <div
              key={video.id as string}
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 90px 80px 80px',
                gap: 12,
                padding: '12px 20px',
                borderBottom:
                  i < Math.min(competitorVideos.length, 15) - 1 ? '1px solid #111111' : 'none',
                alignItems: 'center',
              }}
            >
              <div>
                <div style={{ color: '#ffffff', fontSize: 13, fontWeight: 500, lineHeight: 1.3 }}>
                  {video.title as string}
                  {isViral && (
                    <span
                      style={{
                        marginLeft: 6,
                        fontSize: 9,
                        fontFamily: 'monospace',
                        color: '#fbbf24',
                        background: '#1a1200',
                        border: '1px solid #3d2e00',
                        borderRadius: 3,
                        padding: '1px 5px',
                        verticalAlign: 'middle',
                      }}
                    >
                      VIRAL
                    </span>
                  )}
                </div>
                <div style={{ color: '#444444', fontSize: 11, marginTop: 2, fontFamily: 'monospace' }}>
                  {new Date(video.published_at as string).toLocaleDateString('en-US', {
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric',
                  })}
                </div>
              </div>
              <span style={{ color: '#aaaaaa', fontSize: 13, fontFamily: 'monospace' }}>
                {fmt(views)}
              </span>
              <span style={{ color: '#555555', fontSize: 12, fontFamily: 'monospace' }}>
                {fmtDuration((video.duration_seconds as number) || 0)}
              </span>
              <span
                style={{
                  fontSize: 12,
                  fontFamily: 'monospace',
                  color: isAbove ? '#4ade80' : '#555555',
                }}
              >
                {ratio.toFixed(1)}×{isAbove ? ' ↑' : ''}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
