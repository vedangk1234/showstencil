'use client'

interface ContentTabProps {
  competitor: Record<string, unknown>
  competitorVideos: Record<string, unknown>[]
}

function fmtDuration(s: number): string {
  const m = Math.floor(s / 60)
  const sec = Math.round(s % 60)
  return `${m}:${String(sec).padStart(2, '0')}`
}

export function ContentTab({ competitor, competitorVideos }: ContentTabProps) {
  const avgLength =
    competitorVideos.length > 0
      ? competitorVideos.reduce((sum, v) => sum + ((v.duration_seconds as number) || 0), 0) /
        competitorVideos.length
      : 0

  const dayCounts: Record<string, number> = {}
  competitorVideos.forEach((v) => {
    if (!v.published_at) return
    const day = new Date(v.published_at as string).toLocaleDateString('en-US', { weekday: 'long' })
    dayCounts[day] = (dayCounts[day] || 0) + 1
  })

  const topDays = Object.entries(dayCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([day]) => day)

  const keywords = (competitor.sub_niche_keywords as string[]) || []

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 24 }}>
        <div
          style={{
            padding: '16px 20px',
            background: '#0a0a0a',
            border: '1px solid #1a1a1a',
            borderRadius: 8,
          }}
        >
          <div style={{ fontSize: 10, color: '#444444', fontFamily: 'monospace', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 8 }}>
            Average video length
          </div>
          <div style={{ fontSize: 28, fontFamily: 'monospace', color: '#ffffff', fontWeight: 600 }}>
            {fmtDuration(avgLength)}
          </div>
          <div style={{ fontSize: 11, color: '#555555', marginTop: 4 }}>
            Based on {competitorVideos.length} recent videos
          </div>
        </div>

        <div
          style={{
            padding: '16px 20px',
            background: '#0a0a0a',
            border: '1px solid #1a1a1a',
            borderRadius: 8,
          }}
        >
          <div style={{ fontSize: 10, color: '#444444', fontFamily: 'monospace', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 8 }}>
            Top publishing days
          </div>
          <div style={{ fontSize: 15, color: '#ffffff', fontWeight: 500, lineHeight: 1.5 }}>
            {topDays.length > 0 ? topDays.join(', ') : 'No pattern detected'}
          </div>
          <div style={{ fontSize: 11, color: '#555555', marginTop: 4 }}>
            Most common upload days
          </div>
        </div>
      </div>

      <div
        style={{
          padding: '16px 20px',
          background: '#0a0a0a',
          border: '1px solid #1a1a1a',
          borderRadius: 8,
        }}
      >
        <div style={{ fontSize: 10, color: '#444444', fontFamily: 'monospace', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 12 }}>
          Sub-niche focus
        </div>
        <div style={{ fontSize: 20, fontStyle: 'italic', fontFamily: 'Georgia, serif', color: '#ffffff', marginBottom: 12 }}>
          {(competitor.sub_niche as string) || 'General'}
        </div>

        {keywords.length > 0 && (
          <>
            <div style={{ fontSize: 10, color: '#555555', fontFamily: 'monospace', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 8 }}>
              Key topics
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {keywords.map((kw, i) => (
                <span
                  key={i}
                  style={{
                    padding: '3px 10px',
                    background: '#111111',
                    border: '1px solid #1a1a1a',
                    borderRadius: 4,
                    fontSize: 12,
                    color: '#888888',
                    fontFamily: 'monospace',
                  }}
                >
                  {kw}
                </span>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
