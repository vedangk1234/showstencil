import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import { getCompetitors } from '@/lib/db'
import type { Competitor } from '@/types'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(n: number | null | undefined): string {
  if (n == null) return '—'
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return String(n)
}

function timeAgo(iso: string | null): string {
  if (!iso) return 'never'
  const diff = Date.now() - new Date(iso).getTime()
  const hours = Math.floor(diff / 3_600_000)
  if (hours < 1) return 'just now'
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return days === 1 ? '1 day ago' : `${days} days ago`
}

const TIER_LABEL: Record<number, string> = {
  1: 'Similar',
  2: 'Aspirational',
  3: 'Dominator',
}

const TIER_COLOR: Record<number, { text: string; bg: string; border: string }> = {
  1: { text: '#60a5fa', bg: '#0a1628', border: '#1d3a6e' },
  2: { text: '#a78bfa', bg: '#120a28', border: '#3a1d6e' },
  3: { text: '#f87171', bg: '#280a0a', border: '#6e1d1d' },
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function CompetitorRow({ competitor }: { competitor: Competitor }) {
  const tier = competitor.tier ?? 1
  const colors = TIER_COLOR[tier] ?? TIER_COLOR[1]

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: 14,
      padding: '12px 16px',
      borderBottom: '1px solid #111111',
    }}>
      {/* Avatar */}
      <div style={{
        width: 32, height: 32,
        borderRadius: '50%',
        background: '#1a1a1a',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        flexShrink: 0,
        fontSize: 12,
        fontWeight: 700,
        color: '#555555',
      }}>
        {competitor.channel_name?.[0]?.toUpperCase() ?? '?'}
      </div>

      {/* Name + meta */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{
          color: '#ffffff',
          fontSize: 13,
          fontWeight: 500,
          margin: '0 0 2px',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}>
          {competitor.channel_name ?? competitor.youtube_channel_id}
        </p>
        <p style={{ color: '#444444', fontSize: 11, margin: 0 }}>
          Last synced {timeAgo(competitor.last_synced_at)}
          {competitor.is_auto_detected && (
            <span style={{ marginLeft: 8, color: '#333333' }}>· Auto-detected</span>
          )}
        </p>
      </div>

      {/* Subs */}
      <div style={{ textAlign: 'right', minWidth: 60 }}>
        <p style={{ color: '#ffffff', fontSize: 13, fontWeight: 500, margin: '0 0 2px' }}>
          {fmt(competitor.subscriber_count)}
        </p>
        <p style={{ color: '#444444', fontSize: 11, margin: 0 }}>subscribers</p>
      </div>

      {/* Tier badge */}
      <span style={{
        fontSize: 10,
        fontWeight: 600,
        color: colors.text,
        background: colors.bg,
        border: `1px solid ${colors.border}`,
        borderRadius: 4,
        padding: '3px 8px',
        flexShrink: 0,
      }}>
        Tier {tier} · {TIER_LABEL[tier]}
      </span>
    </div>
  )
}

function EmptyState() {
  return (
    <div style={{
      padding: '48px 24px',
      textAlign: 'center',
    }}>
      <div style={{
        width: 36, height: 36,
        background: '#111111',
        borderRadius: 8,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        margin: '0 auto 14px',
      }}>
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          <circle cx="8" cy="6" r="3" stroke="#444444" strokeWidth="1.5" />
          <circle cx="3" cy="9" r="2" stroke="#333333" strokeWidth="1.5" />
          <circle cx="13" cy="9" r="2" stroke="#333333" strokeWidth="1.5" />
          <path d="M1 14c0-2 1-3 2-3m10 3c0-2-1-3-2-3M5 14c0-2 1.3-3 3-3s3 1 3 3" stroke="#333333" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      </div>
      <p style={{ color: '#ffffff', fontSize: 13, fontWeight: 600, margin: '0 0 6px' }}>
        No competitors tracked yet
      </p>
      <p style={{ color: '#555555', fontSize: 12, margin: 0, lineHeight: 1.6 }}>
        Competitors are auto-detected when your channel data is synced.<br />
        Make sure your YouTube channel is connected and data has been synced.
      </p>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function CompetitorsPage() {
  const session = await auth()
  if (!session) redirect('/login')

  const competitors = await getCompetitors(session.user.id)

  const tier1 = competitors.filter((c) => c.tier === 1)
  const tier2 = competitors.filter((c) => c.tier === 2)
  const tier3 = competitors.filter((c) => c.tier === 3)

  return (
    <div style={{ padding: '28px 32px', maxWidth: 800 }}>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 28 }}>
        <div>
          <h1 style={{ color: '#ffffff', fontSize: 18, fontWeight: 700, margin: '0 0 4px', letterSpacing: '-0.3px' }}>
            Competitor Tracking
          </h1>
          <p style={{ color: '#555555', fontSize: 13, margin: 0 }}>
            Channels we benchmark you against.{' '}
            {competitors.length > 0 && (
              <span style={{ color: '#444444' }}>{competitors.length} tracked</span>
            )}
          </p>
        </div>

        {/* Add button — non-functional placeholder */}
        <button
          disabled
          title="Coming soon"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            padding: '7px 14px',
            borderRadius: 6,
            fontSize: 12,
            fontWeight: 500,
            color: '#555555',
            background: '#111111',
            border: '1px solid #1a1a1a',
            cursor: 'not-allowed',
          }}
        >
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
            <path d="M5 1v8M1 5h8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
          Add Competitor
        </button>
      </div>

      {/* Competitor list */}
      {competitors.length === 0 ? (
        <div style={{ background: '#0a0a0a', border: '1px dashed #1a1a1a', borderRadius: 8 }}>
          <EmptyState />
        </div>
      ) : (
        <div style={{ background: '#0a0a0a', border: '1px solid #1a1a1a', borderRadius: 8, overflow: 'hidden' }}>

          {/* Legend */}
          <div style={{
            padding: '10px 16px',
            borderBottom: '1px solid #111111',
            display: 'flex',
            gap: 16,
          }}>
            {[1, 2, 3].map((t) => {
              const count = [tier1, tier2, tier3][t - 1].length
              if (count === 0) return null
              const c = TIER_COLOR[t]
              return (
                <span key={t} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: c.text, display: 'inline-block' }} />
                  <span style={{ color: '#444444', fontSize: 11 }}>
                    Tier {t} · {TIER_LABEL[t]} ({count})
                  </span>
                </span>
              )
            })}
          </div>

          {competitors.map((c) => (
            <CompetitorRow key={c.id} competitor={c} />
          ))}

          {/* Remove last border */}
          <div style={{ height: 1, background: 'transparent', marginTop: -1 }} />
        </div>
      )}

      {/* Info callout */}
      <div style={{
        marginTop: 20,
        padding: '12px 16px',
        background: '#0a0a0a',
        border: '1px solid #1a1a1a',
        borderRadius: 8,
        display: 'flex',
        gap: 10,
        alignItems: 'flex-start',
      }}>
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" style={{ flexShrink: 0, marginTop: 1 }}>
          <circle cx="7" cy="7" r="6" stroke="#333333" strokeWidth="1.3" />
          <path d="M7 6v4M7 4.5v.5" stroke="#444444" strokeWidth="1.3" strokeLinecap="round" />
        </svg>
        <p style={{ color: '#444444', fontSize: 12, margin: 0, lineHeight: 1.6 }}>
          <span style={{ color: '#555555', fontWeight: 500 }}>Tier 1</span> = 1–3× your subscribers.{' '}
          <span style={{ color: '#555555', fontWeight: 500 }}>Tier 2</span> = 3–10×.
          Competitors are auto-detected based on your niche. Manual competitor management coming in a future update.
        </p>
      </div>

    </div>
  )
}
