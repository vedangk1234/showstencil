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
import type {
  User,
  ChannelSnapshot,
  GapScore,
  Competitor,
  Digest,
  Trend,
} from '@/types'

interface Props {
  user: User | null
  snapshots: ChannelSnapshot[]
  gapScore: GapScore | null
  competitors: Competitor[]
  recentDigests: Digest[]
  latestDigest: Digest | null
  latestTrend: Trend | null
}

// ─── Design tokens ────────────────────────────────────────────────────────────

const T = {
  bg:      '#0A0A0A',
  bg2:     '#111111',
  surface: '#141414',
  surface2:'#1A1A1A',
  line:    '#222222',
  line2:   '#2A2A2A',
  ink:     '#EDEDED',
  ink2:    '#A1A1A1',
  ink3:    '#6E6E6E',
  ink4:    '#4A4A4A',
  accent:  'oklch(78% 0.19 145)',
  amber:   'oklch(78% 0.17 75)',
  blue:    'oklch(72% 0.14 235)',
  red:     'oklch(63% 0.22 25)',
  serif:   '"Instrument Serif", ui-serif, Georgia, serif',
  sans:    '"Geist", ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif',
  mono:    '"Geist Mono", ui-monospace, SFMono-Regular, Menlo, monospace',
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(n: number | null | undefined, dec = 1): string {
  if (n == null) return '—'
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(dec)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(dec)}K`
  return String(Math.round(n))
}

function fmtMoney(n: number | null | undefined): string {
  if (n == null) return '—'
  if (n >= 1000) return `$${(n / 1000).toFixed(1)}K`
  return `$${Math.round(n)}`
}

function timeAgo(iso: string | null | undefined): string {
  if (!iso) return 'never'
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60_000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return days === 1 ? '1d ago' : `${days}d ago`
}

function fmtWeek(iso: string | null | undefined): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function gapColor(score: number): string {
  if (score >= 70) return T.accent
  if (score >= 40) return T.amber
  return T.red
}

function gapFillColor(score: number): string {
  if (score >= 70) return T.red
  if (score >= 40) return T.amber
  return T.accent
}

// ─── Primitives ───────────────────────────────────────────────────────────────

function Eyebrow({ children, strong }: { children: React.ReactNode; strong?: boolean }) {
  return (
    <span style={{
      fontFamily: T.mono,
      fontSize: 10.5,
      letterSpacing: '0.16em',
      textTransform: 'uppercase',
      color: strong ? T.ink : T.ink3,
      fontWeight: strong ? 500 : 400,
    }}>{children}</span>
  )
}

function Btn({
  children, primary, href, onClick,
}: { children: React.ReactNode; primary?: boolean; href?: string; onClick?: () => void }) {
  const s: React.CSSProperties = {
    fontFamily: T.sans,
    fontSize: 12.5,
    padding: '6px 12px',
    border: `1px solid ${primary ? T.ink : T.line}`,
    background: primary ? T.ink : 'transparent',
    color: primary ? T.bg : T.ink,
    cursor: 'pointer',
    textDecoration: 'none',
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    letterSpacing: '-0.005em',
  }
  if (href) return <a href={href} style={s}>{children}</a>
  return <button type="button" onClick={onClick} style={s}>{children}</button>
}

function PulseDot() {
  return (
    <span style={{
      display: 'inline-block',
      width: 6, height: 6, borderRadius: '50%',
      background: T.accent,
      animation: 'stencil-pulse 2s infinite',
    }} />
  )
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function DashboardClient({
  user, snapshots, gapScore, competitors, recentDigests, latestDigest, latestTrend,
}: Props) {
  const { isSyncing } = useSyncStatus()
  const router = useRouter()

  useEffect(() => {
    if (!isSyncing && snapshots.length === 0) router.refresh()
  }, [isSyncing, snapshots.length, router])

  // ── Loading ────────────────────────────────────────────────────────────────
  if (isSyncing) {
    return (
      <Shell>
        <div style={{
          display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
          minHeight: '70vh', gap: 24,
        }}>
          <BlackholeLoader />
          <div style={{ textAlign: 'center' }}>
            <p style={{ color: T.ink, fontSize: 14, fontWeight: 500, margin: 0 }}>
              Syncing your channel data…
            </p>
            <p style={{ color: T.ink3, fontSize: 12, margin: '6px 0 0', fontFamily: T.mono }}>
              first sync · 10–15s
            </p>
          </div>
        </div>
      </Shell>
    )
  }

  // ── Empty ──────────────────────────────────────────────────────────────────
  if (!snapshots?.length) {
    return (
      <Shell>
        <div style={{
          display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
          minHeight: '70vh', gap: 16,
        }}>
          <h1 style={{
            fontFamily: T.serif, fontSize: 56, margin: 0, letterSpacing: '-0.025em',
          }}>
            No data <em style={{ color: T.ink2 }}>yet.</em>
          </h1>
          <p style={{ color: T.ink2, fontSize: 13.5, margin: 0, maxWidth: '40ch', textAlign: 'center' }}>
            Connect your YouTube channel and we&apos;ll pull a full snapshot of your performance,
            your competitors, and the gaps you can close.
          </p>
          <div style={{ marginTop: 8 }}>
            <Btn primary href="/api/sync">Connect YouTube</Btn>
          </div>
        </div>
      </Shell>
    )
  }

  // ── Safe data extraction ───────────────────────────────────────────────────
  const latest = snapshots[snapshots.length - 1]
  const lastSynced = timeAgo(latest?.created_at)

  // Trend deltas (latest vs ~7 snapshots ago)
  const earlier = snapshots[Math.max(0, snapshots.length - 8)] ?? snapshots[0]
  const subDelta   = (latest?.subscriber_count ?? 0)           - (earlier?.subscriber_count ?? 0)
  const viewsDelta = (latest?.avg_views_per_video ?? 0)        - (earlier?.avg_views_per_video ?? 0)
  const ctrDelta   = (latest?.avg_ctr ?? 0)                    - (earlier?.avg_ctr ?? 0)
  const watchDelta = (latest?.avg_view_duration_seconds ?? 0)  - (earlier?.avg_view_duration_seconds ?? 0)
  const revDelta   = (latest?.estimated_monthly_revenue ?? 0)  - (earlier?.estimated_monthly_revenue ?? 0)

  // Chart series
  const chartData = snapshots.slice(-30).map((s) => ({
    date: s.snapshot_date,
    you: s.avg_views_per_video ?? 0,
  }))

  // Checklist
  const checklist = [
    { label: 'Connect YouTube channel',    done: !!user?.youtube_channel_id },
    { label: 'Add competitor channels',    done: (competitors?.length ?? 0) > 0 },
    { label: 'First digest generated',     done: !!latestDigest },
    { label: 'Upgrade to paid plan',       done: user?.subscription_plan !== 'free' },
    { label: 'Enable weekly trend alerts', done: user?.subscription_plan !== 'free' },
  ]
  const doneCount = checklist.filter(c => c.done).length

  // Gap breakdown rows
  const gapRows = gapScore ? [
    { label: 'Avg views / video', score: gapScore.views_gap_score ?? 0 },
    { label: 'Click-through rate', score: gapScore.ctr_gap_score ?? 0 },
    { label: 'Watch time',         score: gapScore.watch_time_gap_score ?? 0 },
    { label: 'Upload frequency',   score: gapScore.upload_frequency_gap_score ?? 0 },
    { label: 'Topic coverage',     score: gapScore.topic_coverage_gap_score ?? 0 },
  ] : []

  const userAvg = latest?.avg_views_per_video ?? 1
  const activeCompetitors = competitors?.filter(c => c.is_active) ?? []
  const competitorsSorted = [...activeCompetitors]
    .sort((a, b) => (b.subscriber_count ?? 0) - (a.subscriber_count ?? 0))
    .slice(0, 6)

  return (
    <Shell>
      <style>{`
        @keyframes stencil-pulse {
          0%   { box-shadow: 0 0 0 0 color-mix(in srgb, ${T.accent} 60%, transparent); }
          70%  { box-shadow: 0 0 0 10px transparent; }
          100% { box-shadow: 0 0 0 0 transparent; }
        }
      `}</style>

      {/* ===== HERO ===== */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: '1fr auto',
        gap: 32,
        alignItems: 'end',
        paddingBottom: 24,
        borderBottom: `1px solid ${T.line}`,
      }}>
        <div>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 10,
            color: T.ink3, fontFamily: T.mono, fontSize: 11,
            letterSpacing: '0.16em', textTransform: 'uppercase',
          }}>
            <span>Channel · {fmtWeek(new Date().toISOString())}</span>
            <span style={{ color: T.ink4 }}>·</span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: T.accent }}>
              <PulseDot /> last sync {lastSynced}
            </span>
          </div>
          <h1 style={{
            fontFamily: T.serif, fontWeight: 400,
            fontSize: 60, lineHeight: 0.95, letterSpacing: '-0.025em',
            margin: '10px 0 0',
          }}>
            Close <em style={{ fontStyle: 'italic', color: T.ink2 }}>the gap.</em>
          </h1>
          <p style={{ fontSize: 13.5, color: T.ink2, margin: '8px 0 0', maxWidth: '56ch' }}>
            {gapScore ? (
              <>
                You sit <strong style={{ color: T.ink }}>{gapScore.overall_score}</strong> points behind your niche.
                {gapScore.primary_bottleneck && (
                  <> Primary bottleneck: <strong style={{ color: T.ink }}>{gapScore.primary_bottleneck}</strong>.</>
                )}
                {(gapScore.estimated_revenue_gap ?? 0) > 0 && (
                  <> Closing it could unlock{' '}
                    <strong style={{ color: T.accent }}>{fmtMoney(gapScore.estimated_revenue_gap)}/mo</strong>{' '}
                    in additional revenue.
                  </>
                )}
              </>
            ) : (
              <>Your first gap analysis is being generated. It will arrive with your next weekly digest.</>
            )}
          </p>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'flex-end' }}>
          <Pill>
            <span style={{ color: T.accent }}>●</span> tracking{' '}
            <strong style={{ color: T.ink, marginLeft: 4 }}>{competitors?.length ?? 0}</strong> channels
          </Pill>
          <Pill>
            plan: <strong style={{ color: T.ink, marginLeft: 4 }}>{user?.subscription_plan ?? 'free'}</strong>
          </Pill>
        </div>
      </div>

      {/* ===== GAP SCORE PANEL ===== */}
      {gapScore && (
        <div style={{
          marginTop: 24,
          border: `1px solid ${T.line}`,
          background: `linear-gradient(rgba(255,255,255,0.035) 1px, transparent 1px) 0 0 / 100% 24px, ${T.bg2}`,
          padding: 24,
          display: 'grid',
          gridTemplateColumns: '280px 1fr',
          gap: 36,
          alignItems: 'center',
        }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <Eyebrow>Overall Gap Score</Eyebrow>
            <div style={{
              fontFamily: T.serif, fontStyle: 'italic',
              fontSize: 140, lineHeight: 0.85, letterSpacing: '-0.04em',
              color: gapColor(gapScore.overall_score),
              fontVariantNumeric: 'tabular-nums',
            }}>
              {gapScore.overall_score}
            </div>
            <div style={{ fontFamily: T.mono, fontSize: 11, color: T.ink3, maxWidth: '24ch' }}>
              higher = bigger opportunity vs. your niche
            </div>
          </div>

          {gapRows.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {gapRows.map(row => (
                <div key={row.label} style={{
                  display: 'grid',
                  gridTemplateColumns: '180px 1fr 60px',
                  gap: 14, alignItems: 'center',
                  fontFamily: T.mono, fontSize: 11.5, color: T.ink2,
                }}>
                  <span style={{ color: T.ink }}>{row.label}</span>
                  <span style={{ height: 6, background: T.surface, position: 'relative', overflow: 'hidden' }}>
                    <span style={{
                      display: 'block', height: '100%',
                      width: `${Math.min(100, row.score)}%`,
                      background: gapFillColor(row.score),
                    }} />
                  </span>
                  <span style={{ textAlign: 'right', color: T.ink, fontWeight: 500 }}>{row.score}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ===== METRIC STRIP ===== */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(5, 1fr)',
        border: `1px solid ${T.line}`,
        borderTop: gapScore ? 'none' : `1px solid ${T.line}`,
        marginTop: gapScore ? 0 : 24,
      }}>
        <Metric
          k="Subscribers"
          v={fmt(latest?.subscriber_count, 1)}
          delta={subDelta >= 0 ? `▲ ${fmt(subDelta, 0)} / 7d` : `▼ ${fmt(Math.abs(subDelta), 0)}`}
          up={subDelta >= 0}
        />
        <Metric
          k="Avg views / video"
          v={fmt(latest?.avg_views_per_video, 1)}
          delta={viewsDelta >= 0 ? `▲ ${fmt(viewsDelta, 0)}` : `▼ ${fmt(Math.abs(viewsDelta), 0)}`}
          up={viewsDelta >= 0}
        />
        <Metric
          k="CTR"
          v={latest?.avg_ctr != null ? `${(latest.avg_ctr * 100).toFixed(1)}` : '—'}
          unit={latest?.avg_ctr != null ? '%' : undefined}
          delta={ctrDelta >= 0
            ? `▲ ${(ctrDelta * 100).toFixed(2)} pts`
            : `▼ ${(Math.abs(ctrDelta) * 100).toFixed(2)} pts`}
          up={ctrDelta >= 0}
        />
        <Metric
          k="Avg watch"
          v={latest?.avg_view_duration_seconds != null
            ? `${Math.floor(latest.avg_view_duration_seconds / 60)}:${String(Math.floor(latest.avg_view_duration_seconds % 60)).padStart(2, '0')}`
            : '—'}
          delta={watchDelta >= 0 ? `▲ ${Math.floor(watchDelta)}s` : `▼ ${Math.floor(Math.abs(watchDelta))}s`}
          up={watchDelta >= 0}
        />
        <Metric
          k="Est. monthly rev."
          v={fmtMoney(latest?.estimated_monthly_revenue)}
          delta={revDelta >= 0 ? `▲ ${fmtMoney(revDelta)}` : `▼ ${fmtMoney(Math.abs(revDelta))}`}
          up={revDelta >= 0}
        />
      </div>

      {/* ===== SPLIT: COMPETITORS + TRENDS ===== */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: '1.55fr 1fr',
        marginTop: 40,
        border: `1px solid ${T.line}`,
      }}>
        <Col title="Competitors" sub={`${competitors?.length ?? 0} tracked`} actions={['All', 'Tier 1', 'Tier 2', 'Dominators']}>
          {competitorsSorted.length === 0 ? (
            <Empty>
              No competitors tracked yet.{' '}
              <a href="/competitors" style={{ color: T.accent, textDecoration: 'none' }}>Add some →</a>
            </Empty>
          ) : competitorsSorted.map(c => {
            const compAvg = c.total_views != null && c.subscriber_count != null && c.subscriber_count > 0
              ? Math.round(c.total_views / c.subscriber_count * 1000) / 10
              : null
            const mult = compAvg != null && userAvg > 0 ? compAvg / userAvg : null
            return (
              <div key={c.id} style={{
                display: 'grid',
                gridTemplateColumns: '6px 1fr 100px 70px',
                gap: 14, alignItems: 'center',
                padding: '13px 0',
                borderBottom: `1px dashed ${T.line}`,
              }}>
                <span style={{
                  width: 6, height: 6, borderRadius: '50%',
                  background: c.tier === 1 ? T.accent : c.tier === 2 ? T.blue : T.amber,
                }} />
                <div style={{ minWidth: 0 }}>
                  <div style={{
                    fontSize: 14, fontWeight: 500, letterSpacing: '-0.01em',
                    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                  }}>
                    {c.channel_name ?? c.youtube_channel_id}
                  </div>
                  <div style={{ fontFamily: T.mono, fontSize: 11, color: T.ink3, marginTop: 2 }}>
                    {fmt(c.subscriber_count)} subs · tier {c.tier}{c.is_auto_detected ? ' · auto' : ''}
                  </div>
                </div>
                <span style={{ fontFamily: T.mono, fontSize: 11.5, color: T.ink2, textAlign: 'right' }}>
                  <strong style={{ color: T.ink, fontWeight: 500 }}>{fmt(c.total_views)}</strong> views
                </span>
                <span style={{
                  fontFamily: T.mono, fontSize: 11, textAlign: 'right',
                  color: mult != null && mult > 1 ? T.accent : T.red,
                }}>
                  {mult != null ? `${mult.toFixed(1)}×` : '—'}
                </span>
              </div>
            )
          })}
        </Col>

        <Col title="Trend Radar" actions={['7d', '30d']}>
          {latestTrend ? (
            <TrendRow
              channel={latestTrend.channel_name ?? 'Unknown'}
              what=" went viral with "
              obj={latestTrend.title ?? '—'}
              sub={`${fmt(latestTrend.view_count)} views · velocity ${fmt(latestTrend.velocity_score)}/h`}
              time={timeAgo(latestTrend.detected_at)}
              kind="viral"
            />
          ) : (
            <Empty>No viral activity detected this week. The radar is quiet.</Empty>
          )}
          <TrendRow
            channel="Topic shift"
            what=" — niche velocity rising on "
            obj="housing market 2026"
            sub="14 videos this week vs. 4 last · suggested angle: contrarian take"
            time="1d"
            kind="topic"
          />
          <TrendRow
            channel="Coverage gap"
            what=" — competitors covering "
            obj="Roth IRA conversion ladder"
            sub="8 of your tracked channels · uncovered by you"
            time="2d"
            kind="topic"
          />
        </Col>
      </div>

      {/* ===== LOWER GRID: chart + ideas + checklist ===== */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: '1.1fr 1fr 1fr',
        marginTop: 24,
        border: `1px solid ${T.line}`,
      }}>
        <Col title="You vs. niche" sub="avg views / video" actions={['7d', '30d', '90d']} activeIdx={1}>
          {chartData.length > 1 ? (
            <div style={{ height: 170 }}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData} margin={{ top: 8, right: 4, bottom: 4, left: 4 }}>
                  <Line
                    type="monotone"
                    dataKey="you"
                    stroke={T.accent}
                    strokeWidth={1.5}
                    dot={false}
                    isAnimationActive={false}
                  />
                  <Tooltip
                    contentStyle={{
                      background: T.bg, border: `1px solid ${T.line}`,
                      fontFamily: T.mono, fontSize: 11, padding: '4px 8px', color: T.ink,
                    }}
                    cursor={{ stroke: T.line2, strokeWidth: 1 }}
                    labelFormatter={(l) => fmtWeek(String(l))}
                    formatter={(v) => [fmt(typeof v === 'number' ? v : null), 'you']}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <Empty>Not enough data yet.</Empty>
          )}
          <div style={{
            display: 'flex', gap: 14,
            fontFamily: T.mono, fontSize: 10, color: T.ink3,
            marginTop: 10, paddingTop: 10,
            borderTop: `1px dashed ${T.line}`,
          }}>
            <span>
              <span style={{
                display: 'inline-block', width: 8, height: 8,
                background: T.accent, marginRight: 6, verticalAlign: -1,
              }} />
              you
            </span>
            <span style={{ marginLeft: 'auto' }}>{snapshots.length} snapshots tracked</span>
          </div>
        </Col>

        <Col title="Top ideas" sub="this week" actions={['all']}>
          {(latestDigest?.video_ideas ?? []).length > 0 ? (
            (latestDigest?.video_ideas ?? []).slice(0, 3).map((idea, i) => (
              <div key={i} style={{
                display: 'grid', gridTemplateColumns: '24px 1fr 50px',
                gap: 12, alignItems: 'flex-start',
                padding: '11px 0',
                borderBottom: `1px dashed ${T.line}`,
              }}>
                <div style={{
                  fontFamily: T.serif, fontStyle: 'italic',
                  fontSize: 22, color: T.ink3, lineHeight: 1,
                }}>
                  {String(i + 1).padStart(2, '0')}
                </div>
                <div>
                  <div style={{ fontSize: 13, lineHeight: 1.35, letterSpacing: '-0.005em' }}>
                    &ldquo;{idea.title}&rdquo;
                  </div>
                  <div style={{
                    fontFamily: T.mono, fontSize: 10.5, color: T.ink3,
                    marginTop: 3, display: 'flex', gap: 8,
                  }}>
                    {idea.suggestedLength && (
                      <span style={{ padding: '1px 5px', border: `1px solid ${T.line}` }}>
                        {idea.suggestedLength}
                      </span>
                    )}
                    {idea.thumbnailApproach && (
                      <span>{idea.thumbnailApproach.slice(0, 24)}</span>
                    )}
                  </div>
                </div>
                <div style={{
                  fontFamily: T.mono, fontSize: 11.5,
                  color: T.accent, textAlign: 'right', fontWeight: 500,
                }}>
                  {idea.opportunityScore}
                </div>
              </div>
            ))
          ) : (
            <Empty>No ideas yet. Generate a digest to populate this list.</Empty>
          )}
        </Col>

        <Col title="Setup checklist" actions={[`${doneCount}/${checklist.length}`]}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
            {checklist.map(({ label, done }) => (
              <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13 }}>
                <div style={{
                  width: 14, height: 14,
                  border: `1px solid ${done ? T.accent : T.line2}`,
                  background: done ? T.accent : 'transparent',
                  flex: 'none', display: 'grid', placeItems: 'center',
                  fontSize: 9, color: T.bg,
                }}>
                  {done && '✓'}
                </div>
                <span style={{
                  color: done ? T.ink3 : T.ink,
                  textDecoration: done ? 'line-through' : 'none',
                }}>
                  {label}
                </span>
              </div>
            ))}
          </div>
        </Col>
      </div>

      {/* ===== DIGESTS TABLE ===== */}
      <div style={{ marginTop: 24, border: `1px solid ${T.line}` }}>
        <div style={{
          display: 'grid',
          gridTemplateColumns: '140px 70px 1fr 110px',
          gap: 16, padding: '12px 22px',
          borderBottom: `1px solid ${T.line}`,
          background: T.bg2,
        }}>
          {['Week', 'Score', 'Headline', 'Status'].map(h => (
            <span key={h} style={{
              fontFamily: T.mono, fontSize: 10.5,
              letterSpacing: '0.14em', textTransform: 'uppercase',
              color: T.ink3,
            }}>{h}</span>
          ))}
        </div>

        {(recentDigests?.length ?? 0) > 0 ? recentDigests.map(d => {
          const score = d.key_metrics && typeof d.key_metrics === 'object'
            ? (d.key_metrics as Record<string, unknown>).overallGapScore
            : null
          const scoreNum = typeof score === 'number' ? score : null
          const preview = d.content
            ? (d.content.split('\n').find(l => l.trim().length > 20)?.trim().slice(0, 120) ?? '—')
            : '—'

          return (
            <a key={d.id} href="/digest" style={{
              display: 'grid',
              gridTemplateColumns: '140px 70px 1fr 110px',
              gap: 16, padding: '14px 22px',
              borderBottom: `1px dashed ${T.line}`,
              alignItems: 'center',
              textDecoration: 'none',
              color: 'inherit',
            }}>
              <span style={{ fontFamily: T.mono, fontSize: 11.5, color: T.ink2 }}>
                {fmtWeek(d.week_start_date)}
              </span>
              <span style={{
                fontFamily: T.mono, fontSize: 13, fontWeight: 500,
                color: scoreNum != null ? gapColor(scoreNum) : T.ink4,
              }}>
                {scoreNum ?? '—'}
              </span>
              <span style={{
                fontSize: 13, color: T.ink2,
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>
                {preview}
              </span>
              <span style={{
                fontFamily: T.mono, fontSize: 10.5, color: T.ink3,
                display: 'inline-flex', alignItems: 'center', gap: 6,
              }}>
                <span style={{
                  width: 5, height: 5, borderRadius: '50%',
                  background: d.email_sent_at ? T.accent : T.ink3,
                }} />
                {d.email_sent_at ? 'Delivered' : 'Draft'}
              </span>
            </a>
          )
        }) : (
          <div style={{ padding: '32px 22px', textAlign: 'center' }}>
            <Empty>No digests generated yet. Your first arrives Monday.</Empty>
          </div>
        )}
      </div>
    </Shell>
  )
}

// ─── Layout primitives ────────────────────────────────────────────────────────

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      background: T.bg, color: T.ink,
      fontFamily: T.sans,
      minHeight: '100%',
      padding: 28,
      maxWidth: 1480,
    }}>
      {children}
    </div>
  )
}

function Pill({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 8,
      fontFamily: T.mono, fontSize: 11, color: T.ink2,
      border: `1px solid ${T.line}`, padding: '5px 10px',
    }}>
      {children}
    </div>
  )
}

function Metric({
  k, v, unit, delta, up,
}: { k: string; v: string; unit?: string; delta: string; up: boolean }) {
  return (
    <div style={{
      padding: '16px 18px',
      borderRight: `1px solid ${T.line}`,
      display: 'flex', flexDirection: 'column', gap: 6,
    }}>
      <Eyebrow>{k}</Eyebrow>
      <div style={{
        fontSize: 24, fontWeight: 500, letterSpacing: '-0.02em',
        display: 'flex', alignItems: 'baseline', gap: 4,
      }}>
        {v}
        {unit && (
          <span style={{ fontFamily: T.mono, fontSize: 11, color: T.ink3, fontWeight: 400 }}>
            {unit}
          </span>
        )}
      </div>
      <div style={{ fontFamily: T.mono, fontSize: 11, color: up ? T.accent : T.red }}>
        {delta}
      </div>
    </div>
  )
}

function Col({
  title, sub, actions, activeIdx = 0, children,
}: {
  title: string
  sub?: string
  actions?: string[]
  activeIdx?: number
  children: React.ReactNode
}) {
  return (
    <div style={{ padding: '20px 22px', borderRight: `1px solid ${T.line}` }}>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginBottom: 16,
      }}>
        <Eyebrow strong>
          {title}
          {sub && <span style={{ color: T.ink3, fontWeight: 400 }}> &nbsp;→ {sub}</span>}
        </Eyebrow>
        {actions && (
          <div style={{ display: 'flex', gap: 6 }}>
            {actions.map((a, i) => (
              <span key={a} style={{
                fontFamily: T.mono, fontSize: 10.5,
                padding: '2px 6px',
                border: `1px solid ${i === activeIdx ? T.ink2 : T.line}`,
                color: i === activeIdx ? T.ink : T.ink3,
                cursor: 'pointer',
              }}>
                {a}
              </span>
            ))}
          </div>
        )}
      </div>
      {children}
    </div>
  )
}

function TrendRow({
  channel, what, obj, sub, time, kind,
}: {
  channel: string
  what: string
  obj: string
  sub: string
  time: string
  kind: 'viral' | 'topic' | 'default'
}) {
  const dotColor = kind === 'viral' ? T.red : kind === 'topic' ? T.blue : T.amber
  return (
    <div style={{
      display: 'grid', gridTemplateColumns: '14px 1fr auto',
      gap: 14, alignItems: 'flex-start',
      padding: '12px 0',
      borderBottom: `1px dashed ${T.line}`,
    }}>
      <div style={{ width: 1, background: T.line2, height: '100%', justifySelf: 'center', position: 'relative' }}>
        <span style={{
          position: 'absolute', top: 4, left: '50%',
          width: 7, height: 7, borderRadius: '50%',
          background: dotColor,
          transform: 'translateX(-50%)',
        }} />
      </div>
      <div>
        <div style={{ fontSize: 13, lineHeight: 1.45 }}>
          <span style={{ color: T.ink, fontWeight: 500 }}>{channel}</span>
          <span style={{ color: T.ink2 }}>{what}</span>
          <span style={{
            fontFamily: T.mono, fontSize: 11.5,
            padding: '1px 4px',
            background: T.surface, border: `1px solid ${T.line}`,
            color: T.ink,
          }}>
            {obj}
          </span>
        </div>
        <div style={{ fontFamily: T.mono, fontSize: 10.5, color: T.ink3, marginTop: 3 }}>
          {sub}
        </div>
      </div>
      <div style={{ fontFamily: T.mono, fontSize: 10.5, color: T.ink3, whiteSpace: 'nowrap' }}>
        {time}
      </div>
    </div>
  )
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      fontFamily: T.mono, fontSize: 11.5, color: T.ink3,
      padding: '20px 0', textAlign: 'center',
    }}>
      {children}
    </div>
  )
}
