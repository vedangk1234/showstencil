'use client'

import { useEffect, useState } from 'react'

interface Props {
  onNext: () => void
}

const NICHE_OPTIONS: Array<{ id: string; label: string }> = [
  { id: 'finance', label: 'Finance' },
  { id: 'tech', label: 'Technology' },
  { id: 'gaming', label: 'Gaming' },
  { id: 'cooking', label: 'Cooking' },
  { id: 'fitness', label: 'Fitness' },
  { id: 'beauty', label: 'Beauty' },
  { id: 'travel', label: 'Travel' },
  { id: 'education', label: 'Education' },
  { id: 'business', label: 'Business' },
  { id: 'entertainment', label: 'Entertainment' },
  { id: 'diy', label: 'DIY' },
  { id: 'vlog', label: 'Vlog' },
]

export default function StepConfirmNiche({ onNext }: Props) {
  const [niche, setNiche] = useState<string>('')
  const [originalNiche, setOriginalNiche] = useState<string>('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    let cancelled = false
    let attempts = 0
    const maxAttempts = 20

    const poll = async () => {
      try {
        const res = await fetch('/api/user/profile')
        const data = await res.json() as { niche_id?: string | null }
        if (cancelled) return

        if (data.niche_id) {
          setNiche(data.niche_id)
          setOriginalNiche(data.niche_id)
          setLoading(false)
        } else if (attempts < maxAttempts) {
          attempts++
          setTimeout(poll, 1500)
        } else {
          // Polling timed out — don't silently default to 'finance'.
          // Leave niche blank so the user must make an explicit choice.
          setNiche('')
          setOriginalNiche('')
          setLoading(false)
        }
      } catch {
        if (!cancelled) {
          setNiche('')
          setOriginalNiche('')
          setLoading(false)
        }
      }
    }

    poll()
    return () => { cancelled = true }
  }, [])

  const handleNext = async () => {
    if (niche !== originalNiche && niche !== '') {
      setSaving(true)
      try {
        await fetch('/api/user/profile', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ niche_id: niche }),
        })
      } catch {
        // Continue anyway
      }
      setSaving(false)
    }
    onNext()
  }

  if (loading) {
    return (
      <div className="flex flex-col items-center text-center">
        <div className="w-10 h-10 border-2 border-zinc-700 border-t-white rounded-full animate-spin mb-6" />
        <div className="text-zinc-400 text-sm">
          Analysing your videos to detect your niche...
        </div>
        <div className="text-zinc-600 text-xs mt-2 font-mono">
          This usually takes a few seconds
        </div>
      </div>
    )
  }

  const currentLabel = NICHE_OPTIONS.find(n => n.id === niche)?.label ?? niche
  const detected = niche !== '' && originalNiche !== ''

  return (
    <div className="flex flex-col items-center text-center">
      <div className="text-[11px] font-mono uppercase tracking-widest text-zinc-500 mb-4">
        {detected ? 'We detected your niche' : 'Select your niche'}
      </div>

      <h2
        className="text-4xl md:text-5xl mb-3 leading-tight"
        style={{ fontFamily: 'Instrument Serif, serif', fontWeight: 400 }}
      >
        {detected ? (
          <>
            Based on your recent videos, you create{' '}
            <em className="italic text-amber-200">{currentLabel}</em> content.
          </>
        ) : (
          <>What type of content do you create?</>
        )}
      </h2>

      <p className="text-zinc-400 text-base mb-10">
        {detected ? 'Is that right?' : 'Pick the option that best describes your channel.'}
      </p>

      <div className="w-full max-w-sm mb-10">
        <select
          value={niche}
          onChange={(e) => setNiche(e.target.value)}
          className="w-full bg-zinc-900 border border-zinc-700 text-white px-4 py-3 text-sm font-mono focus:outline-none focus:border-zinc-500 transition-colors"
        >
          {!detected && niche === '' && (
            <option value="" disabled>Select your niche…</option>
          )}
          {NICHE_OPTIONS.map(opt => (
            <option key={opt.id} value={opt.id}>{opt.label}</option>
          ))}
        </select>
        {niche !== originalNiche && niche !== '' && (
          <div className="text-xs text-amber-400 mt-2 font-mono">
            Updating to {currentLabel}
          </div>
        )}
      </div>

      <button
        onClick={handleNext}
        disabled={saving || niche === ''}
        className="w-full sm:w-auto bg-white text-black px-8 py-3 text-sm font-medium hover:bg-zinc-200 transition-colors disabled:opacity-60"
      >
        {saving ? 'Saving...' : detected ? "That's right →" : 'Confirm niche →'}
      </button>
    </div>
  )
}
