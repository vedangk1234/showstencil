'use client'

import { useState, useEffect } from 'react'

interface InsightsTabProps {
  user: Record<string, unknown>
  competitor: Record<string, unknown>
}

interface Insight {
  type: 'observation' | 'recommendation' | 'strength' | 'gap'
  title: string
  description: string
  priority: 'high' | 'medium' | 'low'
}

const TYPE_STYLES: Record<string, { label: string; color: string; bg: string; border: string }> = {
  observation: { label: 'OBSERVATION', color: '#60a5fa', bg: '#0a1628', border: '#1d3a6e' },
  recommendation: { label: 'RECOMMENDATION', color: '#4ade80', bg: '#0a2018', border: '#1d5e3a' },
  strength: { label: 'STRENGTH', color: '#a78bfa', bg: '#120a28', border: '#3a1d6e' },
  gap: { label: 'GAP', color: '#f87171', bg: '#280a0a', border: '#6e1d1d' },
}

const PRIORITY_ORDER = { high: 0, medium: 1, low: 2 }

export function InsightsTab({ competitor }: InsightsTabProps) {
  const [insights, setInsights] = useState<Insight[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [retryable, setRetryable] = useState(false)
  const [cached, setCached] = useState(false)
  const [generatedAt, setGeneratedAt] = useState<string | null>(null)
  const [autoRetried, setAutoRetried] = useState(false)

  async function fetchInsights(forceRegenerate = false) {
    setLoading(true)
    setError(null)
    setRetryable(false)
    try {
      const res = await fetch('/api/competitors/insights', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ competitor_id: competitor.id, force_regenerate: forceRegenerate }),
      })

      if (res.status === 422 || res.status === 500) {
        const data = await res.json()
        const isRetryable = data.retryable ?? res.status === 422
        setError(data.error || 'Not enough data yet.')
        setRetryable(isRetryable)
        return
      }

      if (!res.ok) {
        const data = await res.json()
        setError(data.error || 'Failed to load insights')
        return
      }

      const data = await res.json()
      const sorted = (data.insights || []).sort(
        (a: Insight, b: Insight) =>
          (PRIORITY_ORDER[a.priority] ?? 2) - (PRIORITY_ORDER[b.priority] ?? 2),
      )
      setInsights(sorted)
      setCached(data.cached ?? false)
      setGeneratedAt(data.generated_at ?? null)
    } catch {
      setError('Failed to generate insights')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchInsights()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [competitor.id])

  // Auto-retry once after 5s when retryable (e.g. data still being fetched after track, or Claude generation failed)
  useEffect(() => {
    if (!retryable || autoRetried) return
    const timer = setTimeout(() => {
      setAutoRetried(true)
      fetchInsights()
    }, 5000)
    return () => clearTimeout(timer)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [retryable, autoRetried])

  if (loading) {
    return (
      <div style={{ padding: '48px 0', textAlign: 'center' }}>
        <div
          style={{
            display: 'inline-block',
            width: 24,
            height: 24,
            border: '2px solid #1a1a1a',
            borderTopColor: '#4ade80',
            borderRadius: '50%',
            animation: 'spin 0.8s linear infinite',
            marginBottom: 12,
          }}
        />
        <p style={{ color: '#555555', fontSize: 13, margin: 0 }}>
          {cached ? 'Loading insights…' : `Generating AI insights for ${competitor.channel_name as string}…`}
        </p>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    )
  }

  if (error) {
    if (retryable) {
      return (
        <div style={{ padding: '48px 24px', textAlign: 'center', background: '#0a0a0a', border: '1px dashed #1a1a1a', borderRadius: 8 }}>
          <p style={{ color: '#888888', fontSize: 13, margin: '0 0 8px' }}>
            Gathering data for this channel…
          </p>
          <p style={{ color: '#555555', fontSize: 12, margin: '0 0 16px', lineHeight: 1.6 }}>
            Insights will be available once video data has been fetched.
            This usually takes less than a minute after adding a competitor.
          </p>
          <button
            onClick={() => fetchInsights()}
            style={{
              fontSize: 12,
              fontFamily: 'monospace',
              color: '#60a5fa',
              background: 'transparent',
              border: '1px solid #1d3a6e',
              borderRadius: 4,
              padding: '6px 14px',
              cursor: 'pointer',
            }}
          >
            Try again
          </button>
        </div>
      )
    }
    return (
      <div style={{ padding: '32px 20px', background: '#0a0a0a', border: '1px solid #1a1a1a', borderRadius: 8, textAlign: 'center' }}>
        <p style={{ color: '#f87171', fontSize: 13, margin: '0 0 12px' }}>
          Could not generate insights right now.
        </p>
        <p style={{ color: '#555555', fontSize: 12, margin: '0 0 16px', lineHeight: 1.6 }}>
          This usually happens when there isn&apos;t enough competitor data yet,
          or when the AI service is temporarily unavailable.
        </p>
        <button
          onClick={() => fetchInsights()}
          style={{
            background: '#1a1a1a',
            border: '1px solid #333333',
            color: '#ffffff',
            padding: '8px 20px',
            borderRadius: 6,
            fontSize: 13,
            cursor: 'pointer',
          }}
        >
          Try again
        </button>
      </div>
    )
  }

  if (insights.length === 0) {
    return (
      <div style={{ padding: '48px 24px', textAlign: 'center', background: '#0a0a0a', border: '1px dashed #1a1a1a', borderRadius: 8 }}>
        <p style={{ color: '#888888', fontSize: 13, margin: 0 }}>
          No insights available. Add more competitor video data first.
        </p>
      </div>
    )
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <p style={{ color: '#555555', fontSize: 12, margin: 0, fontFamily: 'monospace' }}>
          AI analysis comparing you to {competitor.channel_name as string}
          {cached && generatedAt && (
            <span style={{ marginLeft: 8, color: '#333333' }}>
              · cached {new Date(generatedAt).toLocaleDateString()}
            </span>
          )}
        </p>
        <button
          onClick={() => fetchInsights(true)}
          style={{
            fontSize: 11,
            fontFamily: 'monospace',
            color: '#444444',
            background: 'transparent',
            border: '1px solid #222222',
            borderRadius: 4,
            padding: '3px 8px',
            cursor: 'pointer',
          }}
        >
          Regenerate
        </button>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {insights.map((insight, i) => {
          const style = TYPE_STYLES[insight.type] || TYPE_STYLES.observation
          const isPriHigh = insight.priority === 'high'

          return (
            <div
              key={i}
              style={{
                padding: '16px 20px',
                background: '#0a0a0a',
                border: `1px solid ${isPriHigh ? style.border : '#1a1a1a'}`,
                borderRadius: 8,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <span
                  style={{
                    fontSize: 9,
                    fontWeight: 600,
                    fontFamily: 'monospace',
                    letterSpacing: '0.1em',
                    color: style.color,
                    background: style.bg,
                    border: `1px solid ${style.border}`,
                    borderRadius: 3,
                    padding: '2px 6px',
                  }}
                >
                  {style.label}
                </span>
                {isPriHigh && (
                  <span style={{ fontSize: 9, fontFamily: 'monospace', color: '#fbbf24', letterSpacing: '0.1em' }}>
                    HIGH PRIORITY
                  </span>
                )}
              </div>
              <div style={{ fontSize: 14, fontWeight: 600, color: '#ffffff', marginBottom: 6, lineHeight: 1.3 }}>
                {insight.title}
              </div>
              <div style={{ fontSize: 13, color: '#888888', lineHeight: 1.6 }}>
                {insight.description}
              </div>
            </div>
          )
        })}
      </div>

      <p style={{ fontSize: 11, color: '#333333', marginTop: 16, fontFamily: 'monospace' }}>
        Generated by Claude · Based on publicly available data
      </p>
    </div>
  )
}
