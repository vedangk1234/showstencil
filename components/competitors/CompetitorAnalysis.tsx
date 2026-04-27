'use client'

import { useState } from 'react'
import Link from 'next/link'
import { TierBadge } from './TierBadge'
import { OverviewTab } from './tabs/OverviewTab'
import { ContentTab } from './tabs/ContentTab'
import { GrowthTab } from './tabs/GrowthTab'
import { VideosTab } from './tabs/VideosTab'
import { InsightsTab } from './tabs/InsightsTab'

type TabType = 'overview' | 'content' | 'growth' | 'videos' | 'insights'

interface UserVideoRow {
  duration_seconds: number | null
  published_at: string | null
  view_count: number | null
}

interface CompetitorSnapshotRow {
  snapshot_date: string
  subscriber_count: number | null
}

interface CompetitorAnalysisProps {
  user: Record<string, unknown>
  userSnapshot: Record<string, unknown> | null
  userSnapshots: Record<string, unknown>[]
  userVideos: UserVideoRow[]
  competitor: Record<string, unknown>
  competitorVideos: Record<string, unknown>[]
  competitorSnapshots: CompetitorSnapshotRow[]
}

function fmt(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return String(n)
}

const TABS: { key: TabType; label: string }[] = [
  { key: 'overview', label: 'Overview' },
  { key: 'content', label: 'Content' },
  { key: 'growth', label: 'Growth' },
  { key: 'videos', label: 'Recent Videos' },
  { key: 'insights', label: 'AI Insights' },
]

export function CompetitorAnalysis({
  user,
  userSnapshot,
  userSnapshots,
  userVideos,
  competitor,
  competitorVideos,
  competitorSnapshots,
}: CompetitorAnalysisProps) {
  const [activeTab, setActiveTab] = useState<TabType>('overview')

  const matchScore = competitor.sub_niche_match_score as number | null
  const matchLabel =
    matchScore == null
      ? null
      : matchScore >= 0.7
      ? { text: 'Good match', color: '#4ade80', bg: '#0a2018', border: '#1d5e3a' }
      : matchScore >= 0.4
      ? { text: 'Moderate match', color: '#fbbf24', bg: '#1a1200', border: '#3d2e00' }
      : { text: 'Different focus', color: '#555555', bg: '#111111', border: '#1a1a1a' }

  return (
    <div
      style={{
        minHeight: '100vh',
        background: '#000000',
        color: '#ffffff',
        padding: '28px 32px',
        maxWidth: 960,
      }}
    >
      {/* Back link */}
      <Link
        href="/competitors"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          color: '#555555',
          fontSize: 13,
          textDecoration: 'none',
          marginBottom: 28,
          fontFamily: 'monospace',
          transition: 'color 0.15s',
        }}
      >
        ← Back to Competitors
      </Link>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 20, marginBottom: 32 }}>
        {competitor.channel_thumbnail ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={competitor.channel_thumbnail as string}
            alt={competitor.channel_name as string}
            width={72}
            height={72}
            style={{ borderRadius: '50%', flexShrink: 0 }}
          />
        ) : (
          <div
            style={{
              width: 72,
              height: 72,
              borderRadius: '50%',
              background: '#1a1a1a',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 28,
              fontWeight: 700,
              color: '#555555',
              flexShrink: 0,
            }}
          >
            {(competitor.channel_name as string)?.[0]?.toUpperCase() ?? '?'}
          </div>
        )}

        <div>
          <h1
            style={{
              fontSize: 28,
              fontFamily: 'Georgia, serif',
              fontStyle: 'italic',
              fontWeight: 400,
              margin: '0 0 8px',
              letterSpacing: '-0.02em',
              color: '#ffffff',
            }}
          >
            {competitor.channel_name as string}
          </h1>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
            <span style={{ color: '#888888', fontSize: 13, fontFamily: 'monospace' }}>
              {fmt((competitor.subscriber_count as number) || 0)} subscribers
            </span>
            <TierBadge
              tier={(competitor.tier as number) ?? null}
              isDominator={(competitor.is_dominator as boolean) ?? false}
            />
          </div>
          {(competitor.sub_niche as string | null) && matchLabel && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ color: '#555555', fontSize: 12, fontFamily: 'monospace' }}>
                {competitor.sub_niche as string}
              </span>
              <span
                style={{
                  fontSize: 9,
                  fontFamily: 'monospace',
                  letterSpacing: '0.05em',
                  color: matchLabel.color,
                  background: matchLabel.bg,
                  border: `1px solid ${matchLabel.border}`,
                  borderRadius: 3,
                  padding: '2px 6px',
                }}
              >
                {matchLabel.text}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div
        style={{
          display: 'flex',
          gap: 0,
          borderBottom: '1px solid #1a1a1a',
          marginBottom: 28,
        }}
      >
        {TABS.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setActiveTab(key)}
            style={{
              padding: '8px 16px',
              fontSize: 12,
              fontFamily: 'monospace',
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              color: activeTab === key ? '#ffffff' : '#555555',
              borderBottom: activeTab === key ? '2px solid #ffffff' : '2px solid transparent',
              marginBottom: -1,
              transition: 'color 0.15s',
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div style={{ paddingBottom: 48 }}>
        {activeTab === 'overview' && (
          <OverviewTab
            user={user}
            userSnapshot={userSnapshot}
            userVideos={userVideos}
            competitor={competitor}
            competitorVideos={competitorVideos}
          />
        )}
        {activeTab === 'content' && (
          <ContentTab
            competitor={competitor}
            competitorVideos={competitorVideos}
            userVideos={userVideos}
            nicheId={(user.niche_id as string) || null}
          />
        )}
        {activeTab === 'growth' && (
          <GrowthTab
            userSnapshots={userSnapshots}
            competitor={competitor}
            competitorSnapshots={competitorSnapshots}
          />
        )}
        {activeTab === 'videos' && <VideosTab competitorVideos={competitorVideos} />}
        {activeTab === 'insights' && <InsightsTab user={user} competitor={competitor} />}
      </div>
    </div>
  )
}
