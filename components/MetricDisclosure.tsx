/**
 * MetricDisclosure — visible (non-hover) labels that mark ShowStencil's derived /
 * estimated values as NOT official YouTube metrics.
 *
 * Compliance: YouTube API Services Terms III.E.4(h) ("derived metrics"). Every score,
 * estimate, tier, or trend indicator ShowStencil calculates must be clearly and visibly
 * distinguished from raw YouTube-published data. Raw API values (subscribers, views,
 * video counts, the user's own analytics) must NOT carry a disclosure — only derived /
 * estimated values do.
 */

export type MetricDisclosureVariant =
  | 'score' // ShowStencil-calculated scores (gap score, per-metric gaps)
  | 'estimate' // ShowStencil estimates of data YouTube does not expose (competitor CTR / watch time)
  | 'revenue' // competitor/niche revenue GAP — mixes industry CPM assumptions with API data
  | 'youtubeEstimate' // the user's OWN revenue: this IS YouTube Analytics API data
  | 'analysis' // qualitative labels (tiers, viral / momentum / trend, sub-niche)

/**
 * Exact disclosure wording per variant. Exported so surfaces that cannot use
 * Tailwind classes (React Email templates, dark-hex inline-styled tables) can
 * reuse the identical copy.
 */
export const DISCLOSURE_COPY: Record<MetricDisclosureVariant, string> = {
  score: 'Calculated by ShowStencil — not a YouTube metric',
  estimate: 'ShowStencil estimate — not available from YouTube API',
  revenue:
    'ShowStencil estimate using industry CPM assumptions — not YouTube data or a Google-approved figure.',
  youtubeEstimate: 'YouTube Analytics estimate for your channel',
  analysis: 'ShowStencil analysis',
}

const COPY = DISCLOSURE_COPY

interface MetricDisclosureProps {
  variant: MetricDisclosureVariant
  /** Extra classes for spacing/alignment at the call site. */
  className?: string
  /** Render as a small pill/badge instead of a plain caption. */
  badge?: boolean
}

/**
 * Standard footer line for digest emails' web equivalents and AI insight cards.
 * Kept as an exported constant so email templates (which cannot import Tailwind
 * components) can reuse the exact wording.
 */
export const DISCLOSURE_FOOTER =
  'Scores and estimates are calculated by ShowStencil from YouTube API data and are not YouTube metrics.'

export default function MetricDisclosure({
  variant,
  className = '',
  badge = false,
}: MetricDisclosureProps) {
  const text = COPY[variant]

  if (badge) {
    return (
      <span
        className={`inline-flex items-center gap-1 font-mono text-[9.5px] uppercase tracking-[0.08em] text-stencil-ink4 border border-stencil-line rounded-sm px-1.5 py-0.5 leading-none ${className}`}
        title={text}
      >
        {text}
      </span>
    )
  }

  return (
    <span
      className={`block font-mono text-[10px] leading-tight text-stencil-ink4 ${className}`}
    >
      {text}
    </span>
  )
}

/** Footer caption for digest / insight cards. */
export function MetricDisclosureFooter({ className = '' }: { className?: string }) {
  return (
    <p className={`font-mono text-[10px] leading-snug text-stencil-ink4 ${className}`}>
      {DISCLOSURE_FOOTER}
    </p>
  )
}
