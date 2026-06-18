'use client'

import { useMemo, useState } from 'react'
import {
  NICHES,
  getNicheBySlug,
  isValidNicheSlug,
  type NicheDefinition,
  type ValidNicheSlug,
} from '@/lib/niches'

const OTHER_SENTINEL = 'other'
const MIN_DESCRIPTION_CHARS = 50

export interface NichePickerSelection {
  /** Top-level niche slug (a ValidNicheSlug) or 'other'. */
  nicheSlug: string
  /** Sub-niche slug, null when the user picked 'Other' (at either level). */
  subNicheSlug: string | null
  /** Free-text description. Empty unless an 'Other' branch was taken. */
  description: string
}

interface NichePickerProps {
  initialNicheSlug?: ValidNicheSlug | typeof OTHER_SENTINEL | null
  initialSubNicheSlug?: string | null
  initialDescription?: string
  onSubmit: (selection: NichePickerSelection) => Promise<void>
  submitButtonLabel?: string
}

function sortedByDisplayName(list: readonly NicheDefinition[]): NicheDefinition[] {
  return [...list].sort((a, b) => a.displayName.localeCompare(b.displayName))
}

function isOtherTopLevel(value: string): value is typeof OTHER_SENTINEL {
  return value === OTHER_SENTINEL
}

export default function NichePicker({
  initialNicheSlug,
  initialSubNicheSlug,
  initialDescription,
  onSubmit,
  submitButtonLabel = 'Continue',
}: NichePickerProps) {
  // Top-level slugs include the 31 valid niches + 'other'. Anything else we get
  // as an initial value (e.g. a legacy niche_id like 'finance') is ignored.
  const normalisedInitialNiche: string =
    initialNicheSlug != null &&
    (initialNicheSlug === OTHER_SENTINEL || isValidNicheSlug(initialNicheSlug))
      ? initialNicheSlug
      : ''

  const [selectedNiche, setSelectedNiche] = useState<string>(normalisedInitialNiche)
  const [selectedSub, setSelectedSub] = useState<string>(initialSubNicheSlug ?? '')
  const [description, setDescription] = useState<string>(initialDescription ?? '')
  const [submitting, setSubmitting] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const sortedNiches = useMemo(() => sortedByDisplayName(NICHES), [])

  // Sub-niche options for the currently chosen top-level niche, sorted by display name.
  const subOptions = useMemo(() => {
    if (!selectedNiche || isOtherTopLevel(selectedNiche)) return []
    const def = getNicheBySlug(selectedNiche)
    if (!def) return []
    return [...def.subNiches].sort((a, b) => a.displayName.localeCompare(b.displayName))
  }, [selectedNiche])

  const otherAtTop = isOtherTopLevel(selectedNiche)
  const otherAtSub = !otherAtTop && selectedSub === OTHER_SENTINEL
  const descriptionRequired = otherAtTop || otherAtSub
  const descriptionTrimmed = description.trim()
  const descriptionValid = descriptionTrimmed.length >= MIN_DESCRIPTION_CHARS

  const canSubmit = (() => {
    if (!selectedNiche) return false
    if (otherAtTop) return descriptionValid
    if (!selectedSub) return false
    if (otherAtSub) return descriptionValid
    return true
  })()

  const handleNicheChange = (value: string) => {
    setSelectedNiche(value)
    setSelectedSub('')
    if (!isOtherTopLevel(value)) setDescription('')
    setErrorMessage(null)
  }

  const handleSubChange = (value: string) => {
    setSelectedSub(value)
    if (value !== OTHER_SENTINEL) setDescription('')
    setErrorMessage(null)
  }

  const handleSubmit = async () => {
    if (!canSubmit || submitting) return
    setSubmitting(true)
    setErrorMessage(null)
    try {
      // Phase 7 wire format (api/user/niche/manual):
      //   - top-level 'other' → subNicheSlug omitted (null) — the freeform niche
      //     has no structured children to identify.
      //   - sub-level 'other' → subNicheSlug = 'other' literal, so the API can
      //     tell apart "user explicitly picked Other at the sub level" (description
      //     required) from "user chose a real sub-niche".
      const subSlugForApi: string | null = otherAtTop
        ? null
        : otherAtSub
          ? OTHER_SENTINEL
          : selectedSub
      await onSubmit({
        nicheSlug: selectedNiche,
        subNicheSlug: subSlugForApi,
        description: descriptionRequired ? descriptionTrimmed : '',
      })
    } catch (err) {
      const message =
        err instanceof Error && err.message ? err.message : 'Something went wrong. Please try again.'
      setErrorMessage(message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="w-full max-w-md mx-auto flex flex-col gap-5">
      {/* Top-level niche dropdown */}
      <label className="flex flex-col gap-2">
        <span className="text-[11px] font-mono uppercase tracking-widest text-zinc-500">
          Your niche
        </span>
        <select
          value={selectedNiche}
          onChange={(e) => handleNicheChange(e.target.value)}
          className="w-full bg-zinc-900 border border-zinc-700 text-white px-4 py-3 text-sm font-mono focus:outline-none focus:border-zinc-500 transition-colors"
        >
          <option value="" disabled>
            Select a niche…
          </option>
          {sortedNiches.map((n) => (
            <option key={n.slug} value={n.slug}>
              {n.displayName}
            </option>
          ))}
          <option value={OTHER_SENTINEL}>Other — describe below</option>
        </select>
      </label>

      {/* Sub-niche dropdown (only when a real top-level niche is chosen) */}
      {selectedNiche && !otherAtTop && (
        <label className="flex flex-col gap-2">
          <span className="text-[11px] font-mono uppercase tracking-widest text-zinc-500">
            Sub-niche
          </span>
          <select
            value={selectedSub}
            onChange={(e) => handleSubChange(e.target.value)}
            className="w-full bg-zinc-900 border border-zinc-700 text-white px-4 py-3 text-sm font-mono focus:outline-none focus:border-zinc-500 transition-colors"
          >
            <option value="" disabled>
              Select a sub-niche…
            </option>
            {subOptions.map((s) => (
              <option key={s.slug} value={s.slug}>
                {s.displayName}
              </option>
            ))}
            <option value={OTHER_SENTINEL}>Other — describe below</option>
          </select>
        </label>
      )}

      {/* Description textarea (only when an Other branch was taken) */}
      {descriptionRequired && (
        <label className="flex flex-col gap-2">
          <span className="text-[11px] font-mono uppercase tracking-widest text-zinc-500">
            {otherAtTop ? 'Describe your channel' : 'Describe your sub-niche'}
          </span>
          <span className="text-xs text-zinc-500">
            3–5 sentences. This helps us find competitor channels for you.
          </span>
          <textarea
            value={description}
            onChange={(e) => {
              setDescription(e.target.value)
              setErrorMessage(null)
            }}
            rows={6}
            placeholder="What do you make videos about? Who do you make them for? What angle or format makes your channel different?"
            className="w-full bg-zinc-900 border border-zinc-700 text-white px-4 py-3 text-sm font-mono leading-relaxed focus:outline-none focus:border-zinc-500 transition-colors min-h-[8rem] resize-y"
          />
          <span
            className={`text-xs font-mono ${
              descriptionValid ? 'text-emerald-400' : 'text-zinc-500'
            }`}
          >
            {descriptionTrimmed.length} / {MIN_DESCRIPTION_CHARS} characters minimum
          </span>
        </label>
      )}

      {errorMessage && (
        <div className="text-xs font-mono text-red-400 text-center">{errorMessage}</div>
      )}

      <button
        onClick={handleSubmit}
        disabled={!canSubmit || submitting}
        className="w-full sm:w-auto self-center bg-white text-black px-8 py-3 text-sm font-medium hover:bg-zinc-200 transition-colors disabled:opacity-60 disabled:cursor-not-allowed mt-2"
      >
        {submitting ? 'Saving…' : `${submitButtonLabel} →`}
      </button>
    </div>
  )
}
