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
  // Average from top 10 for a stable baseline
  const avgViews =
    competitorVideos.length > 0
      ? competitorVideos
          .slice(0, 10)
          .reduce((sum, v) => sum + ((v.view_count as number) || 0), 0) /
        Math.min(competitorVideos.length, 10)
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
        <p style={{ color: '#888888', fontSize: 13, margin: '0 0 6px' }}>
          No recent videos data available.
        </p>
        <p style={{ color: '#444444', fontSize: 12, margin: 0 }}>
          Videos will sync during the next daily refresh.
        </p>
      </div>
    )
  }

  // Show latest 3 videos
  const latestVideos = competitorVideos.slice(0, 3)

  return (
    <div>
      <p style={{ color: '#555555', fontSize: 12, marginBottom: 20, fontFamily: 'monospace' }}>
        Their 3 most recent uploads
        {competitorVideos.length > 3 && (
          <span style={{ marginLeft: 8, color: '#333333' }}>
            ({competitorVideos.length} total synced)
          </span>
        )}
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {latestVideos.map((video) => {
          const views = (video.view_count as number) || 0
          const ratio = avgViews > 0 ? views / avgViews : 0
          const isAbove = ratio >= 1
          const isViral = video.is_viral as boolean

          return (
            <div
              key={video.id as string}
              style={{
                padding: '16px 20px',
                background: '#0a0a0a',
                border: '1px solid #1a1a1a',
                borderRadius: 8,
                display: 'flex',
                gap: 16,
                alignItems: 'flex-start',
              }}
            >
              {!!(video.thumbnail_url as string) && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={video.thumbnail_url as string}
                  alt={video.title as string}
                  style={{ width: 128, height: 80, objectFit: 'cover', borderRadius: 4, flexShrink: 0 }}
                />
              )}

              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 8 }}>
                  <div style={{ color: '#ffffff', fontSize: 13, fontWeight: 500, lineHeight: 1.4, flex: 1 }}>
                    {video.title as string}
                  </div>
                  {isViral && (
                    <span
                      style={{
                        fontSize: 9,
                        fontFamily: 'monospace',
                        color: '#fbbf24',
                        background: '#1a1200',
                        border: '1px solid #3d2e00',
                        borderRadius: 3,
                        padding: '2px 5px',
                        flexShrink: 0,
                      }}
                    >
                      VIRAL
                    </span>
                  )}
                </div>

                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 16px', fontSize: 12, fontFamily: 'monospace', color: '#888888', marginBottom: 8 }}>
                  <span>👁 {fmt(views)}</span>
                  <span>💬 {fmt((video.comment_count as number) || 0)}</span>
                  <span>👍 {fmt((video.like_count as number) || 0)}</span>
                  <span>⏱ {fmtDuration((video.duration_seconds as number) || 0)}</span>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: 11, fontFamily: 'monospace', color: '#444444' }}>
                    {new Date(video.published_at as string).toLocaleDateString('en-US', {
                      month: 'long',
                      day: 'numeric',
                      year: 'numeric',
                    })}
                  </span>
                  <span
                    style={{
                      fontSize: 12,
                      fontFamily: 'monospace',
                      color: isAbove ? '#4ade80' : '#555555',
                    }}
                  >
                    {ratio.toFixed(1)}× avg{isAbove ? ' ↑' : ''}
                  </span>
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
