'use client'

import { useEffect, useRef, useState } from 'react'
import NichePicker, { type NichePickerSelection } from './NichePicker'
import { getDisplayName, isValidNicheSlug, type ValidNicheSlug } from '@/lib/niches'

interface Props {
  onNext: () => void
}

interface ProfileResponse {
  niche_id?: string | null
  confidence?: number | null
  requiresManualSelection?: boolean | null
}

type Mode = 'loading' | 'confirm-detected' | 'picker'

const CONFIDENCE_THRESHOLD = 0.6
const POLL_INTERVAL_MS = 1500
const MAX_POLL_ATTEMPTS = 20

export default function StepConfirmNiche({ onNext }: Props) {
  const [mode, setMode] = useState<Mode>('loading')
  // Detected slug is whatever the API returned — may not match VALID_NICHE_SLUGS
  // (legacy/Phase-7 transitional case). getDisplayName handles that gracefully.
  const [detectedSlug, setDetectedSlug] = useState<string | null>(null)
  // Only set when the API returns a slug that's a valid current top-level niche,
  // so NichePicker can pre-select it. Sub-niche and confidence are left to the
  // picker (the user's job here is to confirm or pick — not to drill into a sub).
  const [prefillNicheSlug, setPrefillNicheSlug] = useState<ValidNicheSlug | null>(null)
  const [savingConfirmation, setSavingConfirmation] = useState(false)
  const [confirmError, setConfirmError] = useState<string | null>(null)
  // Tracks whether the polling effect has already settled — prevents a late
  // poll response from overwriting the user's choice if they opened the picker
  // before the API answered.
  const settledRef = useRef(false)

  useEffect(() => {
    let cancelled = false
    let attempts = 0

    const poll = async () => {
      try {
        const res = await fetch('/api/user/profile')
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const data = (await res.json()) as ProfileResponse
        if (cancelled || settledRef.current) return

        const requiresManual = data.requiresManualSelection === true
        const slug = typeof data.niche_id === 'string' && data.niche_id.length > 0 ? data.niche_id : null
        const confidence = typeof data.confidence === 'number' ? data.confidence : null

        // Phase 7 contract: explicit requiresManualSelection wins. Until that
        // field ships, fall back to confidence threshold; if confidence is
        // absent and we have a slug, treat detection as successful (current
        // production behaviour).
        const highConfidence =
          slug != null &&
          !requiresManual &&
          (confidence == null || confidence >= CONFIDENCE_THRESHOLD)

        if (requiresManual) {
          settledRef.current = true
          setDetectedSlug(slug)
          setPrefillNicheSlug(slug && isValidNicheSlug(slug) ? slug : null)
          setMode('picker')
          return
        }

        if (highConfidence && slug) {
          settledRef.current = true
          setDetectedSlug(slug)
          setPrefillNicheSlug(isValidNicheSlug(slug) ? slug : null)
          setMode('confirm-detected')
          return
        }

        if (slug && confidence != null && confidence < CONFIDENCE_THRESHOLD) {
          // Detection ran but confidence is too low — push straight to picker.
          settledRef.current = true
          setDetectedSlug(slug)
          setPrefillNicheSlug(isValidNicheSlug(slug) ? slug : null)
          setMode('picker')
          return
        }

        if (attempts < MAX_POLL_ATTEMPTS) {
          attempts++
          setTimeout(poll, POLL_INTERVAL_MS)
          return
        }

        // Polling timed out with no detection result. Open the picker so the
        // user can make an explicit choice rather than us guessing.
        settledRef.current = true
        setDetectedSlug(null)
        setPrefillNicheSlug(null)
        setMode('picker')
      } catch {
        if (cancelled || settledRef.current) return
        if (attempts < MAX_POLL_ATTEMPTS) {
          attempts++
          setTimeout(poll, POLL_INTERVAL_MS)
          return
        }
        settledRef.current = true
        setDetectedSlug(null)
        setPrefillNicheSlug(null)
        setMode('picker')
      }
    }

    poll()
    return () => {
      cancelled = true
    }
  }, [])

  const handleConfirmDetected = async () => {
    if (!detectedSlug || savingConfirmation) return
    setSavingConfirmation(true)
    setConfirmError(null)
    try {
      // Phase 7 will replace this with a single POST /api/user/niche/manual call
      // that handles confirmation too. For now we just advance — the niche is
      // already saved by the sync flow.
      onNext()
    } catch (err) {
      setConfirmError(
        err instanceof Error && err.message ? err.message : 'Could not save. Please try again.',
      )
      setSavingConfirmation(false)
    }
  }

  const handleWrongNiche = () => {
    settledRef.current = true
    setMode('picker')
  }

  const handlePickerSubmit = async (selection: NichePickerSelection) => {
    // Phase 7 API: POST /api/user/niche/manual — accepts camelCase fields.
    // Surface a 4xx as an error so the picker can show it to the user; any
    // other failure (network blip, 5xx) is logged and the wizard advances.
    try {
      const res = await fetch('/api/user/niche/manual', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nicheSlug: selection.nicheSlug,
          subNicheSlug: selection.subNicheSlug,
          description: selection.description,
        }),
      })
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string }
        if (res.status >= 400 && res.status < 500) {
          throw new Error(data.error ?? 'Could not save your niche. Please try again.')
        }
        // eslint-disable-next-line no-console
        console.warn('[StepConfirmNiche] manual niche save returned', res.status)
      }
    } catch (err) {
      if (err instanceof Error && err.message) {
        // Re-throw so NichePicker surfaces the validation message to the user.
        throw err
      }
      // eslint-disable-next-line no-console
      console.warn('[StepConfirmNiche] manual niche save failed', err)
    }
    onNext()
  }

  if (mode === 'loading') {
    return (
      <div className="flex flex-col items-center text-center">
        <div className="w-10 h-10 border-2 border-zinc-700 border-t-white rounded-full animate-spin mb-6" />
        <div className="text-zinc-400 text-sm">Analysing your channel…</div>
        <div className="text-zinc-600 text-xs mt-2 font-mono">
          This usually takes a few seconds
        </div>
      </div>
    )
  }

  if (mode === 'confirm-detected' && detectedSlug) {
    const detectedDisplay = getDisplayName(detectedSlug)
    return (
      <div className="flex flex-col items-center text-center">
        <div className="text-[11px] font-mono uppercase tracking-widest text-zinc-500 mb-4">
          We detected your niche
        </div>

        <h2
          className="text-4xl md:text-5xl mb-3 leading-tight"
          style={{ fontFamily: 'Instrument Serif, serif', fontWeight: 400 }}
        >
          Based on your recent videos, you create{' '}
          <em className="italic text-amber-200">{detectedDisplay}</em> content.
        </h2>

        <p className="text-zinc-400 text-base mb-10">Is that right?</p>

        {confirmError && (
          <div className="text-xs font-mono text-red-400 mb-4">{confirmError}</div>
        )}

        <div className="flex flex-col sm:flex-row gap-3 w-full sm:w-auto">
          <button
            onClick={handleConfirmDetected}
            disabled={savingConfirmation}
            className="w-full sm:w-auto bg-white text-black px-8 py-3 text-sm font-medium hover:bg-zinc-200 transition-colors disabled:opacity-60"
          >
            {savingConfirmation ? 'Saving…' : "That's right →"}
          </button>
          <button
            onClick={handleWrongNiche}
            disabled={savingConfirmation}
            className="w-full sm:w-auto border border-zinc-700 text-zinc-400 px-6 py-3 text-sm hover:border-zinc-500 hover:text-zinc-200 transition-colors disabled:opacity-60"
          >
            Wrong niche
          </button>
        </div>
      </div>
    )
  }

  // Picker mode (Case B or "Wrong niche" tap-through from Case A).
  const headerCopy = detectedSlug
    ? "We weren't fully sure — pick the option that fits your channel best."
    : "We couldn't confidently identify your niche. Please pick one below."

  return (
    <div className="flex flex-col items-center text-center w-full">
      <div className="text-[11px] font-mono uppercase tracking-widest text-zinc-500 mb-4">
        Select your niche
      </div>

      <h2
        className="text-4xl md:text-5xl mb-3 leading-tight"
        style={{ fontFamily: 'Instrument Serif, serif', fontWeight: 400 }}
      >
        What type of content do you create?
      </h2>

      <p className="text-zinc-400 text-base mb-10 max-w-md">{headerCopy}</p>

      <NichePicker
        initialNicheSlug={prefillNicheSlug ?? null}
        onSubmit={handlePickerSubmit}
        submitButtonLabel="Confirm niche"
      />
    </div>
  )
}
