'use client'

import { useState, useEffect, useCallback } from 'react'
import type { Idea } from '@/types'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function relativeTime(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime()
  const minutes = Math.floor(ms / 60000)
  const hours = Math.floor(ms / 3600000)
  const days = Math.floor(ms / 86400000)
  if (minutes < 2) return 'just now'
  if (minutes < 60) return `${minutes} minutes ago`
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`
  return `${days} day${days === 1 ? '' : 's'} ago`
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function scoreColor(score: number): string {
  if (score >= 80) return '#4ade80'
  if (score >= 50) return '#fbbf24'
  return '#94a3b8'
}

function scoreBg(score: number): string {
  if (score >= 80) return '#0a2018'
  if (score >= 50) return '#1a1200'
  return '#0f172a'
}

function scoreBorder(score: number): string {
  if (score >= 80) return '#1d5e3a'
  if (score >= 50) return '#42300a'
  return '#1e293b'
}

function scoreLabel(score: number): string {
  if (score >= 80) return `High opportunity ${score}`
  if (score >= 50) return `Medium opportunity ${score}`
  return `Lower opportunity ${score}`
}

// Split a text string into bullet-point sentences.
// Tries newline split first, falls back to sentence boundaries.
function parseBullets(text: string | null | undefined): string[] {
  if (!text) return []
  const lines = text.split('\n').map(s => s.trim().replace(/^[-•*·]\s*/, '')).filter(s => s.length > 0)
  if (lines.length > 1) return lines
  const sentences = text.match(/[^.!?]+[.!?]*/g) ?? [text]
  return sentences.map(s => s.trim()).filter(s => s.length > 0)
}

// ─── Loading stages ───────────────────────────────────────────────────────────

const STAGES = [
  'Gathering competitor intelligence',
  'Analysing your top performing videos',
  'Generating ideas',
]

// ─── Section label ─────────────────────────────────────────────────────────────

const sectionLabelStyle: React.CSSProperties = {
  color: '#444444',
  fontSize: 10,
  fontWeight: 700,
  letterSpacing: '0.12em',
  textTransform: 'uppercase',
  margin: '0 0 6px',
  fontFamily: 'monospace',
}

// ─── Bullet list ──────────────────────────────────────────────────────────────

function BulletList({ items }: { items: string[] }) {
  return (
    <ul style={{ margin: 0, padding: 0, listStyle: 'none' }}>
      {items.map((item, i) => (
        <li key={i} style={{ display: 'flex', gap: 8, color: '#999999', fontSize: 13, lineHeight: 1.65, marginBottom: i < items.length - 1 ? 4 : 0 }}>
          <span style={{ color: '#444444', flexShrink: 0 }}>—</span>
          <span>{item}</span>
        </li>
      ))}
    </ul>
  )
}

// ─── Expanded section ─────────────────────────────────────────────────────────

function ExpandedSection({ label, text, asProse }: { label: string; text: string | null | undefined; asProse?: boolean }) {
  if (!text) return null
  return (
    <div style={{ marginTop: 14 }}>
      <p style={sectionLabelStyle}>{label}</p>
      {asProse ? (
        <p style={{ color: '#999999', fontSize: 13, lineHeight: 1.65, margin: 0 }}>{text}</p>
      ) : (
        <BulletList items={parseBullets(text)} />
      )}
    </div>
  )
}

// ─── Idea card ────────────────────────────────────────────────────────────────

function IdeaCard({
  idea,
  isExpanded,
  onToggle,
  onPlan,
  onMade,
  isDone,
}: {
  idea: Idea
  isExpanded: boolean
  onToggle: () => void
  onPlan: (id: string) => Promise<void>
  onMade: (id: string) => Promise<void>
  isDone?: boolean
}) {
  const [planning, setPlanning] = useState(false)
  const [making, setMaking] = useState(false)

  async function handlePlan() {
    setPlanning(true)
    try { await onPlan(idea.id) } finally { setPlanning(false) }
  }

  async function handleMade() {
    setMaking(true)
    try { await onMade(idea.id) } finally { setMaking(false) }
  }

  const actionButtons = !isDone ? (
    <div style={{ display: 'flex', gap: 8 }}>
      {!idea.planned_at && (
        <button
          onClick={handlePlan}
          disabled={planning}
          style={{
            fontSize: 12, color: planning ? '#444444' : '#60a5fa',
            background: 'transparent', border: '1px solid #1d3a6e',
            borderRadius: 5, padding: '6px 14px',
            cursor: planning ? 'default' : 'pointer', fontFamily: 'monospace',
          }}
        >
          {planning ? 'Saving…' : 'Mark as planned'}
        </button>
      )}
      {!idea.made_at && (
        <button
          onClick={handleMade}
          disabled={making}
          style={{
            fontSize: 12, color: making ? '#444444' : '#4ade80',
            background: 'transparent', border: '1px solid #1d5e3a',
            borderRadius: 5, padding: '6px 14px',
            cursor: making ? 'default' : 'pointer', fontFamily: 'monospace',
          }}
        >
          {making ? 'Saving…' : 'Mark as made'}
        </button>
      )}
    </div>
  ) : null

  const toggleBtn = (label: string) => (
    <button
      onClick={onToggle}
      style={{
        background: 'transparent', border: 'none', cursor: 'pointer',
        color: '#555555', fontSize: 11, display: 'inline-flex',
        alignItems: 'center', gap: 4, fontFamily: 'monospace', padding: 0,
      }}
    >
      {label}
    </button>
  )

  return (
    <div style={{
      background: isDone ? '#080808' : '#0a0a0a',
      border: `1px solid ${isDone ? '#111111' : isExpanded ? '#2a2a2a' : '#1a1a1a'}`,
      borderRadius: 10,
      opacity: isDone ? 0.55 : 1,
    }}>
      {/* ── Always-visible collapsed header ── */}
      <div style={{ padding: '14px 18px' }}>
        {/* Badges row */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <span style={{
              fontSize: 11, fontWeight: 700, color: scoreColor(idea.opportunity_score),
              background: scoreBg(idea.opportunity_score), border: `1px solid ${scoreBorder(idea.opportunity_score)}`,
              borderRadius: 4, padding: '3px 9px', whiteSpace: 'nowrap',
            }}>
              {scoreLabel(idea.opportunity_score)}
            </span>
            <span style={{
              fontSize: 11, color: '#555555', background: '#111111',
              border: '1px solid #1a1a1a', borderRadius: 4, padding: '3px 9px', whiteSpace: 'nowrap',
            }}>
              {idea.suggested_duration_min}–{idea.suggested_duration_max} min
            </span>
            {idea.planned_at && (
              <span style={{ fontSize: 10, color: '#60a5fa', background: '#0a1628', border: '1px solid #1d3a6e', borderRadius: 4, padding: '3px 9px', fontFamily: 'monospace' }}>
                PLANNED
              </span>
            )}
            {idea.made_at && (
              <span style={{ fontSize: 10, color: '#4ade80', background: '#0a2018', border: '1px solid #1d5e3a', borderRadius: 4, padding: '3px 9px', fontFamily: 'monospace' }}>
                MADE · {formatDate(idea.made_at)}
              </span>
            )}
          </div>
        </div>

        {/* Title */}
        <h3 style={{ color: '#ffffff', fontSize: 15, fontWeight: 700, lineHeight: 1.35, margin: '0 0 6px', letterSpacing: '-0.2px' }}>
          {idea.title}
        </h3>

        {/* Why now — 1-line truncated */}
        <p style={{
          color: '#666666', fontSize: 12, fontStyle: 'italic', lineHeight: 1.6, margin: 0,
          overflow: 'hidden', display: '-webkit-box',
          WebkitLineClamp: 1, WebkitBoxOrient: 'vertical',
        }}>
          {idea.why_now}
        </p>

        {/* Footer: action buttons (collapsed only) + expand toggle */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 12 }}>
          {!isExpanded ? actionButtons ?? <div /> : <div />}
          {!isExpanded && toggleBtn('See full brief ▼')}
        </div>
      </div>

      {/* ── Expanded content ── */}
      {isExpanded && (
        <div style={{ padding: '0 18px 14px', borderTop: '1px solid #1a1a1a' }}>
          <ExpandedSection label="Thumbnail brief" text={idea.thumbnail_description} />
          <ExpandedSection label="Content brief" text={idea.content_brief} />
          <ExpandedSection label="Duration logic" text={idea.duration_reasoning} asProse />
          {idea.topic_source && (
            <ExpandedSection label="Why we suggested this" text={idea.topic_source} />
          )}
          {actionButtons && (
            <div style={{ marginTop: 18 }}>{actionButtons}</div>
          )}
          <div style={{ marginTop: 12, textAlign: 'right' }}>
            {toggleBtn('Collapse ▲')}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Loading state ────────────────────────────────────────────────────────────

function LoadingState({ staleIdeas }: { staleIdeas: Idea[] }) {
  const [stageIndex, setStageIndex] = useState(0)

  useEffect(() => {
    const timers = [
      setTimeout(() => setStageIndex(1), 8000),
      setTimeout(() => setStageIndex(2), 18000),
    ]
    return () => timers.forEach(clearTimeout)
  }, [])

  return (
    <div>
      <div style={{
        background: '#0a0a0a', border: '1px solid #1a1a1a', borderRadius: 10,
        padding: '36px 28px', textAlign: 'center',
        marginBottom: staleIdeas.length > 0 ? 24 : 0,
      }}>
        <div style={{
          width: 28, height: 28, border: '2px solid #1a1a1a', borderTopColor: '#4ade80',
          borderRadius: '50%', animation: 'spin 0.8s linear infinite',
          margin: '0 auto 16px', display: 'inline-block',
        }} />
        <h2 style={{ color: '#ffffff', fontSize: 16, fontWeight: 700, margin: '0 0 6px' }}>
          Building your video ideas
        </h2>
        <p style={{ color: '#555555', fontSize: 13, margin: '0 0 24px', lineHeight: 1.6 }}>
          Analysing your top videos and what&apos;s working for your competitors. This takes about 30 seconds.
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxWidth: 320, margin: '0 auto' }}>
          {STAGES.map((label, i) => {
            const active = i === stageIndex
            const done = i < stageIndex
            return (
              <div key={label} style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '8px 14px', borderRadius: 6,
                background: active ? '#0d1f0d' : '#0a0a0a',
                border: `1px solid ${active ? '#1d5e3a' : '#1a1a1a'}`,
              }}>
                <span style={{
                  width: 8, height: 8, borderRadius: '50%',
                  background: done ? '#4ade80' : active ? '#4ade80' : '#222222',
                  flexShrink: 0, animation: active ? 'pulse 1.5s ease-in-out infinite' : 'none',
                }} />
                <span style={{ fontSize: 12, color: done ? '#4ade80' : active ? '#ffffff' : '#333333' }}>
                  {label}
                </span>
              </div>
            )
          })}
        </div>
        <style>{`
          @keyframes spin { to { transform: rotate(360deg); } }
          @keyframes pulse { 0%,100% { opacity:1; } 50% { opacity:0.4; } }
        `}</style>
      </div>

      {staleIdeas.length > 0 && (
        <div>
          <p style={{ color: '#333333', fontSize: 12, margin: '0 0 12px', fontFamily: 'monospace' }}>
            Previous ideas — generating new ones now
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, opacity: 0.4, pointerEvents: 'none' }}>
            {staleIdeas.map((idea) => (
              <div key={idea.id} style={{ background: '#080808', border: '1px solid #111111', borderRadius: 10, padding: '16px 20px' }}>
                <p style={{ color: '#555555', fontSize: 13, fontWeight: 600, margin: 0 }}>{idea.title}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Main client component ─────────────────────────────────────────────────────

interface IdeasClientProps {
  initialIdeas: Idea[]
  isFresh: boolean
  plan: 'free' | 'starter' | 'pro'
  mostRecentGeneratedAt: string | null
  ideaLimit: number
}

export function IdeasClient({
  initialIdeas,
  isFresh,
  plan,
  mostRecentGeneratedAt,
  ideaLimit,
}: IdeasClientProps) {
  const [ideas, setIdeas] = useState<Idea[]>(initialIdeas)
  const [isGenerating, setIsGenerating] = useState(!isFresh && initialIdeas.length === 0)
  const [isRegenerating, setIsRegenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [doneExpanded, setDoneExpanded] = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(null)

  // Trigger generation on mount when no fresh ideas
  useEffect(() => {
    if (!isFresh && initialIdeas.length === 0) {
      void generate()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const generate = useCallback(async () => {
    setError(null)
    try {
      const res = await fetch('/api/ideas/generate', { method: 'POST' })
      const data = await res.json()
      if (!res.ok) {
        if (res.status === 429) {
          window.location.reload()
          return
        }
        setError(data.error ?? 'Generation failed. Please try again.')
        return
      }
      setIdeas(data.ideas ?? [])
      setSelectedId(null)
    } catch {
      setError('Network error — please check your connection and try again.')
    } finally {
      setIsGenerating(false)
      setIsRegenerating(false)
    }
  }, [])

  async function handleRegenerate() {
    setIsRegenerating(true)
    setIsGenerating(true)
    await generate()
  }

  async function handlePlan(id: string) {
    await fetch(`/api/ideas/${id}/plan`, { method: 'POST' })
    setIdeas((prev) => prev.map((idea) => idea.id === id ? { ...idea, planned_at: new Date().toISOString() } : idea))
  }

  async function handleMade(id: string) {
    await fetch(`/api/ideas/${id}/made`, { method: 'POST' })
    setIdeas((prev) => prev.map((idea) => idea.id === id ? { ...idea, made_at: new Date().toISOString() } : idea))
  }

  function handleToggle(id: string) {
    setSelectedId((prev) => prev === id ? null : id)
  }

  // ── Lock state (computed client-side) ────────────────────────────────────
  let canRegenerate = true
  let nextAvailableDate: string | null = null

  if (mostRecentGeneratedAt) {
    const generatedDate = new Date(mostRecentGeneratedAt)
    const now = new Date()

    if (plan === 'starter') {
      const startOfMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
      if (generatedDate >= startOfMonth) {
        canRegenerate = false
        const y = now.getUTCMonth() === 11 ? now.getUTCFullYear() + 1 : now.getUTCFullYear()
        const m = (now.getUTCMonth() + 1) % 12
        nextAvailableDate = new Date(Date.UTC(y, m, 1)).toISOString()
      }
    } else if (plan === 'pro') {
      const unlockAt = new Date(generatedDate.getTime() + 7 * 24 * 60 * 60 * 1000)
      if (unlockAt > now) {
        canRegenerate = false
        nextAvailableDate = unlockAt.toISOString()
      }
    }
  }

  const latestGeneratedAt = ideas.length > 0 ? ideas[0].generated_at : null
  const activeIdeas = ideas.filter((i) => !i.made_at)
  const doneIdeas = ideas.filter((i) => i.made_at)

  // ── Empty state ──────────────────────────────────────────────────────────
  if (!isGenerating && ideas.length === 0) {
    return (
      <div style={{ padding: '28px 32px', maxWidth: 820 }}>
        <Header
          latestGeneratedAt={null}
          canRegenerate={true}
          nextAvailableDate={null}
          plan={plan}
          onRegenerate={() => { setIsGenerating(true); void generate() }}
          isRegenerating={false}
          ideaLimit={ideaLimit}
          ideasCount={0}
        />
        <div style={{
          background: '#0a0a0a', border: '1px dashed #1a1a1a',
          borderRadius: 10, padding: '56px 28px', textAlign: 'center', marginTop: 24,
        }}>
          <p style={{ color: '#ffffff', fontSize: 15, fontWeight: 600, margin: '0 0 8px' }}>
            No ideas generated yet
          </p>
          <p style={{ color: '#555555', fontSize: 13, margin: '0 0 20px', lineHeight: 1.6 }}>
            We&apos;ll analyse your top videos and your competitors&apos; winning content, then generate{' '}
            {ideaLimit} original ideas tailored to your channel.
          </p>
          <button
            onClick={() => { setIsGenerating(true); void generate() }}
            style={{
              fontSize: 13, fontWeight: 600, color: '#000000',
              background: '#4ade80', border: 'none', borderRadius: 6,
              padding: '10px 22px', cursor: 'pointer',
            }}
          >
            Generate ideas
          </button>
          {error && <p style={{ color: '#f87171', fontSize: 12, marginTop: 12 }}>{error}</p>}
        </div>
      </div>
    )
  }

  return (
    <div style={{ padding: '28px 32px', maxWidth: 820 }}>
      <Header
        latestGeneratedAt={latestGeneratedAt}
        canRegenerate={canRegenerate}
        nextAvailableDate={nextAvailableDate}
        plan={plan}
        onRegenerate={handleRegenerate}
        isRegenerating={isRegenerating}
        ideaLimit={ideaLimit}
        ideasCount={activeIdeas.length}
      />

      {error && (
        <div style={{ background: '#1a0000', border: '1px solid #6e1d1d', borderRadius: 6, padding: '10px 14px', marginBottom: 16 }}>
          <p style={{ color: '#f87171', fontSize: 13, margin: 0 }}>{error}</p>
        </div>
      )}

      {isGenerating ? (
        <LoadingState staleIdeas={!isRegenerating ? [] : ideas} />
      ) : (
        <>
          {activeIdeas.length > 0 && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))', gap: 14 }}>
              {activeIdeas.map((idea) => (
                <IdeaCard
                  key={idea.id}
                  idea={idea}
                  isExpanded={selectedId === idea.id}
                  onToggle={() => handleToggle(idea.id)}
                  onPlan={handlePlan}
                  onMade={handleMade}
                />
              ))}
            </div>
          )}

          {doneIdeas.length > 0 && (
            <div style={{ marginTop: 32 }}>
              <button
                onClick={() => setDoneExpanded((v) => !v)}
                style={{
                  background: 'transparent', border: 'none', cursor: 'pointer',
                  color: '#555555', fontSize: 13, padding: 0,
                  display: 'flex', alignItems: 'center', gap: 6,
                  marginBottom: doneExpanded ? 14 : 0,
                }}
              >
                <span style={{ fontSize: 10 }}>{doneExpanded ? '▼' : '▶'}</span>
                Ideas you&apos;ve made ({doneIdeas.length})
              </button>
              {doneExpanded && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))', gap: 14 }}>
                  {doneIdeas.map((idea) => (
                    <IdeaCard
                      key={idea.id}
                      idea={idea}
                      isExpanded={selectedId === idea.id}
                      onToggle={() => handleToggle(idea.id)}
                      onPlan={handlePlan}
                      onMade={handleMade}
                      isDone
                    />
                  ))}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}

// ─── Header ───────────────────────────────────────────────────────────────────

function Header({
  latestGeneratedAt,
  canRegenerate,
  nextAvailableDate,
  plan,
  onRegenerate,
  isRegenerating,
  ideaLimit,
  ideasCount,
}: {
  latestGeneratedAt: string | null
  canRegenerate: boolean
  nextAvailableDate: string | null
  plan: 'free' | 'starter' | 'pro'
  onRegenerate: () => void
  isRegenerating: boolean
  ideaLimit: number
  ideasCount: number
}) {
  return (
    <div style={{ marginBottom: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h1 style={{ color: '#ffffff', fontSize: 18, fontWeight: 700, margin: '0 0 4px', letterSpacing: '-0.3px' }}>
            Video Ideas
          </h1>
          <p style={{ color: '#555555', fontSize: 13, margin: 0, lineHeight: 1.5 }}>
            Original ideas grounded in your top videos and what&apos;s working for your competitors right now
          </p>
          {latestGeneratedAt && (
            <p style={{ color: '#333333', fontSize: 11, margin: '4px 0 0', fontFamily: 'monospace' }}>
              Generated {relativeTime(latestGeneratedAt)}
            </p>
          )}
        </div>

        <div style={{ flexShrink: 0, marginLeft: 16, textAlign: 'right' }}>
          {canRegenerate ? (
            <button
              onClick={onRegenerate}
              disabled={isRegenerating}
              style={{
                fontSize: 13, fontWeight: 600,
                color: isRegenerating ? '#333333' : '#000000',
                background: isRegenerating ? '#111111' : '#4ade80',
                border: 'none', borderRadius: 6, padding: '8px 16px',
                cursor: isRegenerating ? 'default' : 'pointer', whiteSpace: 'nowrap',
              }}
            >
              {isRegenerating ? 'Generating…' : 'Regenerate ideas'}
            </button>
          ) : (
            <div>
              <p style={{ color: '#555555', fontSize: 12, margin: 0, fontFamily: 'monospace' }}>
                Next refresh available {nextAvailableDate ? formatDate(nextAvailableDate) : ''}
              </p>
              {plan === 'starter' && (
                <p style={{ color: '#444444', fontSize: 11, margin: '4px 0 0', fontFamily: 'monospace' }}>
                  Pro users refresh weekly.{' '}
                  <a href="/pricing" style={{ color: '#60a5fa', textDecoration: 'none' }}>Upgrade to Pro</a>
                </p>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Starter plan indicator */}
      {plan === 'starter' && ideaLimit > 0 && (
        <div style={{
          marginTop: 14, padding: '8px 12px', background: '#0a0a0a',
          border: '1px solid #1a1a1a', borderRadius: 6,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
        }}>
          <p style={{ color: '#444444', fontSize: 12, margin: 0 }}>
            {ideasCount} of {ideaLimit} monthly ideas generated.{' '}
            Pro users get 10 ideas, refreshed weekly.{' '}
            <a href="/pricing" style={{ color: '#60a5fa', textDecoration: 'none' }}>Upgrade to Pro</a>
          </p>
        </div>
      )}
    </div>
  )
}
