'use client'

import * as React from 'react'
import { ExpandableCard } from '@/components/ui/expandable-card'
import type { Digest } from '@/types'

// ─── Types ────────────────────────────────────────────────────────────────────

interface CompetitorRow {
  id: string
  channel_name: string | null
  tier: number | null
  is_dominator: boolean
  subscriber_count: number | null
  avg_views_per_video: number | null
  upload_frequency_30d: number | null
  sub_niche: string | null
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function nextMonday(): string {
  const d = new Date()
  const day = d.getUTCDay()
  const daysUntilMonday = day === 0 ? 1 : 8 - day
  d.setUTCDate(d.getUTCDate() + daysUntilMonday)
  return d.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC',
  })
}

function fmtWeekDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  })
}

function fmtNum(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return n.toLocaleString()
}

/** Render a string that may contain **bold** markers into React nodes. */
function BoldText({ text }: { text: string }) {
  const parts = text.split(/\*\*(.+?)\*\*/g)
  return (
    <>
      {parts.map((part, i) =>
        i % 2 === 1 ? <strong key={i} className="text-white">{part}</strong> : part,
      )}
    </>
  )
}

/** Render a markdown section body (plain paragraphs + **bold**). */
function SectionBody({ body }: { body: string }) {
  const paragraphs = body
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean)

  if (paragraphs.length === 0) return null

  return (
    <div className="flex flex-col gap-3">
      {paragraphs.map((p, i) => (
        <p key={i} className="text-zinc-400 text-sm leading-relaxed m-0">
          <BoldText text={p} />
        </p>
      ))}
    </div>
  )
}

/** Parse the full digest content into labelled sections. */
function parseSections(content: string): { header: string; body: string }[] {
  const raw = content.split(/\n(?=##\s)/).filter(Boolean)
  return raw.map((chunk) => {
    const nl = chunk.indexOf('\n')
    if (nl === -1) return { header: chunk.replace(/^##\s*/, '').trim(), body: '' }
    const header = chunk.slice(0, nl).replace(/^##\s*/, '').trim()
    const body = chunk.slice(nl + 1).trim()
    return { header, body }
  })
}

// ─── Competitor helpers ───────────────────────────────────────────────────────

function tierBadgeLabel(tier: number | null, isDominator: boolean): string {
  if (isDominator || tier === 3) return 'Dominator'
  if (tier === 2) return 'Tier 2'
  return 'Tier 1'
}

function tierBadgeClass(tier: number | null, isDominator: boolean): string {
  if (isDominator || tier === 3)
    return 'text-[10px] font-mono uppercase tracking-wide px-2 py-0.5 border rounded-sm text-amber-400 border-amber-400/40 bg-amber-400/10'
  if (tier === 2)
    return 'text-[10px] font-mono uppercase tracking-wide px-2 py-0.5 border rounded-sm text-purple-400 border-purple-400/40 bg-purple-400/10'
  return 'text-[10px] font-mono uppercase tracking-wide px-2 py-0.5 border rounded-sm text-blue-400 border-blue-400/40 bg-blue-400/10'
}

function buildCompetitorSummary(comp: CompetitorRow): string {
  const parts: string[] = []

  if (comp.upload_frequency_30d != null && comp.avg_views_per_video != null) {
    parts.push(
      `Posting ${comp.upload_frequency_30d} videos/month with an average of ${fmtNum(comp.avg_views_per_video)} views per video.`,
    )
  } else if (comp.avg_views_per_video != null) {
    parts.push(`Averaging ${fmtNum(comp.avg_views_per_video)} views per video.`)
  }

  if (comp.subscriber_count != null) {
    parts.push(`${fmtNum(comp.subscriber_count)} subscribers.`)
  }

  if (comp.sub_niche) {
    parts.push(`Focused on ${comp.sub_niche}.`)
  }

  return parts.join(' ') || 'No data available yet — syncing in progress.'
}

function CompetitorList({ competitors }: { competitors: CompetitorRow[] }) {
  if (competitors.length === 0) {
    return (
      <p className="text-zinc-500 text-sm m-0">
        No competitor data available yet — check back after the next sync.
      </p>
    )
  }
  return (
    <div className="flex flex-col">
      {competitors.map((comp) => (
        <div
          key={comp.id}
          className="flex flex-col gap-1 py-3 border-b border-dashed border-zinc-800 last:border-0"
        >
          <div className="flex items-center gap-2">
            <span className="text-white font-medium text-sm">
              {comp.channel_name ?? 'Unknown'}
            </span>
            <span className={tierBadgeClass(comp.tier, comp.is_dominator)}>
              {tierBadgeLabel(comp.tier, comp.is_dominator)}
            </span>
          </div>
          <p className="text-zinc-400 text-sm leading-relaxed m-0">
            {buildCompetitorSummary(comp)}
          </p>
        </div>
      ))}
    </div>
  )
}

// ─── Opportunity score pill ───────────────────────────────────────────────────

function ScorePill({ score }: { score: number | null }) {
  if (score == null) return null
  const cls =
    score >= 80
      ? 'bg-emerald-900/40 text-emerald-400 border-emerald-800'
      : score >= 50
        ? 'bg-amber-900/40 text-amber-400 border-amber-800'
        : 'bg-zinc-800 text-zinc-400 border-zinc-700'
  return (
    <span className={`font-mono text-[10px] px-2 py-0.5 rounded border ${cls}`}>
      {score}
    </span>
  )
}

// ─── Expanded digest content ──────────────────────────────────────────────────

interface KeyMetrics {
  overallGapScore?: number
  avgViews?: number
  revenueGap?: number
  ctr?: number
  uploadsPerMonth?: number
  avgWatchSeconds?: number
}

function ExpandedDigest({
  digest,
  competitors,
}: {
  digest: Digest
  competitors: CompetitorRow[]
}) {
  const km = (digest.key_metrics as KeyMetrics | null) ?? {}
  const allSections = parseSections(digest.content ?? '')

  // Build section elements: replace competitor section with DB block, remove ideas
  const sectionElements: React.ReactNode[] = []
  let competitorBlockAdded = false

  for (const [i, sec] of allSections.entries()) {
    const h = sec.header.toLowerCase()

    // Remove ideas section
    if (h.includes('video idea') || h.includes('3 video')) continue

    // Replace competitor markdown section with DB-driven block
    if (h.includes('competitor')) {
      if (!competitorBlockAdded) {
        sectionElements.push(
          <div key={`comp-${i}`} className="flex flex-col gap-3">
            <h4 className="font-mono text-[11px] tracking-[0.12em] uppercase text-zinc-500">
              {sec.header}
            </h4>
            <CompetitorList competitors={competitors} />
          </div>,
        )
        competitorBlockAdded = true
      }
      continue
    }

    sectionElements.push(
      <div key={i} className="flex flex-col gap-2">
        <h4 className="font-mono text-[11px] tracking-[0.12em] uppercase text-zinc-500">
          {sec.header}
        </h4>
        <SectionBody body={sec.body} />
      </div>,
    )
  }

  // If digest had no competitor section in markdown, append competitor block at end
  if (!competitorBlockAdded && competitors.length > 0) {
    sectionElements.push(
      <div key="comp-fallback" className="flex flex-col gap-3">
        <h4 className="font-mono text-[11px] tracking-[0.12em] uppercase text-zinc-500">
          YOUR COMPETITORS
        </h4>
        <CompetitorList competitors={competitors} />
      </div>,
    )
  }

  return (
    <div className="w-full flex flex-col gap-8">

      {/* Key metrics row */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {km.overallGapScore != null && (
          <MetricCell label="Gap Score" value={`${km.overallGapScore}/100`} />
        )}
        {km.avgViews != null && (
          <MetricCell label="Avg Views" value={fmtNum(km.avgViews)} />
        )}
        {km.revenueGap != null && km.revenueGap > 0 && (
          <MetricCell label="Revenue Gap" value={`$${Math.round(km.revenueGap)}/mo`} />
        )}
        {km.ctr != null && km.ctr > 0 && (
          <MetricCell label="CTR" value={`${km.ctr.toFixed(1)}%`} />
        )}
        {km.uploadsPerMonth != null && (
          <MetricCell label="Uploads/mo" value={km.uploadsPerMonth.toFixed(1)} />
        )}
      </div>

      {/* Sections with competitor block injected and ideas removed */}
      {sectionElements}

      {/* Email sent footer */}
      {digest.email_sent_at && (
        <p className="font-mono text-[10px] text-zinc-600 m-0">
          Emailed{' '}
          {new Date(digest.email_sent_at).toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
          })}
        </p>
      )}

    </div>
  )
}

function MetricCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="border border-zinc-800 rounded-lg p-3 flex flex-col gap-1">
      <span className="font-mono text-[9.5px] tracking-[0.12em] uppercase text-zinc-600">{label}</span>
      <span className="font-mono text-sm font-medium text-white">{value}</span>
    </div>
  )
}

// ─── Main client component ────────────────────────────────────────────────────

interface Props {
  digests: Digest[]
  competitors: CompetitorRow[]
}

export default function DigestListClient({ digests, competitors }: Props) {
  return (
    <div className="bg-stencil-bg text-stencil-ink font-sans min-h-full p-7 max-w-[860px]">

      {/* Header */}
      <div className="mb-8">
        <h1 className="text-white text-[18px] font-bold tracking-[-0.3px] mb-1">
          Weekly Digest
        </h1>
        <p className="font-mono text-[11.5px] text-stencil-ink3">
          AI-generated weekly reports comparing your channel to competitors.
        </p>
      </div>

      {/* Next digest banner */}
      <div className="border border-stencil-line bg-stencil-bg2 px-[18px] py-[13px] flex items-center gap-3 mb-8">
        <span className="size-[6px] rounded-full bg-amber-400 shrink-0" />
        <p className="font-mono text-[11.5px] text-stencil-ink3 m-0">
          Next digest:{' '}
          <span className="text-white font-medium">{nextMonday()} at 9:00 AM UTC</span>
        </p>
      </div>

      {/* Label */}
      <p className="font-mono text-[10.5px] tracking-[0.14em] uppercase text-stencil-ink3 mb-4">
        {digests.length === 0
          ? 'Your digests will appear here'
          : `${digests.length} digest${digests.length !== 1 ? 's' : ''}`}
      </p>

      {digests.length === 0 ? (
        <div className="border border-dashed border-stencil-line p-10 text-center">
          <p className="text-white text-[13px] font-semibold mb-1">No digests yet.</p>
          <p className="font-mono text-[11.5px] text-stencil-ink3">
            Your first digest arrives on Monday at 9 AM UTC.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {digests.map((digest) => {
            const km = (digest.key_metrics as KeyMetrics | null) ?? {}
            const score = km.overallGapScore
            const uploads = km.uploadsPerMonth

            const description =
              score != null
                ? `Gap score ${score}/100${uploads != null ? `  ·  ${uploads.toFixed(1)} uploads/month` : ''}`
                : fmtWeekDate(digest.created_at)

            return (
              <ExpandableCard
                key={digest.id}
                src=""
                title={`Week of ${fmtWeekDate(digest.week_start_date)}`}
                description={description}
                className="[&_img]:hidden [&_img]:h-0"
                classNameExpanded="max-h-[90vh] [&_img]:hidden [&_img]:h-0"
              >
                <ExpandedDigest digest={digest} competitors={competitors} />
              </ExpandableCard>
            )
          })}
        </div>
      )}
    </div>
  )
}
