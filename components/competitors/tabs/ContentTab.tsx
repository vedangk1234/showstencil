'use client'

interface UserVideoRow {
  duration_seconds: number | null
  published_at: string | null
  view_count: number | null
}

interface ContentTabProps {
  competitor: Record<string, unknown>
  competitorVideos: Record<string, unknown>[]
  userVideos: UserVideoRow[]
  nicheId: string | null
}

const NICHE_NAMES: Record<string, string> = {
  finance: 'Finance',
  tech: 'Tech',
  gaming: 'Gaming',
  cooking: 'Cooking',
  fitness: 'Fitness',
  beauty: 'Beauty',
  travel: 'Travel',
  education: 'Education',
  business: 'Business',
  entertainment: 'Entertainment',
  diy: 'DIY',
  vlog: 'Vlog',
}

function formatDuration(seconds: number | null): string {
  if (!seconds || seconds === 0) return '—'
  const m = Math.floor(seconds / 60)
  const s = Math.round(seconds % 60)
  return s > 0 ? `${m}m ${String(s).padStart(2, '0')}s` : `${m}m`
}

export function ContentTab({ competitor, competitorVideos, userVideos, nicheId }: ContentTabProps) {
  if (competitorVideos.length === 0) {
    return (
      <div style={{
        padding: '48px 24px',
        textAlign: 'center',
        background: '#0a0a0a',
        border: '1px dashed #1a1a1a',
        borderRadius: 8,
      }}>
        <p style={{ color: '#888888', fontSize: 13, margin: '0 0 6px' }}>
          No content data yet — video data syncs overnight.
        </p>
        <p style={{ color: '#444444', fontSize: 12, margin: 0 }}>
          Data syncs overnight — check back tomorrow.
        </p>
      </div>
    )
  }

  // ── Competitor avg length ────────────────────────────────────────────────
  const compAvgLength: number | null =
    (competitor.avg_video_length_seconds as number | null) ??
    (competitorVideos.length > 0
      ? competitorVideos.reduce((sum, v) => sum + ((v.duration_seconds as number) || 0), 0) /
        competitorVideos.length
      : null)

  // ── Upload frequency ─────────────────────────────────────────────────────
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
  const uploadFreqDisplay =
    (competitor.upload_frequency_30d as number | null) != null
      ? `${(competitor.upload_frequency_30d as number).toFixed(1)} videos / month`
      : competitorVideos.length > 0
      ? `${competitorVideos.filter((v) => v.published_at && new Date(v.published_at as string) >= thirtyDaysAgo).length} videos / month`
      : '—'

  // ── User avg length ──────────────────────────────────────────────────────
  const userAvgLength: number | null =
    userVideos.length > 0
      ? Math.round(
          userVideos.reduce((sum, v) => sum + (v.duration_seconds ?? 0), 0) / userVideos.length,
        )
      : null

  // ── Posting days ─────────────────────────────────────────────────────────
  const nowMs = Date.now()
  const thirtyDaysAgoMs = nowMs - 30 * 24 * 60 * 60 * 1000
  const sixtyDaysAgoMs = nowMs - 60 * 24 * 60 * 60 * 1000

  let videosForDays = competitorVideos.filter(
    (v) => v.published_at && new Date(v.published_at as string).getTime() >= thirtyDaysAgoMs,
  )
  if (videosForDays.length < 3) {
    videosForDays = competitorVideos.filter(
      (v) => v.published_at && new Date(v.published_at as string).getTime() >= sixtyDaysAgoMs,
    )
  }
  if (videosForDays.length < 3) {
    videosForDays = competitorVideos
  }

  const daysWindowLabel: string =
    videosForDays === competitorVideos
      ? 'all synced'
      : videosForDays.every(
            (v) => v.published_at && new Date(v.published_at as string).getTime() >= thirtyDaysAgoMs,
          )
        ? '30 days'
        : '60 days'

  const dayFrequency = videosForDays.reduce((acc: Record<string, number>, video) => {
    if (!video.published_at) return acc
    const day = new Date(video.published_at as string).toLocaleDateString('en-US', { weekday: 'long', timeZone: 'UTC' })
    acc[day] = (acc[day] || 0) + 1
    return acc
  }, {} as Record<string, number>)

  const sortedDays = Object.entries(dayFrequency).sort((a, b) => b[1] - a[1])
  const allDaysEqual = sortedDays.length > 1 && sortedDays.every(([, c]) => c === 1)
  const topDay: string | null = sortedDays.length > 0 ? sortedDays[0][0] : null

  const keywords = (competitor.sub_niche_keywords as string[]) || []
  const nicheName = (nicheId && NICHE_NAMES[nicheId]) ?? 'this niche'

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16, marginBottom: 24 }}>
        {/* Competitor avg video length */}
        <div style={{ padding: '16px 20px', background: '#0a0a0a', border: '1px solid #1a1a1a', borderRadius: 8 }}>
          <div style={{ fontSize: 10, color: '#444444', fontFamily: 'monospace', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 8 }}>
            Their avg video length
          </div>
          <div style={{ fontSize: 24, fontFamily: 'monospace', color: '#ffffff', fontWeight: 600 }}>
            {formatDuration(compAvgLength)}
          </div>
          <div style={{ fontSize: 11, color: '#555555', marginTop: 4 }}>
            {competitorVideos.length > 0
              ? `Based on ${competitorVideos.length} recent videos`
              : 'No videos synced yet'}
          </div>
        </div>

        {/* User avg video length */}
        <div style={{ padding: '16px 20px', background: '#0a0a0a', border: '1px solid #1a1a1a', borderRadius: 8 }}>
          <div style={{ fontSize: 10, color: '#444444', fontFamily: 'monospace', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 8 }}>
            Your avg video length
          </div>
          <div style={{ fontSize: 24, fontFamily: 'monospace', color: '#ffffff', fontWeight: 600 }}>
            {formatDuration(userAvgLength)}
          </div>
          <div style={{ fontSize: 11, color: '#555555', marginTop: 4 }}>
            {userVideos.length > 0 ? `Based on ${userVideos.length} synced videos` : 'No videos synced yet'}
          </div>
        </div>

        {/* Top posting days */}
        <div style={{ padding: '16px 20px', background: '#0a0a0a', border: '1px solid #1a1a1a', borderRadius: 8 }}>
          <div style={{ fontSize: 10, color: '#444444', fontFamily: 'monospace', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 8 }}>
            Top publishing days
          </div>
          <div style={{ fontSize: 15, color: '#ffffff', fontWeight: 500, lineHeight: 1.5 }}>
            {allDaysEqual ? 'Varies' : topDay ?? '—'}
          </div>
          <div style={{ fontSize: 11, color: '#555555', marginTop: 4 }}>
            {allDaysEqual
              ? 'Consistent uploading on different days'
              : `Based on last ${daysWindowLabel} uploads`}
          </div>
        </div>
      </div>

      {/* Upload frequency */}
      <div style={{ padding: '12px 20px', background: '#0a0a0a', border: '1px solid #1a1a1a', borderRadius: 8, marginBottom: 16 }}>
        <div style={{ fontSize: 10, color: '#444444', fontFamily: 'monospace', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 4 }}>
          Upload frequency (last 30 days)
        </div>
        <div style={{ fontSize: 18, fontFamily: 'monospace', color: '#ffffff', fontWeight: 600 }}>
          {uploadFreqDisplay}
        </div>
      </div>

      {/* Sub-niche focus */}
      <div style={{ padding: '16px 20px', background: '#0a0a0a', border: '1px solid #1a1a1a', borderRadius: 8 }}>
        <div style={{ fontSize: 10, color: '#444444', fontFamily: 'monospace', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 4 }}>
          Sub-niche focus
        </div>
        <div style={{ fontSize: 11, color: '#444444', marginBottom: 10 }}>
          The specific angle this channel focuses on within {nicheName}
        </div>
        <div style={{ fontSize: 20, fontStyle: 'italic', fontFamily: 'Georgia, serif', color: '#ffffff', marginBottom: 16 }}>
          {(competitor.sub_niche as string) || 'General'}
        </div>

        <div style={{ fontSize: 10, color: '#555555', fontFamily: 'monospace', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 8 }}>
          Key topics
        </div>
        {keywords.length > 0 ? (
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
        ) : (
          <div style={{ fontSize: 12, color: '#444444', fontStyle: 'italic', fontFamily: 'monospace' }}>
            No specific keywords detected yet — sub-niche is still being analyzed
          </div>
        )}
      </div>
    </div>
  )
}
