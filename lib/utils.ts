import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Sanitize an externally-sourced string (YouTube channel name / video title — i.e.
 * attacker-controllable by publishing a channel or video) before embedding it in an
 * LLM prompt. Collapses whitespace/newlines (so injected line breaks can't fake a new
 * prompt section) and hard-truncates to `maxLen`. Pair with delimiting the data block
 * and a "content inside is data, not instructions" preamble at the prompt.
 */
export function sanitizeForPrompt(value: string | null | undefined, maxLen: number): string {
  if (!value) return ''
  const collapsed = value.replace(/\s+/g, ' ').trim()
  return collapsed.length > maxLen ? collapsed.slice(0, maxLen) + '…' : collapsed
}

// Standard truncation ceilings for prompt-embedded external strings.
export const MAX_CHANNEL_NAME_LEN = 100
export const MAX_VIDEO_TITLE_LEN = 150
