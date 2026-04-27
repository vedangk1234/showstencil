'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import type { PlanLimits } from '@/lib/plan-limits'

interface SearchedChannelPreview {
  channel_id: string
  channel_name: string
  channel_thumbnail: string
  subscriber_count: number
  sub_niche: string | null
  tier: 1 | 2 | 3
}

interface ChannelSearchBarProps {
  planLimits: PlanLimits
  plan: string | null
  lockedUntil?: string | null   // ISO date — if set, manual slot is locked
  lockedChannelName?: string | null
}

function fmt(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return String(n)
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  })
}

export function ChannelSearchBar({ planLimits, plan, lockedUntil, lockedChannelName }: ChannelSearchBarProps) {
  const router = useRouter()
  const [query, setQuery] = useState('')
  const [searching, setSearching] = useState(false)
  const [tracking, setTracking] = useState(false)
  const [result, setResult] = useState<SearchedChannelPreview | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [tracked, setTracked] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)

  const isLocked = !!lockedUntil && new Date(lockedUntil) > new Date()

  async function handleSearch(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!query.trim()) return

    setSearching(true)
    setError(null)
    setResult(null)
    setTracked(false)

    try {
      const res = await fetch('/api/competitors/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ input: query.trim() }),
      })

      const data = await res.json()

      if (!res.ok) {
        setError(data.message || data.error || 'Search failed')
        return
      }

      setResult({
        channel_id: data.channel.channel_id,
        channel_name: data.channel.channel_name,
        channel_thumbnail: data.channel.channel_thumbnail,
        subscriber_count: data.channel.subscriber_count,
        sub_niche: data.channel.sub_niche,
        tier: data.comparison.tier,
      })
    } catch {
      setError('Search failed. Please try again.')
    } finally {
      setSearching(false)
    }
  }

  async function confirmTrack() {
    if (!result) return
    setShowConfirm(false)
    setTracking(true)
    setError(null)

    try {
      const res = await fetch('/api/competitors/track', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channel_id: result.channel_id }),
      })

      const data = await res.json()

      if (!res.ok) {
        setError(data.message || data.error || 'Failed to track channel')
        return
      }

      setTracked(true)
      if (data.competitor?.id) {
        setTimeout(() => router.push(`/competitors/${data.competitor.id}`), 800)
      } else {
        router.refresh()
      }
    } catch {
      setError('Failed to track channel.')
    } finally {
      setTracking(false)
    }
  }

  const tierLabel =
    result?.tier === 3
      ? 'Dominator'
      : result?.tier === 2
      ? 'Tier 2 · Aspirational'
      : 'Tier 1 · Similar'

  const tierColor =
    result?.tier === 3 ? '#fbbf24' : result?.tier === 2 ? '#a78bfa' : '#60a5fa'

  const unlockDateFormatted = lockedUntil ? fmtDate(lockedUntil) : null
  const addDateFormatted = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  })

  return (
    <>
      <div
        style={{
          marginBottom: 24,
          padding: '16px 20px',
          background: '#0a0a0a',
          border: '1px solid #1a1a1a',
          borderRadius: 8,
        }}
      >
        <div style={{ marginBottom: 12 }}>
          <span style={{ fontSize: 11, color: '#555555', fontFamily: 'monospace' }}>
            {plan === 'pro'
              ? 'Search any YouTube channel · Unlimited'
              : `Search any YouTube channel · ${planLimits.searchesPerMonth} search/month`}
          </span>
        </div>

        {/* Locked slot warning */}
        {isLocked && (
          <div style={{ marginBottom: 12, padding: '10px 14px', background: '#1a1200', border: '1px solid #3d2e00', borderRadius: 6, fontSize: 12, color: '#fbbf24', fontFamily: 'monospace' }}>
            Your manual slot is locked until {unlockDateFormatted}.
            {lockedChannelName && <> ({lockedChannelName})</>}
            {' '}You cannot add another channel until then.
          </div>
        )}

        <form onSubmit={handleSearch} style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="@handle, youtube.com/channel/... or channel name"
            disabled={searching || isLocked}
            style={{
              flex: 1,
              padding: '8px 12px',
              background: '#111111',
              border: '1px solid #1a1a1a',
              borderRadius: 6,
              color: '#ffffff',
              fontSize: 13,
              fontFamily: 'monospace',
              outline: 'none',
              opacity: isLocked ? 0.5 : 1,
            }}
          />
          <button
            type="submit"
            disabled={searching || !query.trim() || isLocked}
            style={{
              padding: '8px 16px',
              background: searching ? '#111111' : '#1a1a1a',
              border: '1px solid #333333',
              borderRadius: 6,
              color: searching ? '#555555' : '#ffffff',
              fontSize: 12,
              fontFamily: 'monospace',
              cursor: searching || !query.trim() || isLocked ? 'not-allowed' : 'pointer',
              whiteSpace: 'nowrap',
            }}
          >
            {searching ? 'Searching…' : 'Search'}
          </button>
        </form>

        {error && (
          <p style={{ color: '#f87171', fontSize: 12, fontFamily: 'monospace', margin: '8px 0 0' }}>
            {error}
          </p>
        )}

        {result && !error && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              padding: '12px',
              background: '#111111',
              border: '1px solid #1a1a1a',
              borderRadius: 6,
            }}
          >
            {result.channel_thumbnail ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={result.channel_thumbnail}
                alt={result.channel_name}
                width={40}
                height={40}
                style={{ borderRadius: '50%', flexShrink: 0 }}
              />
            ) : (
              <div
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: '50%',
                  background: '#1a1a1a',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 16,
                  color: '#555555',
                  flexShrink: 0,
                }}
              >
                {result.channel_name[0]}
              </div>
            )}

            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ color: '#ffffff', fontSize: 13, fontWeight: 500 }}>
                {result.channel_name}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 3 }}>
                <span style={{ color: '#888888', fontSize: 11, fontFamily: 'monospace' }}>
                  {fmt(result.subscriber_count)} subs
                </span>
                <span style={{ color: tierColor, fontSize: 10, fontFamily: 'monospace' }}>
                  {tierLabel}
                </span>
                {result.sub_niche && (
                  <span style={{ color: '#444444', fontSize: 11, fontFamily: 'monospace' }}>
                    {result.sub_niche}
                  </span>
                )}
              </div>
            </div>

            <button
              onClick={() => setShowConfirm(true)}
              disabled={tracking || tracked || isLocked}
              style={{
                padding: '6px 14px',
                background: tracked ? '#0a2018' : '#ffffff',
                border: tracked ? '1px solid #1d5e3a' : 'none',
                borderRadius: 5,
                color: tracked ? '#4ade80' : '#000000',
                fontSize: 12,
                fontFamily: 'monospace',
                fontWeight: 600,
                cursor: tracking || tracked || isLocked ? 'not-allowed' : 'pointer',
                flexShrink: 0,
              }}
            >
              {tracked ? '✓ Tracking' : tracking ? 'Adding…' : '+ Track'}
            </button>
          </div>
        )}
      </div>

      {/* Confirmation modal */}
      {showConfirm && result && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.75)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 50,
          }}
        >
          <div
            style={{
              background: '#0a0a0a',
              border: '1px solid #1a1a1a',
              borderRadius: 10,
              padding: '28px 32px',
              maxWidth: 440,
              width: '100%',
            }}
          >
            <h2 style={{ fontSize: 18, fontWeight: 600, margin: '0 0 12px', color: '#ffffff' }}>
              Add {result.channel_name}?
            </h2>
            <p style={{ fontSize: 13, color: '#888888', margin: '0 0 8px', lineHeight: 1.5 }}>
              You&apos;re about to add this as your manual competitor.
            </p>
            <p style={{ fontSize: 13, color: '#fbbf24', margin: '0 0 24px', lineHeight: 1.5, fontFamily: 'monospace' }}>
              You can replace this competitor on {addDateFormatted}.
              Until then, this slot is locked.
            </p>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button
                onClick={() => setShowConfirm(false)}
                style={{
                  padding: '8px 18px',
                  background: 'transparent',
                  border: '1px solid #333333',
                  borderRadius: 6,
                  color: '#888888',
                  fontSize: 13,
                  fontFamily: 'monospace',
                  cursor: 'pointer',
                }}
              >
                Cancel
              </button>
              <button
                onClick={confirmTrack}
                style={{
                  padding: '8px 18px',
                  background: '#ffffff',
                  border: 'none',
                  borderRadius: 6,
                  color: '#000000',
                  fontSize: 13,
                  fontFamily: 'monospace',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                Confirm and Add
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
