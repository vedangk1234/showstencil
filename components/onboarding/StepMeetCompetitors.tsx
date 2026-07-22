'use client'

import { useEffect, useState } from 'react'

interface Props {
  onNext: () => void
}

interface CompetitorRow {
  id: string
  channel_name: string
  channel_thumbnail: string | null
  subscriber_count: number | null
  tier: number | null
  is_dominator: boolean
  sub_niche: string | null
}

function formatSubs(n: number | null): string {
  if (n == null) return ''
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return n.toString()
}

function tierLabel(c: CompetitorRow): { label: string; color: string } {
  if (c.is_dominator || c.tier === 3) {
    return { label: 'Top Performer', color: 'text-amber-400 border-amber-400/40 bg-amber-400/10' }
  }
  if (c.tier === 2) {
    return { label: 'Tier 2', color: 'text-purple-400 border-purple-400/40 bg-purple-400/10' }
  }
  return { label: 'Tier 1', color: 'text-blue-400 border-blue-400/40 bg-blue-400/10' }
}

export default function StepMeetCompetitors({ onNext }: Props) {
  const [competitors, setCompetitors] = useState<CompetitorRow[]>([])
  const [loading, setLoading] = useState(true)
  const [timedOut, setTimedOut] = useState(false)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    let cancelled = false
    let attempts = 0
    const maxAttempts = 30

    const poll = async () => {
      try {
        const res = await fetch('/api/competitors?active=true')
        const data = await res.json() as { competitors?: CompetitorRow[] }
        if (cancelled) return

        const list: CompetitorRow[] = data.competitors ?? []
        const hasTier1 = list.some(c => c.tier === 1)
        const hasTier2 = list.some(c => c.tier === 2)
        const hasDom = list.some(c => c.is_dominator || c.tier === 3)

        if (hasTier1 && hasTier2 && hasDom) {
          setCompetitors(list)
          setLoading(false)
          setTimeout(() => setVisible(true), 50)
        } else if (list.length > 0 && attempts >= 10) {
          setCompetitors(list)
          setLoading(false)
          setTimeout(() => setVisible(true), 50)
        } else if (attempts < maxAttempts) {
          attempts++
          setTimeout(poll, 2000)
        } else {
          setTimedOut(true)
          setCompetitors(list)
          setLoading(false)
          setTimeout(() => setVisible(true), 50)
        }
      } catch {
        if (!cancelled) {
          if (attempts < maxAttempts) {
            attempts++
            setTimeout(poll, 2000)
          } else {
            setTimedOut(true)
            setLoading(false)
          }
        }
      }
    }

    poll()
    return () => { cancelled = true }
  }, [])

  const sorted = [...competitors].sort((a, b) => {
    const aT = a.is_dominator ? 3 : (a.tier ?? 99)
    const bT = b.is_dominator ? 3 : (b.tier ?? 99)
    return aT - bT
  })

  if (loading) {
    return (
      <div className="flex flex-col items-center text-center">
        <div className="w-10 h-10 border-2 border-zinc-700 border-t-white rounded-full animate-spin mb-6" />
        <div className="text-zinc-300 text-base mb-2">
          Searching YouTube for your competitors...
        </div>
        <div className="text-zinc-500 text-xs font-mono">
          We&apos;re finding 3 channels that match your niche and size
        </div>
      </div>
    )
  }

  if (timedOut && competitors.length === 0) {
    return (
      <div className="flex flex-col items-center text-center">
        <div className="text-zinc-300 text-base mb-2">
          We&apos;re still finding your competitors
        </div>
        <p className="text-zinc-500 text-sm mb-10 max-w-md">
          This is taking longer than usual. We&apos;ll keep working on it
          — you can add them manually later from the competitors page.
        </p>
        <button
          onClick={onNext}
          className="w-full sm:w-auto bg-white text-black px-8 py-3 text-sm font-medium hover:bg-zinc-200 transition-colors"
        >
          Continue →
        </button>
      </div>
    )
  }

  return (
    <div className="flex flex-col items-center text-center w-full">
      <div className="text-[11px] font-mono uppercase tracking-widest text-zinc-500 mb-4">
        We found your competitors
      </div>

      <h2
        className="text-3xl md:text-4xl mb-10 leading-tight"
        style={{ fontFamily: 'Instrument Serif, serif', fontWeight: 400 }}
      >
        These are the channels we&apos;ll{' '}
        <em className="italic text-amber-200">track for you</em>.
      </h2>

      <div className="w-full max-w-xl flex flex-col gap-3 mb-10">
        {sorted.map((c, idx) => {
          const tier = tierLabel(c)
          const initial = c.channel_name?.[0]?.toUpperCase() ?? '?'
          return (
            <div
              key={c.id}
              className="flex items-center gap-4 p-4 border border-zinc-800 bg-zinc-900/50 transition-all duration-500"
              style={{
                opacity: visible ? 1 : 0,
                transform: visible ? 'translateY(0)' : 'translateY(8px)',
                transitionDelay: `${idx * 200}ms`,
              }}
            >
              {c.channel_thumbnail ? (
                <img
                  src={c.channel_thumbnail}
                  alt={c.channel_name}
                  className="w-12 h-12 rounded-full border border-zinc-700 shrink-0"
                />
              ) : (
                <div className="w-12 h-12 rounded-full bg-zinc-800 border border-zinc-700 flex items-center justify-center text-zinc-500 text-lg shrink-0">
                  {initial}
                </div>
              )}
              <div className="flex-1 text-left min-w-0">
                <div className="text-white text-sm font-medium truncate">
                  {c.channel_name}
                </div>
                <div className="text-zinc-500 text-xs font-mono mt-0.5 truncate">
                  {formatSubs(c.subscriber_count)} subscribers
                  {c.sub_niche ? ` · ${c.sub_niche}` : ''}
                </div>
              </div>
              <div className={`text-[10px] font-mono uppercase tracking-wide px-2 py-1 border rounded-sm shrink-0 ${tier.color}`}>
                {tier.label}
              </div>
            </div>
          )
        })}
      </div>

      <p className="text-zinc-500 text-sm mb-8 max-w-md">
        We&apos;ll compare your metrics to theirs every day and tell you
        what they&apos;re doing differently.
      </p>

      <button
        onClick={onNext}
        className="w-full sm:w-auto bg-white text-black px-8 py-3 text-sm font-medium hover:bg-zinc-200 transition-colors"
      >
        Show me my analysis →
      </button>
    </div>
  )
}
