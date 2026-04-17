'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import {
  LineChart,
  Line,
  ResponsiveContainer,
  Tooltip,
} from 'recharts'
import BlackholeLoader from '@/components/BlackholeLoader'
import { useSyncStatus } from '@/components/sync-context'
import type { User, ChannelSnapshot, GapScore, Competitor, Digest, Trend } from '@/types'

interface Props {
  user: User | null
  snapshots: ChannelSnapshot[]
  gapScore: GapScore | null
  competitors: Competitor[]
  recentDigests: Digest[]
  latestDigest: Digest | null
  latestTrend: Trend | null
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmt(n: number | null | undefined, dec = 1): string {
  if (n == null) return '—'
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(dec)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(dec)}K`
  return String(Math.round(n))
}

function timeAgo(iso: string | null | undefined): string {
  if (!iso) return 'never'
  const diff = Date.now() - new Date(iso).getTime()
  const hours = Math.floor(diff / 3_600_000)
  if (hours < 1) return 'just now'
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return days === 1 ? '1 day ago' : `${days} days ago`
}

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function scoreColor(score: number): string {
  if (score < 40) return '#ff4444'
  if (score < 70) return '#f5a623'
  return '#00c853'
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function Divider() {
  return <div style={{ height: 1, background: '#1a1a1a' }} />
}

function GhostBtn({
  children,
  href,
  onClick,
}: {
  children: React.ReactNode
  href?: string
  onClick?: () => void
}) {
  const s: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 4,
    padding: '4px 10px',
    borderRadius: 4,
    fontSize: 11,
    fontWeight: 500,
    color: '#888888',
    background: 'transparent',
    border: '1px solid #1a1a1a',
    cursor: 'pointer',
    textDecoration: 'none',
    lineHeight: 1.5,
  }
  if (href)
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" style={s}>
        {children}
      </a>
    )
  return (
    <button type="button" onClick={onClick} style={s}>
      {children}
    </button>
  )
}

function StatusDot({ ok }: { ok: boolean }) {
  return (
    <span
      style={{
        display: 'inline-block',
        width: 6,
        height: 6,
        borderRadius: '50%',
        background: ok ? '#00c853' : '#f5a623',
        marginRight: 6,
        flexShrink: 0,
      }}
    />
  )
}

function SmallBadge({ children, color }: { children: React.ReactNode; color: string }) {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        padding: '2px 7px',
        borderRadius: 3,
        fontSize: 11,
        fontWeight: 500,
        background: `${color}18`,
        color,
        border: `1px solid ${color}33`,
        whiteSpace: 'nowrap',
      }}
    >
      {children}
    </span>
  )
}

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: 16,
        padding: '7px 0',
        borderBottom: '1px solid #0d0d0d',
      }}
    >
      <span style={{ width: 88, flexShrink: 0, fontSize: 12, color: '#888888' }}>{label}</span>
      <span style={{ fontSize: 12, color: '#ffffff', flex: 1, minWidth: 0 }}>{value}</span>
    </div>
  )
}

// ─── Icons ────────────────────────────────────────────────────────────────────

function IconBranch() {
  return (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0 }}>
      <circle cx="4" cy="4" r="2" stroke="#888888" strokeWidth="1.5" />
      <circle cx="12" cy="4" r="2" stroke="#888888" strokeWidth="1.5" />
      <circle cx="4" cy="12" r="2" stroke="#888888" strokeWidth="1.5" />
      <path d="M4 6v4M6 4h3.17A2.83 2.83 0 0 1 12 6.83V6" stroke="#888888" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}

function IconCheck() {
  return (
    <svg width="9" height="9" viewBox="0 0 10 10" fill="none">
      <path d="M2 5l2.5 2.5L8 3" stroke="#000" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

// ─── Custom tooltip ───────────────────────────────────────────────────────────

function ChartTooltip({
  active,
  payload,
}: {
  active?: boolean
  payload?: Array<{ value: number }>
}) {
  if (!active || !payload?.length) return null
  return (
    <div
      style={{
        background: '#111111',
        border: '1px solid #1a1a1a',
        borderRadius: 4,
        padding: '6px 10px',
        fontSize: 11,
        color: '#ffffff',
      }}
    >
      {fmt(payload[0].value)} views
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function DashboardClient({
  user,
  snapshots,
  gapScore,
  competitors,
  recentDigests,
  latestDigest,
  latestTrend,
}: Props) {
  const { isSyncing } = useSyncStatus()
  const router = useRouter()

  useEffect(() => {
    if (!isSyncing && snapshots.length === 0) {
      router.refresh()
    }
  }, [isSyncing, snapshots.length, router])

  // ── Sync loading ──────────────────────────────────────────────────────────
  if (isSyncing) {
    return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100%',
          gap: 24,
          background: '#000000',
        }}
      >
        <BlackholeLoader />
        <div style={{ textAlign: 'center' }}>
          <p style={{ color: '#ffffff', fontSize: 13, fontWeight: 500, margin: 0 }}>
            Syncing your channel data...
          </p>
          <p style={{ color: '#888888', fontSize: 12, margin: '4px 0 0' }}>
            This takes about 10–15 seconds on first load.
          </p>
        </div>
      </div>
    )
  }

  // ── Empty state ────────────────────────────────────────────────────────────
  if (snapshots.length === 0) {
    return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100%',
          gap: 16,
          background: '#000000',
        }}
      >
        <p style={{ color: '#ffffff', fontSize: 13, fontWeight: 500, margin: 0 }}>
          No channel data yet.
        </p>
        <p style={{ color: '#888888', fontSize: 12, margin: 0 }}>
          Connect your YouTube channel to get started.
        </p>
        <a
          href="/api/sync"
          style={{
            marginTop: 8,
            padding: '6px 16px',
            borderRadius: 4,
            fontSize: 12,
            fontWeight: 500,
            color: '#000000',
            background: '#ffffff',
            textDecoration: 'none',
          }}
        >
          Connect YouTube
        </a>
      </div>
    )
  }

  // ── Data ───────────────────────────────────────────────────────────────────
  const latest = snapshots[snapshots.length - 1]
  const lastSynced = timeAgo(latest.created_at)
  const isFresh = latest.created_at
    ? Date.now() - new Date(latest.created_at).getTime() < 48 * 3600_000
    : false

  // Views chart: last 7 snapshots
  const viewsData = snapshots.slice(-7).map((s) => ({
    date: s.snapshot_date,
    views: s.avg_views_per_video ?? 0,
  }))

  // Gap recommendations
  const recs: string[] = []
  if (gapScore) {
    if (gapScore.views_gap_score > 40) recs.push('Increase views')
    if (gapScore.ctr_gap_score > 40) recs.push('Improve CTR')
    if (gapScore.watch_time_gap_score > 40) recs.push('Extend watch time')
    if (gapScore.upload_frequency_gap_score > 40) recs.push('Upload more often')
  }

  // Checklist
  const checklist = [
    { label: 'Connect YouTube Channel', done: !!user?.youtube_channel_id },
    { label: 'Add competitor channels',  done: competitors.length > 0 },
    { label: 'First digest generated',   done: !!latestDigest },
    { label: 'Upgrade to Starter plan',  done: user?.subscription_plan !== 'free' },
    { label: 'Enable weekly alerts',     done: user?.subscription_plan !== 'free' },
  ]
  const doneCount = checklist.filter((c) => c.done).length

  // Digest preview (first substantial line of content)
  const digestPreview = latestDigest?.content
    ? latestDigest.content.split('\n').find((l) => l.trim().length > 20)?.trim().slice(0, 55) ?? '...'
    : null

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div
      style={{
        background: '#000000',
        color: '#ffffff',
        fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
        minHeight: '100%',
      }}
    >
      {/* ── Page header ─────────────────────────────────────────────────────── */}
      <div
        style={{
          padding: '14px 24px',
          borderBottom: '1px solid #1a1a1a',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <h1 style={{ fontSize: 14, fontWeight: 500, color: '#ffffff', margin: 0 }}>
          {user?.name ?? 'Overview'}
        </h1>
        <span style={{ fontSize: 12, color: '#444444' }}>Last synced: {lastSynced}</span>
      </div>

      {/* ── Tab bar ─────────────────────────────────────────────────────────── */}
      <div
        style={{
          display: 'flex',
          borderBottom: '1px solid #1a1a1a',
          padding: '0 24px',
        }}
      >
        {['Overview', 'Deployments', 'Analytics', 'Settings'].map((tab) => {
          const active = tab === 'Overview'
          return (
            <button
              key={tab}
              type="button"
              style={{
                padding: '11px 0',
                marginRight: 24,
                fontSize: 13,
                fontWeight: 400,
                color: active ? '#ffffff' : '#888888',
                background: 'transparent',
                border: 'none',
                borderBottom: active ? '2px solid #ffffff' : '2px solid transparent',
                cursor: 'pointer',
                marginBottom: -1,
                letterSpacing: 0,
              }}
            >
              {tab}
            </button>
          )
        })}
      </div>

      {/* ── Two-column layout ────────────────────────────────────────────────── */}
      <div style={{ display: 'flex' }}>

        {/* ── Left column (65%) ─────────────────────────────────────────────── */}
        <div style={{ flex: '0 0 65%', minWidth: 0 }}>

          {/* Section 1 — Production Deployment card */}
          <div style={{ padding: 24 }}>
            <div style={{ border: '1px solid #1a1a1a' }}>

              {/* Card header */}
              <div
                style={{
                  padding: '10px 16px',
                  borderBottom: '1px solid #1a1a1a',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}
              >
                <span
                  style={{
                    fontSize: 11,
                    color: '#888888',
                    textTransform: 'uppercase',
                    letterSpacing: '0.06em',
                    fontWeight: 500,
                  }}
                >
                  Production Deployment
                </span>
                <div style={{ display: 'flex', gap: 8 }}>
                  <GhostBtn>Refresh Data</GhostBtn>
                  {user?.youtube_channel_id && (
                    <GhostBtn href={`https://youtube.com/channel/${user.youtube_channel_id}`}>
                      Visit ↗
                    </GhostBtn>
                  )}
                </div>
              </div>

              {/* Card body */}
              <div style={{ padding: 16, display: 'flex', gap: 20 }}>

                {/* Channel thumbnail / preview placeholder */}
                <div
                  style={{
                    width: 200,
                    aspectRatio: '16/9',
                    flexShrink: 0,
                    background: '#0d0d0d',
                    border: '1px solid #1a1a1a',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <span
                    style={{
                      fontSize: 28,
                      fontWeight: 700,
                      color: '#222222',
                      letterSpacing: '-1px',
                    }}
                  >
                    {user?.name?.[0]?.toUpperCase() ?? '?'}
                  </span>
                </div>

                {/* Info rows */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <InfoRow label="Deployment" value={user?.name ?? '—'} />
                  <InfoRow
                    label="Domains"
                    value={
                      latest.subscriber_count
                        ? `${fmt(latest.subscriber_count)} subscribers`
                        : '—'
                    }
                  />
                  <InfoRow
                    label="Status"
                    value={
                      <span style={{ display: 'flex', alignItems: 'center' }}>
                        <StatusDot ok={isFresh} />
                        <span style={{ color: isFresh ? '#00c853' : '#f5a623' }}>
                          {isFresh ? 'Ready' : 'Stale'}
                        </span>
                      </span>
                    }
                  />
                  <InfoRow label="Created" value={lastSynced} />
                  <InfoRow
                    label="Source"
                    value={
                      <span
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 6,
                          overflow: 'hidden',
                        }}
                      >
                        <IconBranch />
                        <span style={{ fontWeight: 500, color: '#ffffff', flexShrink: 0 }}>
                          weekly-digest
                        </span>
                        {digestPreview && (
                          <>
                            <span style={{ color: '#333333', flexShrink: 0 }}>·</span>
                            <span
                              style={{
                                color: '#444444',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                              }}
                            >
                              {digestPreview}
                            </span>
                          </>
                        )}
                      </span>
                    }
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Section 2 — Gap Score bar */}
          <Divider />
          <div
            style={{
              padding: '12px 24px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 16,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <span style={{ fontSize: 12, color: '#888888' }}>Gap Score</span>
              {gapScore ? (
                <span
                  style={{
                    fontSize: 20,
                    fontWeight: 600,
                    color: scoreColor(gapScore.overall_score),
                    fontVariantNumeric: 'tabular-nums',
                    lineHeight: 1,
                  }}
                >
                  {gapScore.overall_score}
                </span>
              ) : (
                <span style={{ fontSize: 20, color: '#333333' }}>—</span>
              )}
              {gapScore && (
                <span style={{ fontSize: 12, color: '#444444' }}>/ 100</span>
              )}
            </div>
            {recs.length > 0 && (
              <SmallBadge color="#f5a623">{recs.length} Recommendations</SmallBadge>
            )}
          </div>
          <Divider />

          {/* Section 3 — Activity row */}
          <div
            style={{
              padding: '12px 24px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 16,
            }}
          >
            <p style={{ fontSize: 12, color: '#888888', margin: 0, flex: 1 }}>
              To improve your score, push to the{' '}
              <span style={{ color: '#ffffff', fontWeight: 500 }}>weekly digest</span>
              {' '}branch.
              {gapScore?.primary_bottleneck && (
                <> Primary gap: {gapScore.primary_bottleneck}.</>
              )}
            </p>
            <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
              <a
                href="/ideas"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  padding: '4px 10px',
                  borderRadius: 4,
                  fontSize: 11,
                  fontWeight: 500,
                  color: '#888888',
                  background: 'transparent',
                  border: '1px solid #1a1a1a',
                  textDecoration: 'none',
                }}
              >
                Ideas
              </a>
              <a
                href="/digest"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  padding: '4px 10px',
                  borderRadius: 4,
                  fontSize: 11,
                  fontWeight: 500,
                  color: '#888888',
                  background: 'transparent',
                  border: '1px solid #1a1a1a',
                  textDecoration: 'none',
                }}
              >
                Digest
              </a>
            </div>
          </div>
          <Divider />

        </div>

        {/* ── Right column (35%) ────────────────────────────────────────────── */}
        <div style={{ flex: '0 0 35%', borderLeft: '1px solid #1a1a1a', minWidth: 0 }}>

          {/* Widget 1 — Niche Activity */}
          <div style={{ padding: 24 }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: 16,
              }}
            >
              <span style={{ fontSize: 12, fontWeight: 500, color: '#ffffff' }}>
                Niche Activity
              </span>
              <div style={{ display: 'flex', gap: 10 }}>
                {['6h', '24h', '7d'].map((t, i) => (
                  <span
                    key={t}
                    style={{
                      fontSize: 11,
                      color: i === 2 ? '#ffffff' : '#444444',
                      cursor: 'default',
                    }}
                  >
                    {t}
                  </span>
                ))}
              </div>
            </div>

            <div style={{ display: 'flex', gap: 28, marginBottom: 16 }}>
              <div>
                <p style={{ fontSize: 11, color: '#888888', margin: '0 0 4px' }}>
                  Viral Videos
                </p>
                <p
                  style={{
                    fontSize: 22,
                    fontWeight: 600,
                    color: '#ffffff',
                    margin: 0,
                    fontVariantNumeric: 'tabular-nums',
                    lineHeight: 1,
                  }}
                >
                  {latestTrend ? '1+' : '0'}
                </p>
              </div>
              <div>
                <p style={{ fontSize: 11, color: '#888888', margin: '0 0 4px' }}>
                  Competitors
                </p>
                <p
                  style={{
                    fontSize: 22,
                    fontWeight: 600,
                    color: '#ffffff',
                    margin: 0,
                    fontVariantNumeric: 'tabular-nums',
                    lineHeight: 1,
                  }}
                >
                  {competitors.length}
                </p>
              </div>
            </div>

            {/* Sparkline */}
            {viewsData.length > 1 && (
              <ResponsiveContainer width="100%" height={44}>
                <LineChart data={viewsData} margin={{ top: 2, right: 2, bottom: 2, left: 2 }}>
                  <Line
                    type="monotone"
                    dataKey="views"
                    stroke="#333333"
                    strokeWidth={1.5}
                    dot={false}
                    isAnimationActive={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
          <Divider />

          {/* Widget 2 — Performance */}
          <div style={{ padding: 24 }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: 4,
              }}
            >
              <span style={{ fontSize: 12, fontWeight: 500, color: '#ffffff' }}>
                Performance
              </span>
              <span style={{ fontSize: 11, color: '#444444' }}>1w</span>
            </div>
            <p style={{ fontSize: 11, color: '#444444', margin: '0 0 14px' }}>
              Avg views / video
            </p>

            {viewsData.length > 1 ? (
              <ResponsiveContainer width="100%" height={100}>
                <LineChart data={viewsData} margin={{ top: 4, right: 4, bottom: 4, left: 4 }}>
                  <Line
                    type="monotone"
                    dataKey="views"
                    stroke="#ffffff"
                    strokeWidth={1.5}
                    dot={false}
                    isAnimationActive={false}
                  />
                  <Tooltip
                    content={<ChartTooltip />}
                    cursor={{ stroke: '#1a1a1a', strokeWidth: 1 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div
                style={{
                  height: 100,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <span style={{ fontSize: 12, color: '#333333' }}>Not enough data yet</span>
              </div>
            )}
          </div>
          <Divider />

          {/* Widget 3 — Intelligence Checklist */}
          <div style={{ padding: 24 }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: 16,
              }}
            >
              <span style={{ fontSize: 12, fontWeight: 500, color: '#ffffff' }}>
                Intelligence Checklist
              </span>
              <span style={{ fontSize: 11, color: '#888888' }}>
                {doneCount}/{checklist.length}
              </span>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
              {checklist.map(({ label, done }) => (
                <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div
                    style={{
                      width: 15,
                      height: 15,
                      borderRadius: 3,
                      flexShrink: 0,
                      background: done ? '#00c853' : 'transparent',
                      border: done ? '1px solid #00c853' : '1px solid #2a2a2a',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    {done && <IconCheck />}
                  </div>
                  <span
                    style={{
                      fontSize: 12,
                      color: done ? '#555555' : '#cccccc',
                      textDecoration: done ? 'line-through' : 'none',
                    }}
                  >
                    {label}
                  </span>
                </div>
              ))}
            </div>
          </div>

        </div>
      </div>

      {/* ── Recent Digests — full width ──────────────────────────────────────── */}
      <Divider />

      {/* Section header */}
      <div
        style={{
          padding: '14px 24px',
          borderBottom: '1px solid #1a1a1a',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <span style={{ fontSize: 12, fontWeight: 500, color: '#ffffff' }}>
          Recent Digests
        </span>
        <a
          href="/digest"
          style={{ fontSize: 12, color: '#888888', textDecoration: 'none' }}
        >
          View all →
        </a>
      </div>

      {/* Table column headers */}
      <div
        style={{
          padding: '8px 24px',
          borderBottom: '1px solid #1a1a1a',
          display: 'grid',
          gridTemplateColumns: '160px 70px 1fr 110px',
          gap: 16,
          alignItems: 'center',
        }}
      >
        {['Date', 'Score', 'Top Opportunity', 'Status'].map((h) => (
          <span
            key={h}
            style={{
              fontSize: 11,
              color: '#444444',
              fontWeight: 500,
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
            }}
          >
            {h}
          </span>
        ))}
      </div>

      {/* Digest rows */}
      {recentDigests.length > 0 ? (
        recentDigests.map((d) => {
          const digestScore =
            d.key_metrics && typeof d.key_metrics === 'object'
              ? (d.key_metrics as Record<string, unknown>).overallGapScore
              : null
          const scoreNum = typeof digestScore === 'number' ? digestScore : null
          const preview = d.content.slice(0, 90).replace(/\n/g, ' ')

          return (
            <div
              key={d.id}
              style={{
                padding: '11px 24px',
                borderBottom: '1px solid #1a1a1a',
                display: 'grid',
                gridTemplateColumns: '160px 70px 1fr 110px',
                gap: 16,
                alignItems: 'center',
              }}
            >
              <span style={{ fontSize: 12, color: '#888888' }}>
                {fmtDate(d.created_at)}
              </span>
              <span
                style={{
                  fontSize: 12,
                  color: scoreNum != null ? scoreColor(scoreNum) : '#444444',
                  fontVariantNumeric: 'tabular-nums',
                  fontWeight: scoreNum != null ? 500 : 400,
                }}
              >
                {scoreNum != null ? scoreNum : '—'}
              </span>
              <span
                style={{
                  fontSize: 12,
                  color: '#888888',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {preview}...
              </span>
              <span>
                <SmallBadge color={d.email_sent_at ? '#00c853' : '#888888'}>
                  {d.email_sent_at ? 'Delivered' : 'Draft'}
                </SmallBadge>
              </span>
            </div>
          )
        })
      ) : (
        <div style={{ padding: '28px 24px', textAlign: 'center' }}>
          <span style={{ fontSize: 12, color: '#333333' }}>
            No digests generated yet. First digest arrives Monday.
          </span>
        </div>
      )}

    </div>
  )
}
