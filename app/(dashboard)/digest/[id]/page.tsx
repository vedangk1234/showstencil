import { auth } from '@/auth'
import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { getDigestById } from '@/lib/db'
import type { DigestVideoIdea } from '@/types'

// ─── Helpers ─────────────────────────────────────────────────────────────────

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

// ─── Markdown rendering ───────────────────────────────────────────────────────

/** Render a string with **bold** markers as React JSX. */
function BoldText({ text }: { text: string }) {
  const parts = text.split(/\*\*(.+?)\*\*/g)
  return (
    <>
      {parts.map((part, i) =>
        i % 2 === 1 ? (
          <strong key={i} className="text-white font-semibold">
            {part}
          </strong>
        ) : (
          <span key={i}>{part}</span>
        ),
      )}
    </>
  )
}

function SectionBody({ body }: { body: string }) {
  const paragraphs = body
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean)

  if (paragraphs.length === 0) return null

  return (
    <div className="flex flex-col gap-3">
      {paragraphs.map((p, i) => (
        <p key={i} className="text-zinc-400 text-[14px] leading-relaxed m-0">
          <BoldText text={p} />
        </p>
      ))}
    </div>
  )
}

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

// ─── Sub-components ───────────────────────────────────────────────────────────

function MetricCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="border border-zinc-800 rounded-lg p-3 flex flex-col gap-1">
      <span className="font-mono text-[9.5px] tracking-[0.12em] uppercase text-zinc-600">
        {label}
      </span>
      <span className="font-mono text-sm font-medium text-white">{value}</span>
    </div>
  )
}

function ScorePill({ score }: { score: number | null }) {
  if (score == null) return null
  const cls =
    score >= 80
      ? 'bg-emerald-900/40 text-emerald-400 border-emerald-800'
      : score >= 50
        ? 'bg-amber-900/40 text-amber-400 border-amber-800'
        : 'bg-zinc-800 text-zinc-400 border-zinc-700'
  return (
    <span className={`font-mono text-[10px] px-2 py-0.5 rounded border shrink-0 ${cls}`}>
      {score}
    </span>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

interface KeyMetrics {
  overallGapScore?: number
  avgViews?: number
  revenueGap?: number
  ctr?: number
  uploadsPerMonth?: number
  avgWatchSeconds?: number
}

export default async function DigestDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const session = await auth()
  if (!session?.user?.id) redirect('/login')

  const { id } = await params
  const digest = await getDigestById(id)

  if (!digest || digest.user_id !== session.user.id) {
    notFound()
  }

  const km = (digest.key_metrics as KeyMetrics | null) ?? {}
  const ideas = (digest.video_ideas as unknown as DigestVideoIdea[] | null) ?? []
  const sections = parseSections(digest.content ?? '')

  return (
    <div className="bg-stencil-bg text-stencil-ink font-sans min-h-full p-7 max-w-[760px]">

      {/* Back link */}
      <Link
        href="/digest"
        className="font-mono text-[11px] text-zinc-600 hover:text-white transition-colors inline-flex items-center gap-1 mb-8 no-underline"
      >
        ← All digests
      </Link>

      {/* Title */}
      <div className="mb-8">
        <p className="font-mono text-[10.5px] tracking-[0.14em] uppercase text-zinc-600 mb-1">
          Weekly Digest
        </p>
        <h1 className="text-white text-[22px] font-bold tracking-[-0.4px]">
          Week of {fmtWeekDate(digest.week_start_date)}
        </h1>
        {digest.email_sent_at && (
          <p className="font-mono text-[10.5px] text-zinc-600 mt-2">
            <span className="inline-block size-[5px] rounded-full bg-emerald-500 mr-1.5 align-middle" />
            Emailed{' '}
            {new Date(digest.email_sent_at).toLocaleDateString('en-US', {
              month: 'short',
              day: 'numeric',
              year: 'numeric',
            })}
          </p>
        )}
      </div>

      {/* Key metrics */}
      {Object.keys(km).length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mb-10">
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
      )}

      {/* Markdown content sections */}
      <div className="flex flex-col gap-10">
        {sections.map((sec, i) => (
          <div key={i}>
            <h2 className="font-mono text-[10.5px] tracking-[0.14em] uppercase text-zinc-500 mb-3">
              {sec.header}
            </h2>
            <SectionBody body={sec.body} />
          </div>
        ))}
      </div>

      {/* Video ideas */}
      {ideas.length > 0 && (
        <div className="mt-10">
          <h2 className="font-mono text-[10.5px] tracking-[0.14em] uppercase text-zinc-500 mb-4">
            Video Ideas
          </h2>
          <div className="flex flex-col gap-3">
            {ideas.map((idea, i) => (
              <div
                key={i}
                className="border border-zinc-800 rounded-xl p-4 flex flex-col gap-2 bg-zinc-900/30"
              >
                <div className="flex items-start justify-between gap-3">
                  <span className="text-white text-[14px] font-medium leading-snug">
                    {idea.title}
                  </span>
                  <ScorePill score={idea.opportunityScore ?? null} />
                </div>
                {idea.reasoning && (
                  <p className="text-zinc-500 text-[12px] leading-relaxed m-0">
                    {idea.reasoning}
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

    </div>
  )
}
