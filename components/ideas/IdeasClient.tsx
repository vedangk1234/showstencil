'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import type { Idea } from '@/types'
import { ExpandableCard } from '@/components/ui/expandable-card'
import { getShuffledNicheImages } from '@/lib/niche-images'
import { ThumbnailGenerationModal } from '@/components/ideas/ThumbnailGenerationModal'

// ─── Parse helpers (pure, defined outside component) ─────────────────────────

function parseThumbnailBullets(text: string | null | undefined): string[] {
  if (!text) return []
  return text
    .split('. ')
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
}

function parseContentBullets(text: string | null | undefined): string[] {
  if (!text) return ['', '', '', '']
  const items = text
    .split('. ')
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
  while (items.length < 4) items.push('')
  return items.slice(0, 4)
}

function parseWhyBullets(text: string | null | undefined): string[] {
  if (!text) return []
  const bySemicolon = text.split('; ').map((s) => s.trim()).filter((s) => s.length > 0)
  if (bySemicolon.length > 1) return bySemicolon
  return text.split('. ').map((s) => s.trim()).filter((s) => s.length > 0)
}

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

// ─── Loading stages ───────────────────────────────────────────────────────────

const STAGES = [
  'Analysing competitor insights...',
  'Matching your top videos to proven topics...',
  'Generating your personalised ideas...',
]

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
          Generating competitor insights and building your personalised ideas. This takes about 40 seconds.
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

// ─── Regenerate confirmation modal ────────────────────────────────────────────

function RegenerateConfirmModal({
  onConfirm,
  onCancel,
}: {
  onConfirm: () => void
  onCancel: () => void
}) {
  return (
    <>
      <div
        style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)', zIndex: 300 }}
        onClick={onCancel}
      />
      <div style={{
        position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)',
        zIndex: 400, background: '#111111', borderRadius: 20, padding: 32,
        maxWidth: 440, width: '90vw', border: '1px solid #222',
      }}>
        <p className="text-xs uppercase tracking-widest text-zinc-500 mb-2">Heads up</p>
        <h2 className="text-xl font-semibold text-white mb-3">
          Generating new ideas will delete your saved thumbnails
        </h2>
        <p className="text-sm text-zinc-400 mb-6 leading-relaxed">
          Download any thumbnails you want to keep before continuing. This action cannot be undone.
        </p>
        <div style={{ display: 'flex', gap: 10 }}>
          <button
            onClick={onConfirm}
            className="text-sm px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-medium transition-colors"
          >
            Continue
          </button>
          <button
            onClick={onCancel}
            className="text-sm px-4 py-2 rounded-lg border border-zinc-700 text-zinc-300 hover:border-zinc-500 hover:text-white transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </>
  )
}

// ─── Main client component ─────────────────────────────────────────────────────

interface IdeasClientProps {
  initialIdeas: Idea[]
  isFresh: boolean
  plan: 'free' | 'starter' | 'pro'
  ideaLimit: number
  nicheId: string
  imageSeed: number
  canGenerate: boolean
  quotaUsed: number
  quotaLimit: number
  quotaResetAt: Date | null
  googleProfilePhotoUrl: string | null
  ideasRefreshAvailable: boolean
}

export function IdeasClient({
  initialIdeas,
  isFresh,
  plan,
  ideaLimit,
  nicheId,
  imageSeed,
  canGenerate,
  quotaUsed,
  quotaLimit,
  googleProfilePhotoUrl,
  ideasRefreshAvailable,
}: IdeasClientProps) {
  const [ideas, setIdeas] = useState<Idea[]>(initialIdeas)
  const ideasRef = useRef<Idea[]>(initialIdeas)
  useEffect(() => { ideasRef.current = ideas }, [ideas])
  const [isGenerating, setIsGenerating] = useState(!isFresh && initialIdeas.length === 0)
  const [isRegenerating, setIsRegenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [regenError, setRegenError] = useState<string | null>(null)
  const [doneExpanded, setDoneExpanded] = useState(false)
  const [thumbnailModalIdeaId, setThumbnailModalIdeaId] = useState<string | null>(null)
  const [showRegenerateConfirm, setShowRegenerateConfirm] = useState(false)
  const [localRefreshAvailable, setLocalRefreshAvailable] = useState(ideasRefreshAvailable)

  // Trigger generation on mount when no fresh ideas
  useEffect(() => {
    if (!isFresh && initialIdeas.length === 0 && localRefreshAvailable) {
      void generate()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const generate = useCallback(async () => {
    setError(null)
    setRegenError(null)
    try {
      const res = await fetch('/api/ideas/generate', { method: 'POST' })
      if (res.status === 403) {
        setError(
          'Video ideas are available on Starter and Pro plans. ' +
          'Upgrade to start generating ideas for your channel.'
        )
        return
      }
      if (res.status === 429) {
        setLocalRefreshAvailable(false)
        setError(
          'New ideas are available every Monday when competitor data refreshes.'
        )
        setIsGenerating(false)
        setIsRegenerating(false)
        return
      }
      if (!res.ok) {
        const errData = await res.json()
        const msg = errData.error ?? 'Generation failed. Please try again.'
        if (ideasRef.current.length > 0) {
          setRegenError('Could not generate new ideas right now. Please try again in a few minutes.')
        } else {
          setError(msg)
        }
        return
      }
      const data = await res.json()
      setIdeas(data.ideas ?? [])
      // Disable button locally — server already set ideas_refresh_available = false
      setLocalRefreshAvailable(false)
    } catch {
      if (ideasRef.current.length > 0) {
        setRegenError('Could not generate new ideas right now. Please try again in a few minutes.')
      } else {
        setError('Network error — please check your connection and try again.')
      }
    } finally {
      setIsGenerating(false)
      setIsRegenerating(false)
    }
  }, [])

  async function handleRegenerate() {
    const hasThumbnails = ideas.some((i) => i.thumbnail_image_url)
    if (hasThumbnails) {
      setShowRegenerateConfirm(true)
      return
    }
    setIsRegenerating(true)
    setIsGenerating(true)
    await generate()
  }

  async function handleRegenerateConfirmed() {
    setShowRegenerateConfirm(false)
    // Clear thumbnails from local state immediately for responsiveness
    setIdeas((prev) => prev.map((i) => ({ ...i, thumbnail_image_url: null, thumbnail_generated_at: null, thumbnail_source_type: null })))
    setIsRegenerating(true)
    setIsGenerating(true)
    // Server-side thumbnail cleanup happens inside /api/ideas/generate (deleteAllUserThumbnails)
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

  function openThumbnailModal(idea: Idea) {
    setThumbnailModalIdeaId(idea.id)
  }

  async function handleThumbnailDownload(url: string, id: string) {
    try {
      const response = await fetch(url)
      const blob = await response.blob()
      const blobUrl = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = blobUrl
      link.download = `showstencil-thumbnail-${id}.jpg`
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      URL.revokeObjectURL(blobUrl)
    } catch (error) {
      console.error('Download failed:', error)
    }
  }

  function handleThumbnailSuccess(ideaId: string, thumbnailUrl: string) {
    setIdeas((prev) =>
      prev.map((i) =>
        i.id === ideaId
          ? { ...i, thumbnail_image_url: thumbnailUrl, thumbnail_generated_at: new Date().toISOString() }
          : i,
      ),
    )
    setThumbnailModalIdeaId(null)
  }

  // ── Lock state — controlled by weekly cache-clear cron (Monday 3am UTC) ──
  // ideas_refresh_available is set to false after generation and reset to true
  // every Monday when the cache-cleanup cron runs.
  const canRegenerate = localRefreshAvailable

  const latestGeneratedAt = ideas.length > 0 ? ideas[0].generated_at : null
  const activeIdeas = ideas.filter((i) => !i.made_at)
  const doneIdeas = ideas.filter((i) => i.made_at)

  const imageUrls = getShuffledNicheImages(nicheId, ideas.length, imageSeed)

  // Find the modal idea object
  const modalIdea = thumbnailModalIdeaId ? ideas.find((i) => i.id === thumbnailModalIdeaId) : null

  // ── Thumbnail section renderer ──────────────────────────────────────────
  function renderThumbnailSection(idea: Idea) {
    return (
      <div>
        <p className="text-xs uppercase tracking-widest text-zinc-500 mb-3">Thumbnail</p>
        {idea.thumbnail_image_url ? (
          <div className="space-y-3">
            <div className="relative w-full aspect-video overflow-hidden rounded-xl bg-zinc-900">
              <img
                src={idea.thumbnail_image_url}
                alt="Generated thumbnail"
                className="w-full h-full object-cover"
              />
            </div>
            <p className="text-xs text-zinc-500 text-center">
              Recommended: resize to 1280×720px before uploading to YouTube
            </p>
            <div className="flex gap-3">
              <button
                onClick={(e) => { e.stopPropagation(); void handleThumbnailDownload(idea.thumbnail_image_url!, idea.id) }}
                className="text-sm px-4 py-2 rounded-lg border border-zinc-700 text-zinc-300 hover:border-zinc-500 hover:text-white transition-colors"
              >
                Download
              </button>
            </div>
          </div>
        ) : plan === 'free' ? (
          <a
            href="/pricing"
            onClick={(e) => e.stopPropagation()}
            title="Upgrade to Starter or Pro to generate thumbnails"
            className="inline-block text-sm px-4 py-2 rounded-lg border border-zinc-700 text-zinc-400 hover:border-zinc-500 hover:text-white transition-colors cursor-pointer"
          >
            Upgrade to generate thumbnails
          </a>
        ) : (
          <button
            onClick={(e) => { e.stopPropagation(); openThumbnailModal(idea) }}
            disabled={!canGenerate}
            className="text-sm px-4 py-2 rounded-lg border border-zinc-700 text-zinc-300 hover:border-zinc-500 hover:text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {!canGenerate
              ? `Quota reached (${quotaUsed}/${quotaLimit} this month)`
              : 'Generate thumbnail'}
          </button>
        )}
      </div>
    )
  }

  // ── Empty state ──────────────────────────────────────────────────────────
  if (!isGenerating && ideas.length === 0) {
    return (
      <div style={{ padding: '28px 32px', maxWidth: 1100 }}>
        <Header
          latestGeneratedAt={null}
          canRegenerate={localRefreshAvailable}
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
          {localRefreshAvailable ? (
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
          ) : (
            <div style={{ fontSize: 13, color: '#555555', fontFamily: 'monospace' }}>
              New ideas available every Monday when competitor data refreshes.
            </div>
          )}
          {error && (
            <div style={{ marginTop: 12 }}>
              <p style={{ color: '#f87171', fontSize: 12, margin: 0 }}>{error}</p>
              {error.includes('Upgrade') && (
                <a href="/pricing" style={{ color: '#60a5fa', fontSize: 12, display: 'block', marginTop: 6, textDecoration: 'none', fontFamily: 'monospace' }}>
                  View pricing →
                </a>
              )}
            </div>
          )}
        </div>
      </div>
    )
  }

  return (
    <div style={{ padding: '28px 32px', maxWidth: 1100 }}>
      <Header
        latestGeneratedAt={latestGeneratedAt}
        canRegenerate={canRegenerate}
        plan={plan}
        onRegenerate={() => void handleRegenerate()}
        isRegenerating={isRegenerating}
        ideaLimit={ideaLimit}
        ideasCount={activeIdeas.length}
      />

      {error && (
        <div style={{ background: '#1a0000', border: '1px solid #6e1d1d', borderRadius: 6, padding: '10px 14px', marginBottom: 16 }}>
          <p style={{ color: '#f87171', fontSize: 13, margin: 0 }}>{error}</p>
          {error.includes('Upgrade') && (
            <a href="/pricing" style={{ color: '#60a5fa', fontSize: 13, display: 'block', marginTop: 8, textDecoration: 'none', fontFamily: 'monospace' }}>
              View pricing →
            </a>
          )}
        </div>
      )}

      {regenError && (
        <div style={{
          background: '#1a0a0a',
          border: '1px solid #3a1a1a',
          borderRadius: 8,
          padding: '12px 16px',
          marginBottom: 16,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}>
          <p style={{ color: '#f87171', fontSize: 13, margin: 0 }}>
            {regenError}
          </p>
          <button
            onClick={() => setRegenError(null)}
            style={{ background: 'none', border: 'none', color: '#666', cursor: 'pointer', fontSize: 16, padding: '0 4px' }}
          >
            ×
          </button>
        </div>
      )}

      {isGenerating ? (
        <LoadingState staleIdeas={!isRegenerating ? [] : ideas} />
      ) : (
        <>
          {activeIdeas.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {activeIdeas.map((idea) => {
                const globalIndex = ideas.indexOf(idea)
                const src = imageUrls[globalIndex] ?? imageUrls[0] ?? ''
                const description = `Opportunity ${idea.opportunity_score}/100  ·  ${idea.suggested_duration_min}–${idea.suggested_duration_max} min`

                return (
                  <ExpandableCard
                    key={idea.id}
                    title={idea.title ?? ''}
                    src={src}
                    description={description}
                  >
                    {/* Thumbnail brief */}
                    <div>
                      <p className="text-xs uppercase tracking-widest text-zinc-500 mb-3">
                        Thumbnail brief
                      </p>
                      <ul className="flex flex-col gap-2">
                        {parseThumbnailBullets(idea.thumbnail_description).map((point, i) => (
                          <li key={i} className="flex gap-2 text-zinc-300 text-sm">
                            <span className="text-zinc-600 mt-0.5">—</span>
                            <span>{point}</span>
                          </li>
                        ))}
                      </ul>
                    </div>

                    {/* Generated thumbnail */}
                    {renderThumbnailSection(idea)}

                    {/* Content brief */}
                    <div>
                      <p className="text-xs uppercase tracking-widest text-zinc-500 mb-3">
                        Content brief
                      </p>

                      {/* Hook — 3 variants (hook_2 and hook_3 locked for free plan) */}
                      <div className="mb-4">
                        <p className="text-white font-medium text-sm mb-2">Hook:</p>
                        <div className="flex flex-col gap-3">
                          {/* Hook 1 — Safe: always visible */}
                          <div className="flex gap-2 text-sm items-start">
                            <span className="font-mono text-zinc-600 shrink-0 w-4">1.</span>
                            {parseContentBullets(idea.content_brief)[0] ? (
                              <>
                                <span className="text-xs uppercase tracking-widest text-zinc-500 shrink-0 w-32">Safe</span>
                                <span className="text-zinc-300">{parseContentBullets(idea.content_brief)[0]}</span>
                              </>
                            ) : (
                              <span className="text-zinc-700">—</span>
                            )}
                          </div>

                          {plan === 'free' ? (
                            /* Locked state for free users — hooks 2 and 3 combined */
                            <div className="flex gap-2 text-sm items-start">
                              <span className="font-mono text-zinc-600 shrink-0 w-4">2.</span>
                              <div className="flex-1 bg-zinc-900/50 border border-zinc-800 rounded-md px-3 py-2">
                                <p className="text-zinc-500 text-xs mb-1">
                                  Bolder and controversial hooks available on Starter and Pro
                                </p>
                                <a
                                  href="/pricing"
                                  onClick={(e) => e.stopPropagation()}
                                  className="text-xs text-blue-400 hover:text-blue-300 transition-colors"
                                >
                                  Upgrade to unlock →
                                </a>
                              </div>
                            </div>
                          ) : (
                            /* Paid plan: show hooks 2 and 3 */
                            ([
                              { label: 'Bolder', color: 'text-amber-500', text: idea.hook_2 },
                              { label: 'Most controversial', color: 'text-rose-500', text: idea.hook_3 },
                            ] as const).map((hook, i) => (
                              <div key={i} className="flex gap-2 text-sm items-start">
                                <span className="font-mono text-zinc-600 shrink-0 w-4">{i + 2}.</span>
                                {hook.text ? (
                                  <>
                                    <span className={`text-xs uppercase tracking-widest ${hook.color} shrink-0 w-32`}>
                                      {hook.label}
                                    </span>
                                    <span className="text-zinc-300">{hook.text}</span>
                                  </>
                                ) : (
                                  <span className="text-zinc-700">—</span>
                                )}
                              </div>
                            ))
                          )}
                        </div>
                      </div>

                      {/* Angle / Structure / Takeaway */}
                      <ul className="flex flex-col gap-3">
                        {parseContentBullets(idea.content_brief).slice(1).map((point, i) => (
                          <li key={i} className="flex gap-2 text-sm">
                            <span className="text-white font-medium shrink-0">
                              {(['Angle', 'Structure', 'Takeaway'] as const)[i] ?? ''}:
                            </span>
                            <span className="text-zinc-300">{point}</span>
                          </li>
                        ))}
                      </ul>
                    </div>

                    {/* Duration logic */}
                    <div>
                      <p className="text-xs uppercase tracking-widest text-zinc-500 mb-2">
                        Duration logic
                      </p>
                      <p className="text-zinc-400 text-sm italic">{idea.duration_reasoning}</p>
                    </div>

                    {/* Why we suggested this */}
                    <div>
                      <p className="text-xs uppercase tracking-widest text-zinc-500 mb-3">
                        Why we suggested this
                      </p>
                      <ul className="flex flex-col gap-2">
                        {parseWhyBullets(idea.why_now).map((point, i) => (
                          <li key={i} className="flex gap-2 text-sm">
                            <span className="text-zinc-600 mt-0.5">—</span>
                            <span className="text-zinc-300">{point}</span>
                          </li>
                        ))}
                      </ul>
                    </div>

                    {/* Actions */}
                    <div className="flex gap-3 pt-4 border-t border-zinc-800">
                      {!idea.planned_at && (
                        <button
                          onClick={(e) => { e.stopPropagation(); void handlePlan(idea.id) }}
                          className="text-sm px-4 py-2 rounded-lg border border-zinc-700 text-zinc-300 hover:border-zinc-500 hover:text-white transition-colors"
                        >
                          Mark as planned
                        </button>
                      )}
                      {idea.planned_at && (
                        <span className="text-sm text-emerald-500">Planned</span>
                      )}
                      {!idea.made_at && (
                        <button
                          onClick={(e) => { e.stopPropagation(); void handleMade(idea.id) }}
                          className="text-sm px-4 py-2 rounded-lg border border-zinc-700 text-zinc-300 hover:border-zinc-500 hover:text-white transition-colors"
                        >
                          Mark as made
                        </button>
                      )}
                    </div>
                  </ExpandableCard>
                )
              })}
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
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {doneIdeas.map((idea) => {
                    const globalIndex = ideas.indexOf(idea)
                    const src = imageUrls[globalIndex] ?? imageUrls[0] ?? ''
                    const description = `Opportunity ${idea.opportunity_score}/100  ·  ${idea.suggested_duration_min}–${idea.suggested_duration_max} min`

                    return (
                      <ExpandableCard
                        key={idea.id}
                        title={idea.title ?? ''}
                        src={src}
                        description={description}
                        className="opacity-50"
                      >
                        {/* Thumbnail brief */}
                        <div>
                          <p className="text-xs uppercase tracking-widest text-zinc-500 mb-3">
                            Thumbnail brief
                          </p>
                          <ul className="flex flex-col gap-2">
                            {parseThumbnailBullets(idea.thumbnail_description).map((point, i) => (
                              <li key={i} className="flex gap-2 text-zinc-300 text-sm">
                                <span className="text-zinc-600 mt-0.5">—</span>
                                <span>{point}</span>
                              </li>
                            ))}
                          </ul>
                        </div>

                        {/* Content brief */}
                        <div>
                          <p className="text-xs uppercase tracking-widest text-zinc-500 mb-3">
                            Content brief
                          </p>

                          {/* Hook — 3 variants (hook_2/hook_3 locked for free) */}
                          <div className="mb-4">
                            <p className="text-white font-medium text-sm mb-2">Hook:</p>
                            <div className="flex flex-col gap-3">
                              <div className="flex gap-2 text-sm items-start">
                                <span className="font-mono text-zinc-600 shrink-0 w-4">1.</span>
                                {parseContentBullets(idea.content_brief)[0] ? (
                                  <>
                                    <span className="text-xs uppercase tracking-widest text-zinc-500 shrink-0 w-32">Safe</span>
                                    <span className="text-zinc-300">{parseContentBullets(idea.content_brief)[0]}</span>
                                  </>
                                ) : (
                                  <span className="text-zinc-700">—</span>
                                )}
                              </div>
                              {plan === 'free' ? (
                                <div className="flex gap-2 text-sm items-start">
                                  <span className="font-mono text-zinc-600 shrink-0 w-4">2.</span>
                                  <div className="flex-1 bg-zinc-900/50 border border-zinc-800 rounded-md px-3 py-2">
                                    <p className="text-zinc-500 text-xs">Bolder and controversial hooks on Starter and Pro</p>
                                  </div>
                                </div>
                              ) : (
                                ([
                                  { label: 'Bolder', color: 'text-amber-500', text: idea.hook_2 },
                                  { label: 'Most controversial', color: 'text-rose-500', text: idea.hook_3 },
                                ] as const).map((hook, i) => (
                                  <div key={i} className="flex gap-2 text-sm items-start">
                                    <span className="font-mono text-zinc-600 shrink-0 w-4">{i + 2}.</span>
                                    {hook.text ? (
                                      <>
                                        <span className={`text-xs uppercase tracking-widest ${hook.color} shrink-0 w-32`}>
                                          {hook.label}
                                        </span>
                                        <span className="text-zinc-300">{hook.text}</span>
                                      </>
                                    ) : (
                                      <span className="text-zinc-700">—</span>
                                    )}
                                  </div>
                                ))
                              )}
                            </div>
                          </div>

                          {/* Angle / Structure / Takeaway */}
                          <ul className="flex flex-col gap-3">
                            {parseContentBullets(idea.content_brief).slice(1).map((point, i) => (
                              <li key={i} className="flex gap-2 text-sm">
                                <span className="text-white font-medium shrink-0">
                                  {(['Angle', 'Structure', 'Takeaway'] as const)[i] ?? ''}:
                                </span>
                                <span className="text-zinc-300">{point}</span>
                              </li>
                            ))}
                          </ul>
                        </div>

                        {/* Duration logic */}
                        <div>
                          <p className="text-xs uppercase tracking-widest text-zinc-500 mb-2">
                            Duration logic
                          </p>
                          <p className="text-zinc-400 text-sm italic">{idea.duration_reasoning}</p>
                        </div>

                        {/* Why we suggested this */}
                        <div>
                          <p className="text-xs uppercase tracking-widest text-zinc-500 mb-3">
                            Why we suggested this
                          </p>
                          <ul className="flex flex-col gap-2">
                            {parseWhyBullets(idea.why_now).map((point, i) => (
                              <li key={i} className="flex gap-2 text-sm">
                                <span className="text-zinc-600 mt-0.5">—</span>
                                <span className="text-zinc-300">{point}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      </ExpandableCard>
                    )
                  })}
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* Thumbnail generation modal — layered above ExpandableCard (z-[200]) */}
      {modalIdea && (
        <ThumbnailGenerationModal
          isOpen={thumbnailModalIdeaId !== null}
          onClose={() => setThumbnailModalIdeaId(null)}
          ideaId={modalIdea.id}
          ideaTitle={modalIdea.title ?? ''}
          thumbnailBrief={modalIdea.thumbnail_description ?? ''}
          googleProfilePhotoUrl={googleProfilePhotoUrl}
          onSuccess={handleThumbnailSuccess}
        />
      )}

      {/* Regenerate confirmation modal */}
      {showRegenerateConfirm && (
        <RegenerateConfirmModal
          onConfirm={() => void handleRegenerateConfirmed()}
          onCancel={() => setShowRegenerateConfirm(false)}
        />
      )}
    </div>
  )
}

// ─── Header ───────────────────────────────────────────────────────────────────

function Header({
  latestGeneratedAt,
  canRegenerate,
  plan,
  onRegenerate,
  isRegenerating,
  ideaLimit,
  ideasCount,
}: {
  latestGeneratedAt: string | null
  canRegenerate: boolean
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
            <div className="flex flex-col items-end gap-1">
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
              <p style={{ color: '#555555', fontSize: 11, margin: 0, fontFamily: 'monospace' }}>
                Fresh competitor data available — generate new ideas
              </p>
            </div>
          ) : (
            <div>
              <p style={{ color: '#555555', fontSize: 12, margin: 0, fontFamily: 'monospace' }}>
                New ideas available every Monday when competitor data refreshes
              </p>
              {plan === 'starter' && (
                <p style={{ color: '#444444', fontSize: 11, margin: '4px 0 0', fontFamily: 'monospace' }}>
                  Pro users get 10 ideas.{' '}
                  <a href="/pricing" style={{ color: '#60a5fa', textDecoration: 'none' }}>Upgrade to Pro</a>
                </p>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Plan indicator for free and starter users */}
      {(plan === 'free' || plan === 'starter') && ideaLimit > 0 && (
        <div style={{
          marginTop: 14, padding: '8px 12px', background: '#0a0a0a',
          border: '1px solid #1a1a1a', borderRadius: 6,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
        }}>
          <p style={{ color: '#444444', fontSize: 12, margin: 0 }}>
            {ideasCount} of {ideaLimit} idea{ideaLimit !== 1 ? 's' : ''} generated this month. Refreshes every Monday.
          </p>
          {plan === 'free' && (
            <a href="/pricing" style={{ color: '#60a5fa', fontSize: 11, fontFamily: 'monospace', whiteSpace: 'nowrap', textDecoration: 'none' }}>
              Upgrade for more →
            </a>
          )}
        </div>
      )}
    </div>
  )
}
