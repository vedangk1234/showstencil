'use client'

import * as React from 'react'
import Link from 'next/link'
import { ExpandableCard } from '@/components/ui/expandable-card'
import { getNicheImage } from '@/lib/niche-images'
import type { Digest, DigestVideoIdea } from '@/types'

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

function ExpandedDigest({ digest }: { digest: Digest }) {
  const km = (digest.key_metrics as KeyMetrics | null) ?? {}
  const ideas = (digest.video_ideas as unknown as DigestVideoIdea[] | null) ?? []
  const sections = parseSections(digest.content ?? '')

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

      {/* Markdown sections */}
      {sections.map((sec, i) => (
        <div key={i} className="flex flex-col gap-2">
          <h4 className="font-mono text-[11px] tracking-[0.12em] uppercase text-zinc-500">
            {sec.header}
          </h4>
          <SectionBody body={sec.body} />
        </div>
      ))}

      {/* Video ideas */}
      {ideas.length > 0 && (
        <div className="flex flex-col gap-3">
          <h4 className="font-mono text-[11px] tracking-[0.12em] uppercase text-zinc-500">
            Video Ideas
          </h4>
          {ideas.map((idea, i) => (
            <div
              key={i}
              className="border border-zinc-800 rounded-xl p-4 flex flex-col gap-2 bg-zinc-900/50"
            >
              <div className="flex items-start justify-between gap-3">
                <span className="text-white text-sm font-medium leading-snug">
                  {idea.title}
                </span>
                <ScorePill score={idea.opportunityScore ?? null} />
              </div>
              {idea.reasoning && (
                <p className="text-zinc-500 text-xs leading-relaxed m-0">{idea.reasoning}</p>
              )}
            </div>
          ))}
        </div>
      )}

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

      {/* Deep link */}
      <Link
        href={`/digest/${digest.id}`}
        className="self-start font-mono text-[11px] text-zinc-500 hover:text-white transition-colors"
      >
        Open full page →
      </Link>
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

function fmtNum(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return n.toLocaleString()
}

// ─── Main client component ────────────────────────────────────────────────────

interface Props {
  digests: Digest[]
  nicheId: string
}

export default function DigestListClient({ digests, nicheId }: Props) {
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
          {digests.map((digest, i) => {
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
                src={getNicheImage(nicheId, (i % 13) + 1)}
                title={`Week of ${fmtWeekDate(digest.week_start_date)}`}
                description={description}
                classNameExpanded="max-h-[90vh]"
              >
                <ExpandedDigest digest={digest} />
              </ExpandableCard>
            )
          })}
        </div>
      )}
    </div>
  )
}
