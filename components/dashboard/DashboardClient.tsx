'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { signOut } from 'next-auth/react'
import Link from 'next/link'
import {
  LineChart,
  Line,
  XAxis,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts'
import BlackholeLoader from '@/components/BlackholeLoader'
import { useSyncStatus } from '@/components/sync-context'
import SubscriberGrowthChart from '@/components/charts/SubscriberGrowthChart'
import type {
  User,
  ChannelSnapshot,
  GapScore,
  Competitor,
  Digest,
  Trend,
  CompetitorSnapshot,
  Idea,
} from '@/types'

interface Props {
  user: User | null
  snapshots: ChannelSnapshot[]
  gapScore: GapScore | null
  competitors: Competitor[]
  recentDigests: Digest[]
  latestDigest: Digest | null
  latestTrend: Trend | null
  competitorSnapshots: { competitorId: string; snapshots: CompetitorSnapshot[] }[]
  topIdea: Idea | null
  nicheAvgViewsPerVideo: number | null
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

function getTierLabel(tier: number | null | undefined): string {
  switch (tier) {
    case 1: return 'Similar (1-3×)'
    case 2: return 'Aspirational (3-10×)'
    case 3: return 'Dominant (10×+)'
    default: return 'Unknown'
  }
}

function gapColorClass(score: number): string {
  if (score >= 70) return 'text-stencil-accent'
  if (score >= 40) return 'text-stencil-amber'
  return 'text-stencil-red'
}

function gapFillClass(score: number): string {
  if (score >= 70) return 'bg-stencil-red'
  if (score >= 40) return 'bg-stencil-amber'
  return 'bg-stencil-accent'
}

// ─── Primitives ───────────────────────────────────────────────────────────────

function Eyebrow({ children, strong }: { children: React.ReactNode; strong?: boolean }) {
  return (
    <span className={`font-mono text-[10.5px] tracking-[0.16em] uppercase ${strong ? 'text-stencil-ink font-medium' : 'text-stencil-ink3 font-normal'}`}>
      {children}
    </span>
  )
}

function Btn({
  children, primary, href, onClick,
}: { children: React.ReactNode; primary?: boolean; href?: string; onClick?: () => void }) {
  const cls = `font-sans text-[12.5px] py-[6px] px-3 border inline-flex items-center gap-[6px] tracking-[-0.005em] cursor-pointer no-underline ${
    primary
      ? 'border-stencil-ink bg-stencil-ink text-stencil-bg'
      : 'border-stencil-line bg-transparent text-stencil-ink'
  }`
  if (href) return <a href={href} className={cls}>{children}</a>
  return <button type="button" onClick={onClick} className={cls}>{children}</button>
}

function PulseDot() {
  return (
    <span className="inline-block size-[6px] rounded-full bg-stencil-accent animate-stencil-pulse" />
  )
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function DashboardClient({
  user, snapshots, gapScore, competitors, recentDigests, competitorSnapshots, topIdea, nicheAvgViewsPerVideo,
}: Props) {
  const { isSyncing } = useSyncStatus()
  const router = useRouter()
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    if (!isSyncing && snapshots.length === 0) router.refresh()
  }, [isSyncing, snapshots.length, router])

  // ── Loading ────────────────────────────────────────────────────────────────
  if (isSyncing) {
    return (
      <Shell>
        <div className="flex flex-col items-center justify-center min-h-[70vh] gap-6">
          <BlackholeLoader />
          <div className="text-center">
            <p className="text-stencil-ink text-sm font-medium m-0">
              Syncing your channel data…
            </p>
            <p className="text-stencil-ink3 text-xs m-0 mt-1.5 font-mono">
              first sync · 10–15s
            </p>
          </div>
        </div>
      </Shell>
    )
  }

  // ── No channel connected ───────────────────────────────────────────────────
  if (!user?.youtube_channel_id) {
    return (
      <Shell>
        <div className="flex flex-col items-center justify-center min-h-[70vh] gap-4">
          <h2 className="font-serif italic text-[40px] m-0 tracking-[-0.025em]">
            No YouTube Channel Connected
          </h2>
          <p className="text-stencil-ink2 text-[13.5px] m-0 max-w-[40ch] text-center">
            Sign out and sign in again to authorize YouTube access.
          </p>
          <div className="mt-2">
            <Btn primary onClick={() => signOut()}>Sign Out</Btn>
          </div>
        </div>
      </Shell>
    )
  }

  // ── Empty ──────────────────────────────────────────────────────────────────
  if (!snapshots?.length) {
    return (
      <Shell>
        <div className="flex flex-col items-center justify-center min-h-[70vh] gap-4">
          <h1 className="font-serif text-[56px] m-0 tracking-[-0.025em]">
            No data <em className="text-stencil-ink2">yet.</em>
          </h1>
          <p className="text-stencil-ink2 text-[13.5px] m-0 max-w-[40ch] text-center">
            Connect your YouTube channel and we&apos;ll pull a full snapshot of your performance,
            your competitors, and the gaps you can close.
          </p>
          <div className="mt-2">
            <Btn primary href="/api/sync">Connect YouTube</Btn>
          </div>
        </div>
      </Shell>
    )
  }

  // ── Safe data extraction ───────────────────────────────────────────────────
  // Filter out null rows (e.g. today's row inserted before real data arrived)
  // so we always display the most recent snapshot that has real subscriber data.
  const validSnapshots = snapshots.filter(s => s.subscriber_count !== null)
  const latest = validSnapshots.at(-1)
  const lastSynced = timeAgo(latest?.created_at)

  const earlier = validSnapshots.at(-8) ?? validSnapshots.at(0)
  const subDelta   = (latest?.subscriber_count ?? 0)          - (earlier?.subscriber_count ?? 0)
  const viewsDelta = (latest?.avg_views_per_video ?? 0)       - (earlier?.avg_views_per_video ?? 0)
  const ctrDelta   = (latest?.avg_ctr ?? 0)                   - (earlier?.avg_ctr ?? 0)
  const watchDelta = (latest?.avg_view_duration_seconds ?? 0) - (earlier?.avg_view_duration_seconds ?? 0)
  const revDelta   = (latest?.estimated_monthly_revenue ?? 0) - (earlier?.estimated_monthly_revenue ?? 0)

  // ── You vs Niche chart data ────────────────────────────────────────────────
  const activeCompetitors = competitors?.filter(c => c.is_active) ?? []
  const tier1Ids = new Set(
    activeCompetitors
      .filter(c => c.tier === 1 && !c.is_dominator)
      .map(c => c.id),
  )

  const chartData = snapshots.slice(-30).map((s) => ({
    date: new Date(s.snapshot_date).getTime(),
    you: s.avg_views_per_video ?? 0,
  }))

  // ── Subscriber growth chart data ──────────────────────────────────────────
  const competitorDataForChart = activeCompetitors
    .map(c => ({
      competitor: c,
      snapshots: competitorSnapshots.find(cs => cs.competitorId === c.id)?.snapshots ?? [],
    }))
    .filter(cd => cd.snapshots.length > 0)

  // ── Gap score rows with unit labels ───────────────────────────────────────
  const gapRows = gapScore ? [
    { label: 'Avg views / video', unit: 'last 30 days',           score: gapScore.views_gap_score ?? 0 },
    { label: 'Click-through rate', unit: '% of impressions',       score: gapScore.ctr_gap_score ?? 0 },
    { label: 'Watch time',         unit: 'avg minutes per video',  score: gapScore.watch_time_gap_score ?? 0 },
    { label: 'Upload frequency',   unit: 'videos per month',       score: gapScore.upload_frequency_gap_score ?? 0 },
  ] : []

  const userAvg = latest?.avg_views_per_video ?? 1
  // Show 1 Tier 1 + 1 Tier 2 on the dashboard; Dominators are excluded here
  const dashboardCompetitors = [
    activeCompetitors.find(c => c.tier === 1 && !c.is_dominator) ?? null,
    activeCompetitors.find(c => c.tier === 2 && !c.is_dominator) ?? null,
  ].filter((c): c is typeof activeCompetitors[number] => c !== null)

  return (
    <Shell>
      {/* ===== HERO ===== */}
      <div className="pb-6 border-b border-stencil-line">
        {/* Channel identity row */}
        <div className="flex items-center gap-4 mb-5">
          {user?.image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={user.image} alt={user.name ?? 'Channel'} width={44} height={44} className="shrink-0" />
          ) : (
            <div className="size-11 shrink-0 bg-stencil-surface border border-stencil-line grid place-items-center font-mono text-stencil-ink3 text-lg">
              {(user?.name ?? 'U')[0]}
            </div>
          )}
          <div>
            <div className="font-serif italic text-[28px] leading-none tracking-[-0.02em]">
              {user?.name ?? 'Your Channel'}
            </div>
            <div className="font-mono text-[11px] text-stencil-ink3 mt-1">
              {fmt(latest?.subscriber_count, 1)} subscribers
            </div>
          </div>
          <div className="ml-auto flex flex-col gap-1.5 items-end">
            <Pill>
              <span className="text-stencil-accent">●</span> tracking{' '}
              <strong className="text-stencil-ink ml-1">{competitors?.length ?? 0}</strong> channels
            </Pill>
            <Pill>
              plan: <strong className="text-stencil-ink ml-1">{user?.subscription_plan ?? 'free'}</strong>
            </Pill>
          </div>
        </div>

        <div className="grid grid-cols-[1fr_auto] gap-8 items-end">
          <div>
            <div className="flex items-center gap-[10px] text-stencil-ink3 font-mono text-[11px] tracking-[0.16em] uppercase">
              <span>Channel · {fmtWeek(new Date().toISOString())}</span>
              <span className="text-stencil-ink4">·</span>
              <span className="inline-flex items-center gap-[6px] text-stencil-accent">
                <PulseDot /> last sync {lastSynced}
              </span>
            </div>
            <h1 className="font-serif font-normal text-[60px] leading-[0.95] tracking-[-0.025em] mt-[10px] mb-0">
              Close <em className="italic text-stencil-ink2">the gap.</em>
            </h1>
            <p className="text-[13.5px] text-stencil-ink2 mt-2 mb-0 max-w-[56ch]">
              {gapScore ? (
                <>
                  You sit <strong className="text-stencil-ink">{gapScore.overall_score}</strong> points behind your niche.
                  {gapScore.primary_bottleneck && (
                    <> Primary bottleneck: <strong className="text-stencil-ink">{gapScore.primary_bottleneck}</strong>.</>
                  )}
                  {(gapScore.estimated_revenue_gap ?? 0) > 0 && (
                    <> Closing it could unlock{' '}
                      <strong className="text-stencil-accent">{fmtMoney(gapScore.estimated_revenue_gap)}/mo</strong>{' '}
                      in additional revenue.
                    </>
                  )}
                </>
              ) : (
                <>Your first gap analysis is being generated. It will arrive with your next weekly digest.</>
              )}
            </p>
          </div>
        </div>
      </div>

      {/* ===== GAP SCORE PANEL ===== */}
      {gapScore && (
        <>
          <p className="text-sm text-stencil-ink2 max-w-2xl mt-6 mb-6 px-1">
            This is where you stand against your niche. Each bar shows how far behind you are in that area — the longer the bar, the bigger the opportunity to grow. A short bar means you&apos;re already competitive there; a long bar means that&apos;s where focusing your efforts will move the needle most.
          </p>
          <div className="border border-stencil-line bg-stencil-grid p-6 grid grid-cols-[280px_1fr] gap-9 items-center">
            <div className="flex flex-col gap-[10px]">
              <Eyebrow>Overall Gap Score</Eyebrow>
              <div className={`font-serif italic text-[140px] leading-[0.85] tracking-[-0.04em] tabular-nums ${gapColorClass(gapScore.overall_score)}`}>
                {gapScore.overall_score}
              </div>
              <div className="font-mono text-[11px] text-stencil-ink3 max-w-[24ch]">
                out of 100
              </div>
              <div className="font-mono text-[11px] text-stencil-ink3 max-w-[24ch]">
                higher = bigger opportunity vs. your niche
              </div>
            </div>

            {gapRows.length > 0 && (
              <div className="flex flex-col gap-[14px]">
                {gapRows.map(row => (
                  <div key={row.label} className="grid grid-cols-[200px_1fr_60px] gap-[14px] items-center font-mono text-[11.5px] text-stencil-ink2">
                    <div>
                      <div className="text-stencil-ink">{row.label}</div>
                      <div className="text-[10px] text-stencil-ink4">{row.unit}</div>
                    </div>
                    <span className="h-[6px] bg-stencil-surface relative overflow-hidden">
                      <span
                        className={`block h-full ${gapFillClass(row.score)}`}
                        style={{ width: `${Math.min(100, row.score)}%` }}
                      />
                    </span>
                    <span className="text-right text-stencil-ink font-medium">{row.score}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}

      {/* ===== METRIC STRIP ===== */}
      <div className={`grid grid-cols-5 border border-stencil-line ${gapScore ? 'border-t-0' : 'mt-6'}`}>
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
          context={gapScore?.views_gap_score != null
            ? `${gapScore.views_gap_score}pt gap vs niche avg`
            : undefined}
        />
        <Metric
          k="CTR"
          v={latest?.avg_ctr != null ? `${latest.avg_ctr.toFixed(1)}` : '—'}
          unit={latest?.avg_ctr != null ? '%' : undefined}
          delta={ctrDelta >= 0
            ? `▲ ${ctrDelta.toFixed(2)} pts`
            : `▼ ${Math.abs(ctrDelta).toFixed(2)} pts`}
          up={ctrDelta >= 0}
          context={gapScore?.ctr_gap_score != null
            ? `${gapScore.ctr_gap_score}pt gap vs niche avg`
            : undefined}
        />
        <Metric
          k="Avg watch"
          v={latest?.avg_view_duration_seconds != null
            ? `${Math.floor(latest.avg_view_duration_seconds / 60)}:${String(Math.floor(latest.avg_view_duration_seconds % 60)).padStart(2, '0')}`
            : '—'}
          delta={watchDelta >= 0 ? `▲ ${Math.floor(watchDelta)}s` : `▼ ${Math.floor(Math.abs(watchDelta))}s`}
          up={watchDelta >= 0}
          context={gapScore?.watch_time_gap_score != null
            ? `${gapScore.watch_time_gap_score}pt gap vs niche avg`
            : undefined}
        />
        <Metric
          k="Est. monthly rev."
          v={fmtMoney(latest?.estimated_monthly_revenue)}
          delta={revDelta >= 0 ? `▲ ${fmtMoney(revDelta)}` : `▼ ${fmtMoney(Math.abs(revDelta))}`}
          up={revDelta >= 0}
          context={gapScore?.estimated_revenue_gap != null && gapScore.estimated_revenue_gap > 0
            ? `${fmtMoney(gapScore.estimated_revenue_gap)}/mo gap to niche`
            : undefined}
        />
      </div>

      {/* ===== SPLIT: COMPETITORS + SUBSCRIBER GROWTH ===== */}
      <div className="grid grid-cols-[1fr_1.5fr] mt-10 border border-stencil-line">
        <Col title="Competitors" sub={`${competitors?.length ?? 0} tracked`}>
          {dashboardCompetitors.length === 0 ? (
            <Empty>
              No competitors tracked yet.{' '}
              <a href="/competitors" className="text-stencil-accent no-underline">Add some →</a>
            </Empty>
          ) : dashboardCompetitors.map(c => {
            const compAvg = c.total_views != null && c.subscriber_count != null && c.subscriber_count > 0
              ? Math.round(c.total_views / c.subscriber_count * 1000) / 10
              : null
            const mult = compAvg != null && userAvg > 0 ? compAvg / userAvg : null
            return (
              <div key={c.id} className="grid grid-cols-[6px_1fr_100px_70px] gap-[14px] items-center py-[13px] border-b border-dashed border-stencil-line">
                <span className={`size-[6px] rounded-full ${c.tier === 1 ? 'bg-stencil-accent' : c.tier === 2 ? 'bg-stencil-blue' : 'bg-stencil-amber'}`} />
                <div className="min-w-0">
                  <div className="text-sm font-medium tracking-[-0.01em] truncate">
                    {c.channel_name ?? c.youtube_channel_id}
                  </div>
                  <div className="font-mono text-[11px] text-stencil-ink3 mt-0.5">
                    {fmt(c.subscriber_count)} subs · {getTierLabel(c.tier)}{c.is_auto_detected ? ' · auto' : ''}
                  </div>
                </div>
                <span className="font-mono text-[11.5px] text-stencil-ink2 text-right">
                  <strong className="text-stencil-ink font-medium">{fmt(c.total_views)}</strong> views
                </span>
                <span className={`font-mono text-[11px] text-right ${mult != null && mult > 1 ? 'text-stencil-accent' : 'text-stencil-red'}`}>
                  {mult != null ? `${mult.toFixed(1)}×` : '—'}
                </span>
              </div>
            )
          })}
          <a
            href="/competitors"
            className="font-mono text-[11px] text-stencil-ink3 hover:text-stencil-ink mt-3 pt-3 border-t border-dashed border-stencil-line block no-underline"
          >
            View all competitors →
          </a>
        </Col>

        <Col title="Subscriber growth" sub="last 30 days">
          {mounted ? (
            <SubscriberGrowthChart
              userSnapshots={snapshots}
              competitorData={competitorDataForChart}
              userName={user?.name ?? null}
            />
          ) : (
            <Empty>Loading chart…</Empty>
          )}
        </Col>
      </div>

      {/* ===== LOWER GRID: You vs Niche + Top idea ===== */}
      <div className="grid grid-cols-[1.4fr_1fr] mt-6 border border-stencil-line">
        <Col title="You vs. niche" sub="avg views / video — last 30 days">
          {mounted && chartData.length > 1 ? (
            <>
              <div style={{ height: 170, width: '100%' }}>
                <ResponsiveContainer width="100%" height="100%" initialDimension={{ width: 1, height: 1 }}>
                  <LineChart data={chartData} margin={{ top: 8, right: 4, bottom: 4, left: 4 }}>
                    <XAxis dataKey="date" type="number" domain={['dataMin', 'dataMax']} hide />
                    <Line
                      type="monotone"
                      dataKey="you"
                      name="you"
                      stroke="#22c55e"
                      strokeWidth={2}
                      dot={false}
                      isAnimationActive={false}
                    />
                    {nicheAvgViewsPerVideo != null && (
                      <ReferenceLine
                        y={nicheAvgViewsPerVideo}
                        stroke="#3b82f6"
                        strokeDasharray="4 4"
                        strokeWidth={1.5}
                        ifOverflow="extendDomain"
                      />
                    )}
                    <Tooltip
                      contentStyle={{
                        background: '#0A0A0A',
                        border: '1px solid #222222',
                        fontFamily: 'Geist Mono, monospace',
                        fontSize: 11,
                        padding: '4px 8px',
                        color: '#EDEDED',
                      }}
                      cursor={{ stroke: '#2A2A2A', strokeWidth: 1 }}
                      labelFormatter={(value) => new Date(value).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                      formatter={(v, name) => [fmt(typeof v === 'number' ? v : null), name]}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
              <div className="flex gap-[14px] font-mono text-[10px] text-stencil-ink3 mt-[10px] pt-[10px] border-t border-dashed border-stencil-line">
                <span>
                  <span className="inline-block size-2 bg-stencil-accent mr-[6px] align-[-1px]" />
                  you
                </span>
                {nicheAvgViewsPerVideo != null ? (
                  <span>
                    <span className="inline-block w-4 border-t border-dashed border-stencil-blue mr-[6px] align-middle" />
                    Tier 1 niche avg · 30d window
                  </span>
                ) : tier1Ids.size === 0 ? (
                  <span className="text-stencil-ink4">No Tier 1 competitors to compare against</span>
                ) : (
                  <span className="text-stencil-ink4">Tier 1 competitors haven&apos;t uploaded in the last 30 days</span>
                )}
                <span className="ml-auto">{snapshots.length} snapshots tracked</span>
              </div>
            </>
          ) : (
            <Empty>Not enough data yet.</Empty>
          )}
        </Col>

        <Col title="Top idea this week" sub="highest opportunity score">
          {topIdea ? (
            <>
              <div className="grid grid-cols-[24px_1fr_50px] gap-3 items-start py-[11px] border-b border-dashed border-stencil-line">
                <div className="font-serif italic text-[22px] text-stencil-ink3 leading-none">
                  01
                </div>
                <div>
                  <div className="text-[13px] leading-[1.35] tracking-[-0.005em]">
                    &ldquo;{topIdea.title}&rdquo;
                  </div>
                  {topIdea.why_now && (
                    <div className="font-mono text-[10.5px] text-stencil-ink3 mt-[3px] italic">
                      {topIdea.why_now.slice(0, 80)}
                    </div>
                  )}
                  <div className="font-mono text-[10.5px] text-stencil-ink4 mt-[4px] flex gap-2">
                    {topIdea.suggested_duration_min != null && topIdea.suggested_duration_max != null && (
                      <span className="px-[5px] py-[1px] border border-stencil-line">
                        {topIdea.suggested_duration_min}–{topIdea.suggested_duration_max} min
                      </span>
                    )}
                  </div>
                </div>
                <div className="font-mono text-[11.5px] text-stencil-accent text-right font-medium">
                  {topIdea.opportunity_score}
                </div>
              </div>
              <Link
                href="/ideas"
                className="font-mono text-[11px] text-stencil-ink3 hover:text-stencil-ink mt-3 pt-3 border-t border-dashed border-stencil-line block no-underline"
              >
                See all ideas →
              </Link>
            </>
          ) : (
            <div className="flex flex-col items-center gap-3 py-5">
              <span className="font-mono text-[11.5px] text-stencil-ink3">No ideas generated yet.</span>
              <Btn href="/ideas">Go to Ideas</Btn>
            </div>
          )}
        </Col>
      </div>

      {/* ===== DIGESTS TABLE ===== */}
      <div className="mt-6 border border-stencil-line">
        <div className="grid grid-cols-[140px_70px_1fr_110px] gap-4 px-[22px] py-3 border-b border-stencil-line bg-stencil-bg2">
          {['Week', 'Score', 'Headline', 'Status'].map(h => (
            <span key={h} className="font-mono text-[10.5px] tracking-[0.14em] uppercase text-stencil-ink3">{h}</span>
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
            <a key={d.id} href={`/digest/${d.id}`} className="grid grid-cols-[140px_70px_1fr_110px] gap-4 px-[22px] py-[14px] border-b border-dashed border-stencil-line items-center no-underline text-inherit">
              <span className="font-mono text-[11.5px] text-stencil-ink2">
                {fmtWeek(d.week_start_date)}
              </span>
              <span className={`font-mono text-[13px] font-medium ${scoreNum != null ? gapColorClass(scoreNum) : 'text-stencil-ink4'}`}>
                {scoreNum ?? '—'}
              </span>
              <span className="text-[13px] text-stencil-ink2 truncate">
                {preview}
              </span>
              <span className="font-mono text-[10.5px] text-stencil-ink3 inline-flex items-center gap-[6px]">
                <span className={`size-[5px] rounded-full ${d.email_sent_at ? 'bg-stencil-accent' : 'bg-stencil-ink3'}`} />
                {d.email_sent_at ? 'Delivered' : 'Draft'}
              </span>
            </a>
          )
        }) : (
          <div className="px-[22px] py-8 text-center">
            <Empty>No digests yet. Your first digest arrives on Monday at 9 AM UTC.</Empty>
          </div>
        )}
      </div>
    </Shell>
  )
}

// ─── Layout primitives ────────────────────────────────────────────────────────

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-stencil-bg text-stencil-ink font-sans min-h-full p-7 max-w-[1480px]">
      {children}
    </div>
  )
}

function Pill({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 font-mono text-[11px] text-stencil-ink2 border border-stencil-line px-[10px] py-[5px]">
      {children}
    </div>
  )
}

function Metric({
  k, v, unit, delta, up, context,
}: { k: string; v: string; unit?: string; delta: string; up: boolean; context?: string }) {
  return (
    <div className="p-[16px_18px] border-r border-stencil-line flex flex-col gap-[6px]">
      <Eyebrow>{k}</Eyebrow>
      <div className="text-2xl font-medium tracking-[-0.02em] flex items-baseline gap-1">
        {v}
        {unit && (
          <span className="font-mono text-[11px] text-stencil-ink3 font-normal">{unit}</span>
        )}
      </div>
      <div className={`font-mono text-[11px] ${up ? 'text-stencil-accent' : 'text-stencil-red'}`}>
        {delta}
      </div>
      {context && (
        <div className="font-mono text-[10px] text-stencil-ink3 border-t border-dashed border-stencil-line pt-[5px] mt-[2px]">
          {context}
        </div>
      )}
    </div>
  )
}

function Col({
  title, sub, children,
}: {
  title: string
  sub?: string
  children: React.ReactNode
}) {
  return (
    <div className="p-[20px_22px] border-r border-stencil-line min-w-0">
      <div className="flex items-center justify-between mb-4">
        <Eyebrow strong>
          {title}
          {sub && <span className="text-stencil-ink3 font-normal"> &nbsp;→ {sub}</span>}
        </Eyebrow>
      </div>
      {children}
    </div>
  )
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <div className="font-mono text-[11.5px] text-stencil-ink3 py-5 text-center">
      {children}
    </div>
  )
}
