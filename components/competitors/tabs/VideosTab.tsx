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
  return `${m}m ${String(sec).padStart(2, '0')}s`
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const days = Math.floor(diff / 86_400_000)
  if (days === 0) return 'today'
  if (days === 1) return '1 day ago'
  if (days < 30) return `${days} days ago`
  const months = Math.floor(days / 30)
  return months === 1 ? '1 month ago' : `${months} months ago`
}

export function VideosTab({ competitorVideos }: VideosTabProps) {
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

  // Sort by published date descending, show up to 10
  const sorted = [...competitorVideos]
    .sort((a, b) => {
      const ta = a.published_at ? new Date(a.published_at as string).getTime() : 0
      const tb = b.published_at ? new Date(b.published_at as string).getTime() : 0
      return tb - ta
    })
    .slice(0, 10)

  return (
    <div>
      <p style={{ color: '#555555', fontSize: 12, marginBottom: 20, fontFamily: 'monospace' }}>
        {sorted.length} most recent uploads
        {competitorVideos.length > sorted.length && (
          <span style={{ marginLeft: 8, color: '#333333' }}>
            ({competitorVideos.length} total synced)
          </span>
        )}
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {sorted.map((video, idx) => {
          const views = (video.view_count as number) || 0
          const likes = (video.like_count as number) || 0
          const duration = (video.duration_seconds as number) || 0
          const velocity = video.velocity_score as number | null
          const isViral = video.is_viral as boolean
          const publishedAt = video.published_at as string | null
          const videoId = video.youtube_video_id as string

          return (
            <div
              key={idx}
              style={{
                padding: '16px 20px',
                background: '#0a0a0a',
                border: `1px solid ${isViral ? '#3d2e00' : '#1a1a1a'}`,
                borderRadius: 8,
                display: 'flex',
                gap: 16,
                alignItems: 'flex-start',
              }}
            >
              {/* Thumbnail */}
              {video.thumbnail_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={video.thumbnail_url as string}
                  alt={video.title as string}
                  style={{ width: 96, height: 54, objectFit: 'cover', borderRadius: 4, flexShrink: 0 }}
                />
              ) : (
                <div
                  style={{
                    width: 96,
                    height: 54,
                    background: '#1a1a1a',
                    borderRadius: 4,
                    flexShrink: 0,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#333333',
                    fontSize: 20,
                  }}
                >
                  ▶
                </div>
              )}

              <div style={{ flex: 1, minWidth: 0 }}>
                {/* Title row */}
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 8 }}>
                  <a
                    href={`https://youtube.com/watch?v=${videoId}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ color: '#ffffff', fontSize: 13, fontWeight: 500, lineHeight: 1.4, flex: 1, textDecoration: 'none' }}
                  >
                    {video.title as string}
                  </a>
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
                        whiteSpace: 'nowrap',
                      }}
                    >
                      🔥 VIRAL
                    </span>
                  )}
                </div>

                {/* Stats row */}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 14px', fontSize: 12, fontFamily: 'monospace', color: '#888888' }}>
                  <span>👁 {fmt(views)} views</span>
                  <span>👍 {fmt(likes)}</span>
                  {duration > 0 && <span>⏱ {fmtDuration(duration)}</span>}
                  {velocity != null && (
                    <span style={{ color: velocity > 100 ? '#fbbf24' : '#888888' }}>
                      ⚡ {velocity.toFixed(1)} views/hr
                    </span>
                  )}
                </div>

                {/* Date */}
                {publishedAt && (
                  <div style={{ fontSize: 11, fontFamily: 'monospace', color: '#444444', marginTop: 6 }}>
                    {timeAgo(publishedAt)} · {new Date(publishedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
