'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'

interface AnalysisResult {
  gapScore: number | null
  primaryBottleneck: string | null
  topIdeaTitle: string | null
  topIdeaReason: string | null
}

interface Props {
  result: AnalysisResult
  setResult: (r: AnalysisResult) => void
}

const LOADING_STAGES = [
  { label: 'Connecting to your YouTube channel...', duration: 3000 },
  { label: 'Analysing your competitors...', duration: 6000 },
  { label: 'Calculating your gap scores...', duration: 5000 },
  { label: 'Generating your personalised video ideas...', duration: 10000 },
  { label: 'Almost ready...', duration: 3000 },
]

const TOTAL_DURATION = LOADING_STAGES.reduce((s, x) => s + x.duration, 0)

export default function StepFirstAnalysis({ result, setResult }: Props) {
  const router = useRouter()
  const [stageIndex, setStageIndex] = useState(0)
  const [progress, setProgress] = useState(0)
  const [done, setDone] = useState(false)
  const [completing, setCompleting] = useState(false)
  const startTimeRef = useRef<number>(Date.now())
  const fetchedRef = useRef(false)

  // Single progress ticker running from mount
  useEffect(() => {
    if (done) return
    startTimeRef.current = Date.now()

    const tick = setInterval(() => {
      const elapsed = Date.now() - startTimeRef.current
      const pct = Math.min(99, (elapsed / TOTAL_DURATION) * 100)
      setProgress(pct)
    }, 100)

    return () => clearInterval(tick)
  }, [done])

  // Advance stage labels on a schedule
  useEffect(() => {
    if (done) return

    let elapsed = 0
    const timers: ReturnType<typeof setTimeout>[] = []

    LOADING_STAGES.forEach((_stage, idx) => {
      if (idx === 0) return
      elapsed += LOADING_STAGES[idx - 1].duration
      const t = setTimeout(() => setStageIndex(idx), elapsed)
      timers.push(t)
    })

    // After all stages, trigger fetch
    const totalDelay = LOADING_STAGES.reduce((s, x) => s + x.duration, 0)
    const finalTimer = setTimeout(() => {
      setStageIndex(LOADING_STAGES.length)
    }, totalDelay)
    timers.push(finalTimer)

    return () => timers.forEach(clearTimeout)
  }, [done])

  // Fetch results once all stages have elapsed
  useEffect(() => {
    if (stageIndex < LOADING_STAGES.length) return
    if (fetchedRef.current) return
    fetchedRef.current = true

    const fetchResults = async () => {
      // Fetch gap score
      let gapScore: number | null = null
      let bottleneck: string | null = null

      try {
        const gapRes = await fetch('/api/gap-score/latest')
        if (gapRes.ok) {
          const data = await gapRes.json() as {
            overall_score?: number | null
            primary_bottleneck?: string | null
          }
          gapScore = data.overall_score ?? null
          bottleneck = data.primary_bottleneck ?? null
        }
      } catch {
        // Non-blocking
      }

      // Try to get existing ideas first
      let topIdeaTitle: string | null = null
      let topIdeaReason: string | null = null

      try {
        const ideaRes = await fetch('/api/ideas/latest')
        if (ideaRes.ok) {
          const data = await ideaRes.json() as {
            ideas?: Array<{ title?: string | null; why_now?: string | null }>
          }
          const idea = data.ideas?.[0] ?? null
          topIdeaTitle = idea?.title ?? null
          topIdeaReason = idea?.why_now ?? null
        }
      } catch {
        // Non-blocking
      }

      // If no ideas exist, trigger generation automatically.
      // /api/ideas/generate already handles auto-generating competitor insights
      // before calling Claude, so this is a single call that handles the full pipeline.
      if (!topIdeaTitle) {
        try {
          const genRes = await fetch('/api/ideas/generate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ source: 'onboarding' }),
          })

          if (genRes.ok) {
            // Brief delay to let DB writes settle before re-fetching
            await new Promise((r) => setTimeout(r, 1000))
            const ideaRes2 = await fetch('/api/ideas/latest')
            if (ideaRes2.ok) {
              const data2 = await ideaRes2.json() as {
                ideas?: Array<{ title?: string | null; why_now?: string | null }>
              }
              const idea2 = data2.ideas?.[0] ?? null
              topIdeaTitle = idea2?.title ?? null
              topIdeaReason = idea2?.why_now ?? null
            }
          }
        } catch {
          // Still non-blocking — fallback message is acceptable
        }
      }

      setResult({ gapScore, primaryBottleneck: bottleneck, topIdeaTitle, topIdeaReason })
      setProgress(100)
      setDone(true)
    }

    fetchResults()
  }, [stageIndex, setResult])

  const goToDashboard = async () => {
    setCompleting(true)
    try {
      await fetch('/api/onboarding/complete', { method: 'POST' })
    } catch {
      // Continue anyway
    }
    router.push('/dashboard')
  }

  if (!done) {
    const currentStage = LOADING_STAGES[Math.min(stageIndex, LOADING_STAGES.length - 1)]
    return (
      <div className="flex flex-col items-center text-center">
        <div className="text-[11px] font-mono uppercase tracking-widest text-zinc-500 mb-6">
          Running your first analysis
        </div>

        <div className="text-xl text-zinc-200 mb-8 min-h-[2rem] transition-all duration-300">
          {currentStage.label}
        </div>

        <div className="w-full max-w-md h-1 bg-zinc-800 rounded-full overflow-hidden mb-6">
          <div
            className="h-full bg-green-400 transition-all duration-300"
            style={{ width: `${progress}%` }}
          />
        </div>

        <div className="text-zinc-600 text-xs font-mono">
          {Math.round(progress)}% complete
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col items-center text-center w-full">
      <div className="text-xs text-green-400 font-mono uppercase tracking-widest mb-6 flex items-center gap-2">
        <span>✓</span> Analysis complete
      </div>

      <h2
        className="text-4xl md:text-5xl mb-12 leading-tight"
        style={{ fontFamily: 'Instrument Serif, serif', fontWeight: 400 }}
      >
        Your first <em className="italic text-amber-200">analysis is ready</em>.
      </h2>

      {result.gapScore != null && (
        <div className="w-full max-w-xl border border-zinc-800 bg-zinc-900/30 p-8 mb-4">
          <div className="text-[10px] font-mono uppercase tracking-widest text-zinc-500 mb-4">
            Your gap score
          </div>
          <div className="flex items-baseline justify-center gap-2 mb-2">
            <div
              className="text-5xl sm:text-7xl text-amber-200"
              style={{ fontFamily: 'Instrument Serif, serif', fontStyle: 'italic' }}
            >
              {result.gapScore}
            </div>
            <div className="text-zinc-500 text-sm font-mono">/ 100</div>
          </div>
          <div className="text-zinc-500 text-xs font-mono">
            higher = more opportunity vs your niche
          </div>
        </div>
      )}

      {result.primaryBottleneck && (
        <div className="w-full max-w-xl border border-zinc-800 bg-zinc-900/30 p-6 mb-4">
          <div className="text-[10px] font-mono uppercase tracking-widest text-zinc-500 mb-3">
            Your biggest opportunity
          </div>
          <div className="text-zinc-200 text-base">
            {result.primaryBottleneck}
          </div>
        </div>
      )}

      {result.topIdeaTitle && (
        <div className="w-full max-w-xl border border-zinc-800 bg-zinc-900/30 p-6 mb-10 text-left">
          <div className="text-[10px] font-mono uppercase tracking-widest text-zinc-500 mb-3">
            Your first video idea
          </div>
          <div
            className="text-xl text-zinc-100 mb-3 break-words"
            style={{ fontFamily: 'Instrument Serif, serif' }}
          >
            &ldquo;{result.topIdeaTitle}&rdquo;
          </div>
          {result.topIdeaReason && (
            <div className="text-zinc-500 text-sm leading-relaxed">
              {result.topIdeaReason}
            </div>
          )}
        </div>
      )}

      {result.gapScore == null && result.topIdeaTitle == null && (
        <div className="w-full max-w-xl border border-zinc-800 bg-zinc-900/30 p-8 mb-10 text-center">
          <div className="text-zinc-300 text-base mb-2">
            Your analysis is still running in the background
          </div>
          <div className="text-zinc-500 text-sm">
            Your dashboard will populate within a few minutes.
          </div>
        </div>
      )}

      <button
        onClick={goToDashboard}
        disabled={completing}
        className="w-full sm:w-auto bg-white text-black px-10 py-3 text-sm font-medium hover:bg-zinc-200 transition-colors disabled:opacity-60"
      >
        {completing ? 'Loading dashboard...' : 'Take me to my dashboard →'}
      </button>
    </div>
  )
}
