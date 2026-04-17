'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts'
import BlackholeLoader from '@/components/BlackholeLoader'
import { useSyncStatus } from '@/components/sync-context'
import type { User, ChannelSnapshot, GapScore, Competitor, Digest, Trend } from '@/types'

interface Props {
  user: User | null
  snapshots: ChannelSnapshot[]
  gapScore: GapScore | null
  competitors: Competitor[]
  latestDigest: Digest | null
  latestTrend: Trend | null
}

// ─── helpers ─────────────────────────────────────────────────────────────────

function formatNumber(n: number | null | undefined): string {
  if (n == null) return '—'
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return String(n)
}

function formatDuration(seconds: number | null | undefined): string {
  if (seconds == null) return '—'
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}m ${s.toString().padStart(2, '0')}s`
}

function formatCurrency(amount: number | null | undefined): string {
  if (amount == null) return '—'
  if (amount >= 1_000) return `$${(amount / 1_000).toFixed(1)}K`
  return `$${Math.round(amount)}`
}

function timeAgo(isoString: string | null | undefined): string {
  if (!isoString) return 'never'
  const diff = Date.now() - new Date(isoString).getTime()
  const hours = Math.floor(diff / 3_600_000)
  if (hours < 1) return 'just now'
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

function getGreeting(name: string | null | undefined): string {
  const hour = new Date().getHours()
  const first = name?.split(' ')[0] ?? 'there'
  if (hour < 12) return `Good morning, ${first}`
  if (hour < 17) return `Good afternoon, ${first}`
  return `Good evening, ${first}`
}

// ─── MetricCard ──────────────────────────────────────────────────────────────

function MetricCard({
  title,
  value,
  context,
  contextColor,
}: {
  title: string
  value: string
  context: string
  contextColor?: string
}) {
  return (
    <div
      className="rounded-lg p-6 transition-colors duration-200 group"
      style={{ background: '#111114', border: '1px solid #1f1f23' }}
      onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.borderColor = 'rgba(37,99,235,0.4)' }}
      onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.borderColor = '#1f1f23' }}
    >
      <p className="text-xs uppercase tracking-wider mb-3" style={{ color: '#6b7280' }}>{title}</p>
      <p className="text-3xl font-bold text-white font-mono mb-1">{value}</p>
      <p className="text-xs" style={{ color: contextColor ?? '#6b7280' }}>{context}</p>
    </div>
  )
}

// ─── ScoreBadge ──────────────────────────────────────────────────────────────

function ScoreBadge({ score }: { score: number }) {
  const color =
    score < 40 ? '#ef4444' :
    score < 70 ? '#f59e0b' :
                 '#22c55e'
  return (
    <span
      className="text-6xl font-bold font-mono"
      style={{ color }}
    >
      {score}
    </span>
  )
}

// ─── Skeleton ────────────────────────────────────────────────────────────────

function Skeleton({ className }: { className?: string }) {
  return <div className={`animate-pulse rounded ${className ?? ''}`} style={{ background: '#1f1f23' }} />
}

// ─── Custom Tooltip ──────────────────────────────────────────────────────────

function CustomTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ name: string; value: number; fill: string }>; label?: string }) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-lg p-3 text-sm" style={{ background: '#1f2937', border: '1px solid #374151' }}>
      <p className="font-semibold text-white mb-1">{label}</p>
      {payload.map((p) => (
        <p key={p.name} style={{ color: p.fill }}>
          {p.name}: <span className="font-mono">{p.value}</span>
        </p>
      ))}
    </div>
  )
}

// ─── Main component ──────────────────────────────────────────────────────────

export default function DashboardClient({ user, snapshots, gapScore, competitors, latestDigest, latestTrend }: Props) {
  const { isSyncing } = useSyncStatus()
  const router = useRouter()

  // After first sync completes, refresh server data
  useEffect(() => {
    if (!isSyncing && snapshots.length === 0) {
      router.refresh()
    }
  }, [isSyncing, snapshots.length, router])

  // ── Syncing state ──────────────────────────────────────────────────────────
  if (isSyncing) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-8">
        <BlackholeLoader />
        <div className="text-center">
          <p className="text-white text-sm font-medium">Syncing your channel data...</p>
          <p className="text-xs mt-1" style={{ color: '#6b7280' }}>This takes about 10–15 seconds on first load.</p>
        </div>
      </div>
    )
  }

  // ── Empty state ────────────────────────────────────────────────────────────
  if (snapshots.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-8">
        <BlackholeLoader />
        <div className="text-center">
          <p className="text-white font-medium">Your ant is gathering intelligence...</p>
          <p className="text-sm mt-1" style={{ color: '#6b7280' }}>Connect your YouTube channel to get started.</p>
          <a
            href="/api/sync"
            className="inline-block mt-4 px-5 py-2 rounded-lg text-sm font-medium text-white transition-opacity hover:opacity-80"
            style={{ background: '#2563eb' }}
          >
            Connect YouTube
          </a>
        </div>
      </div>
    )
  }

  // ── Dashboard data ─────────────────────────────────────────────────────────
  const latest = snapshots[snapshots.length - 1]
  const nicheLabel = user?.niche_id
    ? `${user.niche_id.charAt(0).toUpperCase()}${user.niche_id.slice(1)} · YouTube Creator`
    : 'YouTube Creator'

  // Metric card computations
  const avgViews = latest.avg_views_per_video ?? null
  const revenueGap = gapScore?.estimated_revenue_gap ?? null
  const monthlyRevenue = latest.estimated_monthly_revenue ?? null
  const watchTime = latest.avg_view_duration_seconds ?? null

  // Niche avg upload frequency from competitors
  const competitorUploads = competitors.length > 0
    ? (competitors.reduce((sum, c) => sum + (c.subscriber_count ?? 0), 0) / competitors.length)
    : null

  // Gap chart data
  const chartData = gapScore
    ? [
        { name: 'Views',      you: Math.max(0, 100 - gapScore.views_gap_score),           avg: 60 },
        { name: 'CTR',        you: Math.max(0, 100 - gapScore.ctr_gap_score),             avg: 60 },
        { name: 'Frequency',  you: Math.max(0, 100 - gapScore.upload_frequency_gap_score),avg: 60 },
        { name: 'Watch Time', you: Math.max(0, 100 - gapScore.watch_time_gap_score),      avg: 60 },
      ]
    : null

  // Last synced
  const lastSynced = latest.created_at ? timeAgo(latest.created_at) : 'never'

  return (
    <div className="space-y-8 max-w-6xl">

      {/* Section 1 — Page header */}
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-white">{getGreeting(user?.name)}</h1>
        <p className="text-sm" style={{ color: '#6b7280' }}>Last synced: {lastSynced}</p>
      </div>

      {/* Section 2 — Channel hero */}
      <div
        className="rounded-lg p-6 flex items-center justify-between"
        style={{ background: '#111114', border: '1px solid #1f1f23' }}
      >
        <div>
          <h2 className="text-2xl font-bold text-white">
            {user?.name ?? 'Your Channel'}
          </h2>
          <p className="mt-1 text-sm" style={{ color: '#9ca3af' }}>
            {latest.subscriber_count ? `${formatNumber(latest.subscriber_count)} subscribers` : 'Subscribers syncing...'}
          </p>
          <p className="mt-0.5 text-xs" style={{ color: '#6b7280' }}>{nicheLabel}</p>
        </div>
        <div className="text-right">
          <p className="text-xs uppercase tracking-wider mb-1" style={{ color: '#6b7280' }}>
            Intelligence Score
          </p>
          {gapScore ? (
            <>
              <ScoreBadge score={gapScore.overall_score} />
              <p className="text-xs mt-1" style={{ color: '#6b7280' }}>vs niche average</p>
            </>
          ) : (
            <Skeleton className="h-16 w-20 ml-auto" />
          )}
        </div>
      </div>

      {/* Section 3 — 4 metric cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard
          title="Avg Views / Video"
          value={formatNumber(avgViews)}
          context={
            gapScore && avgViews
              ? `${gapScore.views_gap_score > 50 ? 'Below' : 'Near'} niche avg`
              : 'Syncing...'
          }
          contextColor={gapScore && gapScore.views_gap_score > 50 ? '#ef4444' : '#22c55e'}
        />
        <MetricCard
          title="Est. Monthly Revenue"
          value={formatCurrency(monthlyRevenue)}
          context={
            revenueGap != null
              ? `Gap: ${formatCurrency(revenueGap)}/mo to niche avg`
              : 'No gap data yet'
          }
          contextColor="#f59e0b"
        />
        <MetricCard
          title="Active Competitors"
          value={String(competitors.length)}
          context={
            competitorUploads != null
              ? `Avg ${formatNumber(Math.round(competitorUploads))} subscribers`
              : 'No competitors yet'
          }
        />
        <MetricCard
          title="Avg Watch Time"
          value={formatDuration(watchTime)}
          context={
            gapScore && watchTime
              ? `${gapScore.watch_time_gap_score > 50 ? 'Below' : 'Near'} niche avg`
              : 'Syncing...'
          }
          contextColor={gapScore && gapScore.watch_time_gap_score > 50 ? '#ef4444' : '#22c55e'}
        />
      </div>

      {/* Section 4 — Score breakdown chart */}
      <div
        className="rounded-lg p-6"
        style={{ background: '#111114', border: '1px solid #1f1f23' }}
      >
        <h3 className="text-sm font-semibold text-white mb-1">Score Breakdown</h3>
        <p className="text-xs mb-5" style={{ color: '#6b7280' }}>
          Your performance score vs niche average (100 = fully at par)
        </p>
        {chartData ? (
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={chartData} barCategoryGap="30%" barGap={4}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1f1f23" vertical={false} />
              <XAxis dataKey="name" tick={{ fill: '#6b7280', fontSize: 12 }} axisLine={false} tickLine={false} />
              <YAxis domain={[0, 100]} tick={{ fill: '#6b7280', fontSize: 12 }} axisLine={false} tickLine={false} />
              <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(255,255,255,0.03)' }} />
              <Legend wrapperStyle={{ fontSize: 12, color: '#6b7280', paddingTop: 12 }} />
              <Bar dataKey="you" name="Your Score" fill="#2563eb" radius={[3, 3, 0, 0]} />
              <Bar dataKey="avg" name="Niche Avg" fill="#374151" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <div className="space-y-3">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-32 w-full" />
            <Skeleton className="h-4 w-1/2" />
          </div>
        )}
      </div>

      {/* Section 5 — Recent intelligence */}
      <div>
        <h3 className="text-sm font-semibold text-white mb-4">Recent Intelligence</h3>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

          {/* Viral video card */}
          <div
            className="rounded-lg p-5 transition-colors"
            style={{ background: '#111114', border: '1px solid #1f1f23' }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.borderColor = 'rgba(37,99,235,0.4)' }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.borderColor = '#1f1f23' }}
          >
            <div className="flex items-center gap-2 mb-3">
              <TrendingUpIcon />
              <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: '#f59e0b' }}>Viral in Niche</span>
            </div>
            {latestTrend ? (
              <>
                <p className="text-sm font-medium text-white leading-snug mb-1 line-clamp-2">
                  {latestTrend.title ?? 'Untitled video'}
                </p>
                <p className="text-xs" style={{ color: '#6b7280' }}>
                  {latestTrend.channel_name} · {formatNumber(latestTrend.view_count)} views
                </p>
                {latestTrend.youtube_video_id && (
                  <a
                    href={`https://youtube.com/watch?v=${latestTrend.youtube_video_id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-block mt-3 text-xs font-medium transition-opacity hover:opacity-80"
                    style={{ color: '#2563eb' }}
                  >
                    Watch on YouTube →
                  </a>
                )}
              </>
            ) : (
              <p className="text-sm" style={{ color: '#6b7280' }}>No viral videos detected yet.</p>
            )}
          </div>

          {/* Latest digest card */}
          <div
            className="rounded-lg p-5 transition-colors"
            style={{ background: '#111114', border: '1px solid #1f1f23' }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.borderColor = 'rgba(37,99,235,0.4)' }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.borderColor = '#1f1f23' }}
          >
            <div className="flex items-center gap-2 mb-3">
              <FileTextIcon />
              <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: '#22c55e' }}>Weekly Digest</span>
            </div>
            {latestDigest ? (
              <>
                <p className="text-sm font-medium text-white mb-1">
                  Digest — {new Date(latestDigest.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                </p>
                <p className="text-xs leading-relaxed line-clamp-3" style={{ color: '#6b7280' }}>
                  {latestDigest.content.slice(0, 120)}...
                </p>
                <a
                  href="/digest"
                  className="inline-block mt-3 text-xs font-medium transition-opacity hover:opacity-80"
                  style={{ color: '#2563eb' }}
                >
                  Read full digest →
                </a>
              </>
            ) : (
              <p className="text-sm" style={{ color: '#6b7280' }}>No digest generated yet. Check back Monday.</p>
            )}
          </div>

          {/* Upgrade nudge or bottleneck */}
          {gapScore?.primary_bottleneck ? (
            <div
              className="rounded-lg p-5 transition-colors"
              style={{ background: '#111114', border: '1px solid #1f1f23' }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.borderColor = 'rgba(37,99,235,0.4)' }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.borderColor = '#1f1f23' }}
            >
              <div className="flex items-center gap-2 mb-3">
                <ZapIcon />
                <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: '#2563eb' }}>Top Opportunity</span>
              </div>
              <p className="text-sm text-white leading-snug mb-1">Primary bottleneck</p>
              <p className="text-xs leading-relaxed" style={{ color: '#9ca3af' }}>
                {gapScore.primary_bottleneck}
              </p>
              {revenueGap != null && revenueGap > 0 && (
                <p className="mt-3 text-xs font-mono" style={{ color: '#f59e0b' }}>
                  {formatCurrency(revenueGap)}/mo left on the table
                </p>
              )}
            </div>
          ) : (
            <div
              className="rounded-lg p-5 flex flex-col justify-between"
              style={{ background: '#111114', border: '1px solid #2563eb33' }}
            >
              <div>
                <p className="text-sm font-semibold text-white mb-1">Unlock full intelligence</p>
                <p className="text-xs leading-relaxed" style={{ color: '#6b7280' }}>
                  Upgrade to Starter to get weekly digests, trend alerts, and 5 competitor slots.
                </p>
              </div>
              <a
                href="/pricing"
                className="inline-block mt-4 px-4 py-2 rounded-lg text-xs font-medium text-white text-center transition-opacity hover:opacity-80"
                style={{ background: '#2563eb' }}
              >
                Upgrade to Starter →
              </a>
            </div>
          )}

        </div>
      </div>

    </div>
  )
}

// ─── Inline icons ─────────────────────────────────────────────────────────────

function TrendingUpIcon() {
  return (
    <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="#f59e0b" strokeWidth={2} aria-hidden="true">
      <polyline points="23 6 13.5 15.5 8.5 10.5 1 18" />
      <polyline points="17 6 23 6 23 12" />
    </svg>
  )
}

function FileTextIcon() {
  return (
    <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="#22c55e" strokeWidth={1.75} aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="16" y1="13" x2="8" y2="13" />
      <line x1="16" y1="17" x2="8" y2="17" />
    </svg>
  )
}

function ZapIcon() {
  return (
    <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="#2563eb" strokeWidth={2} aria-hidden="true">
      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
    </svg>
  )
}
