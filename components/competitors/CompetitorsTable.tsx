'use client'

import { useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { TierBadge } from './TierBadge'
import { UpgradeBanner } from './UpgradeBanner'
import { PlanLimitIndicator } from './PlanLimitIndicator'
import { ChannelSearchBar } from './ChannelSearchBar'
import type { Competitor } from '@/types'
import type { PlanLimits } from '@/lib/plan-limits'

interface CompetitorsTableProps {
  competitors: Competitor[]
  user: {
    id: string
    subscription_plan: string | null
    sub_niche: string | null
    niche_id: string | null
  }
  planLimits: PlanLimits
  lockedUntil?: string | null
  lockedChannelName?: string | null
}

type FilterType = 'all' | 'tier1' | 'tier2' | 'dominator'

function fmt(n: number | null | undefined): string {
  if (n == null) return '—'
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return String(n)
}

function timeAgo(iso: string | null | undefined): string {
  if (!iso) return 'never'
  const diff = Date.now() - new Date(iso).getTime()
  const hours = Math.floor(diff / 3_600_000)
  if (hours < 1) return 'just now'
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return days === 1 ? '1d ago' : `${days}d ago`
}

export function CompetitorsTable({ competitors, user, planLimits, lockedUntil, lockedChannelName }: CompetitorsTableProps) {
  const [filter, setFilter] = useState<FilterType>('all')

  const counts = useMemo(() => ({
    all: competitors.length,
    tier1: competitors.filter(c => c.tier === 1 && !c.is_dominator).length,
    tier2: competitors.filter(c => c.tier === 2 && !c.is_dominator).length,
    dominator: competitors.filter(c => c.is_dominator).length,
  }), [competitors])

  const filtered = useMemo(() => {
    if (filter === 'all') return competitors
    if (filter === 'dominator') return competitors.filter(c => c.is_dominator)
    if (filter === 'tier1') return competitors.filter(c => c.tier === 1 && !c.is_dominator)
    if (filter === 'tier2') return competitors.filter(c => c.tier === 2 && !c.is_dominator)
    return competitors
  }, [competitors, filter])

  return (
    <div style={{
      minHeight: '100vh',
      background: '#000000',
      color: '#ffffff',
      padding: '28px 32px',
      maxWidth: 960,
    }}>

      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <h1 style={{
          fontSize: 32,
          fontFamily: 'Georgia, serif',
          fontStyle: 'italic',
          fontWeight: 400,
          margin: '0 0 6px',
          letterSpacing: '-0.02em',
          color: '#ffffff',
        }}>
          Competitors
        </h1>
        <PlanLimitIndicator
          current={competitors.length}
          max={planLimits.totalCompetitors}
          plan={user.subscription_plan ?? 'free'}
        />
      </div>

      {/* Search section */}
      {!planLimits.canUseSearch ? (
        <UpgradeBanner
          feature="Search & Compare Any YouTuber"
          description="Upgrade to Starter or Pro to search and compare your channel against any YouTuber on YouTube."
        />
      ) : (
        <ChannelSearchBar
          planLimits={planLimits}
          plan={user.subscription_plan}
          lockedUntil={lockedUntil}
          lockedChannelName={lockedChannelName}
        />
      )}

      {/* Filter tabs */}
      <div style={{
        display: 'flex',
        gap: 0,
        borderBottom: '1px solid #1a1a1a',
        marginBottom: 20,
      }}>
        {([
          { key: 'all', label: `All (${counts.all})` },
          { key: 'tier1', label: `Tier 1 (${counts.tier1})` },
          { key: 'tier2', label: `Tier 2 (${counts.tier2})` },
          { key: 'dominator', label: `Dominator (${counts.dominator})` },
        ] as const).map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setFilter(key)}
            style={{
              padding: '8px 16px',
              fontSize: 12,
              fontFamily: 'monospace',
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              color: filter === key ? '#ffffff' : '#555555',
              borderBottom: filter === key ? '2px solid #ffffff' : '2px solid transparent',
              marginBottom: -1,
              transition: 'color 0.15s',
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Table */}
      {filtered.length === 0 ? (
        <EmptyState filter={filter} />
      ) : (
        <div style={{
          background: '#0a0a0a',
          border: '1px solid #1a1a1a',
          borderRadius: 8,
          overflow: 'hidden',
        }}>
          {/* Table header */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: '1fr 100px 160px 140px 120px',
            gap: 16,
            padding: '10px 20px',
            borderBottom: '1px solid #111111',
            background: '#080808',
          }}>
            {['Channel', 'Subs', 'Tier', 'Match', 'Synced'].map(h => (
              <span key={h} style={{
                fontSize: 10,
                fontWeight: 600,
                color: '#444444',
                fontFamily: 'monospace',
                letterSpacing: '0.12em',
                textTransform: 'uppercase',
              }}>
                {h}
              </span>
            ))}
          </div>

          {/* Rows */}
          {filtered.map((comp) => (
            <CompetitorRow key={comp.id} competitor={comp} />
          ))}
        </div>
      )}
    </div>
  )
}

function CompetitorRow({ competitor }: { competitor: Competitor }) {
  const router = useRouter()
  const matchScore = competitor.sub_niche_match_score
  const matchLabel =
    matchScore == null
      ? { text: '—', color: '#444444' }
      : matchScore >= 0.7
      ? { text: '✓ Good match', color: '#4ade80' }
      : matchScore >= 0.4
      ? { text: '~ Moderate', color: '#fbbf24' }
      : { text: '○ Different', color: '#555555' }

  return (
    <div
      onClick={() => router.push(`/competitors/${competitor.id}`)}
      style={{
        display: 'grid',
        gridTemplateColumns: '1fr 100px 160px 140px 120px',
        gap: 16,
        padding: '14px 20px',
        borderBottom: '1px solid #111111',
        alignItems: 'center',
        cursor: 'pointer',
        transition: 'background 0.1s',
      }}
      onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.background = '#0a0a0a' }}
      onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.background = 'transparent' }}
    >
      {/* Channel */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
        {competitor.channel_thumbnail ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={competitor.channel_thumbnail}
            alt={competitor.channel_name ?? ''}
            width={36}
            height={36}
            style={{ borderRadius: '50%', flexShrink: 0 }}
          />
        ) : (
          <div style={{
            width: 36,
            height: 36,
            borderRadius: '50%',
            background: '#1a1a1a',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 13,
            fontWeight: 700,
            color: '#555555',
            flexShrink: 0,
          }}>
            {competitor.channel_name?.[0]?.toUpperCase() ?? '?'}
          </div>
        )}
        <div style={{ minWidth: 0 }}>
          <div style={{
            color: '#ffffff',
            fontSize: 13,
            fontWeight: 500,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}>
            {competitor.channel_name ?? competitor.youtube_channel_id}
          </div>
          {competitor.sub_niche && (
            <div style={{ color: '#444444', fontSize: 11, marginTop: 2, fontFamily: 'monospace' }}>
              {competitor.sub_niche}
            </div>
          )}
        </div>
      </div>

      {/* Subs */}
      <span style={{ color: '#aaaaaa', fontSize: 13, fontFamily: 'monospace' }}>
        {fmt(competitor.subscriber_count)}
      </span>

      {/* Tier */}
      <TierBadge tier={competitor.tier} isDominator={competitor.is_dominator} />

      {/* Match */}
      <span style={{ fontSize: 11, fontFamily: 'monospace', color: matchLabel.color }}>
        {matchLabel.text}
      </span>

      {/* Synced */}
      <span style={{ fontSize: 11, fontFamily: 'monospace', color: '#444444' }}>
        {timeAgo(competitor.last_synced_at)}
      </span>
    </div>
  )
}

function EmptyState({ filter }: { filter: FilterType }) {
  const label =
    filter === 'tier1' ? 'Tier 1' :
    filter === 'tier2' ? 'Tier 2' :
    filter === 'dominator' ? 'Dominator' :
    null

  return (
    <div style={{
      padding: '48px 24px',
      textAlign: 'center',
      background: '#0a0a0a',
      border: '1px dashed #1a1a1a',
      borderRadius: 8,
    }}>
      <p style={{ color: '#ffffff', fontSize: 13, fontWeight: 600, margin: '0 0 6px' }}>
        {label ? `No ${label} competitors yet` : 'No competitors tracked yet'}
      </p>
      <p style={{ color: '#555555', fontSize: 12, margin: 0, lineHeight: 1.6 }}>
        Competitors are auto-detected based on your niche and subscriber count.
      </p>
    </div>
  )
}
