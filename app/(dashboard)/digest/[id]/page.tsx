import { auth } from '@/auth'
import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { getDigestById } from '@/lib/db'
import { createServiceClient } from '@/lib/supabase'

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

interface KeyMetrics {
  overallGapScore?: number
  avgViews?: number
  revenueGap?: number
  ctr?: number
  uploadsPerMonth?: number
  avgWatchSeconds?: number
}

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

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function DigestDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const session = await auth()
  if (!session?.user?.id) redirect('/login')
  const userId = session.user.id

  const { id } = await params
  const supabase = createServiceClient()

  const [digest, competitorResult] = await Promise.all([
    getDigestById(id),
    supabase
      .from('competitors')
      .select('id, channel_name, tier, is_dominator, subscriber_count, avg_views_per_video, upload_frequency_30d, sub_niche')
      .eq('user_id', userId)
      .eq('is_active', true)
      .order('tier', { ascending: true }),
  ])

  if (!digest || digest.user_id !== userId) {
    notFound()
  }

  const competitors = (competitorResult.data ?? []) as CompetitorRow[]
  const km = (digest.key_metrics as KeyMetrics | null) ?? {}
  const allSections = parseSections(digest.content ?? '')

  // Build section elements: replace competitor section with DB block, remove ideas
  const sectionItems: React.ReactNode[] = []
  let competitorBlockAdded = false

  for (const [i, sec] of allSections.entries()) {
    const h = sec.header.toLowerCase()

    // Remove ideas section
    if (h.includes('video idea') || h.includes('3 video')) continue

    // Replace competitor markdown section with DB-driven block
    if (h.includes('competitor')) {
      if (!competitorBlockAdded) {
        sectionItems.push(
          <div key={`comp-${i}`}>
            <h2 className="font-mono text-[10.5px] tracking-[0.14em] uppercase text-zinc-500 mb-3">
              {sec.header}
            </h2>
            <div className="flex flex-col">
              {competitors.length === 0 ? (
                <p className="text-zinc-500 text-[14px] m-0">
                  No competitor data available yet — check back after the next sync.
                </p>
              ) : (
                competitors.map((comp) => (
                  <div
                    key={comp.id}
                    className="flex flex-col gap-1 py-3 border-b border-dashed border-zinc-800 last:border-0"
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-white font-medium text-[14px]">
                        {comp.channel_name ?? 'Unknown'}
                      </span>
                      <span className={tierBadgeClass(comp.tier, comp.is_dominator)}>
                        {tierBadgeLabel(comp.tier, comp.is_dominator)}
                      </span>
                    </div>
                    <p className="text-zinc-400 text-[14px] leading-relaxed m-0">
                      {buildCompetitorSummary(comp)}
                    </p>
                  </div>
                ))
              )}
            </div>
          </div>,
        )
        competitorBlockAdded = true
      }
      continue
    }

    sectionItems.push(
      <div key={i}>
        <h2 className="font-mono text-[10.5px] tracking-[0.14em] uppercase text-zinc-500 mb-3">
          {sec.header}
        </h2>
        <SectionBody body={sec.body} />
      </div>,
    )
  }

  // If no competitor section found in markdown, append block at end
  if (!competitorBlockAdded && competitors.length > 0) {
    sectionItems.push(
      <div key="comp-fallback">
        <h2 className="font-mono text-[10.5px] tracking-[0.14em] uppercase text-zinc-500 mb-3">
          YOUR COMPETITORS
        </h2>
        <div className="flex flex-col">
          {competitors.map((comp) => (
            <div
              key={comp.id}
              className="flex flex-col gap-1 py-3 border-b border-dashed border-zinc-800 last:border-0"
            >
              <div className="flex items-center gap-2">
                <span className="text-white font-medium text-[14px]">
                  {comp.channel_name ?? 'Unknown'}
                </span>
                <span className={tierBadgeClass(comp.tier, comp.is_dominator)}>
                  {tierBadgeLabel(comp.tier, comp.is_dominator)}
                </span>
              </div>
              <p className="text-zinc-400 text-[14px] leading-relaxed m-0">
                {buildCompetitorSummary(comp)}
              </p>
            </div>
          ))}
        </div>
      </div>,
    )
  }

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

      {/* Markdown content sections with competitor block injected and ideas removed */}
      <div className="flex flex-col gap-10">
        {sectionItems}
      </div>

    </div>
  )
}
