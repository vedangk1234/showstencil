/**
 * lib/access.ts
 * Plan gating for ShowStencil features.
 *
 * Usage:
 *   const allowed = await canAccess(userId, 'digest:weekly')
 *   const limit   = await getCompetitorLimit(userId)
 *   const msg     = getUpgradeMessage('competitors:10')
 */

import { createServiceClient } from '@/lib/supabase'
import type { PlanType, SubscriptionStatus } from '@/types'

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

interface PlanRow {
  subscription_status: SubscriptionStatus
  subscription_plan: PlanType
  trial_ends_at: string | null
}

async function getUserPlan(userId: string): Promise<PlanType> {
  const supabase = createServiceClient()

  const { data, error } = await supabase
    .from('users')
    .select('subscription_status, subscription_plan, trial_ends_at')
    .eq('id', userId)
    .single()

  if (error || !data) return 'free'

  const row = data as PlanRow
  const { subscription_status, subscription_plan, trial_ends_at } = row

  // Trial expired — treat as free
  if (subscription_status === 'on_trial' && trial_ends_at) {
    if (new Date(trial_ends_at) < new Date()) return 'free'
  }

  // Active, on_trial, or past_due (3-day grace) → use stored plan
  if (
    subscription_status === 'on_trial' ||
    subscription_status === 'active' ||
    subscription_status === 'past_due'
  ) {
    return subscription_plan ?? 'free'
  }

  // Cancelled, free, or anything else
  return 'free'
}

// ---------------------------------------------------------------------------
// Feature gate definitions
// ---------------------------------------------------------------------------
//
// Format: feature string → minimum plan required ('starter' | 'pro')
// Features not in this map are available to all plans (including free).
//
const FEATURE_GATES: Record<string, PlanType> = {
  'digest:weekly':  'starter',
  'alerts:daily':   'starter',
  'search:compare': 'pro',
}

// ---------------------------------------------------------------------------
// canAccess
// ---------------------------------------------------------------------------

/**
 * Returns true if the user's current plan allows the requested feature.
 *
 * Feature strings used internally and by consumers:
 *   Free:           competitors:3, ideas:3, viral:3, topics:3, archive:4
 *   Starter adds:   digest:weekly, alerts:daily
 *   Pro adds:       competitors:10, ideas:6, viral:10, topics:5, archive:12, search:compare
 *
 * Note: limit-based features (competitors:3, ideas:3, etc.) are NOT blocked
 * here — the caller should check the relevant getXxxLimit() function instead.
 * This function gates binary on/off features only.
 */
export async function canAccess(userId: string, feature: string): Promise<boolean> {
  const requiredPlan = FEATURE_GATES[feature]

  // Feature is available to all plans
  if (!requiredPlan) return true

  const plan = await getUserPlan(userId)

  if (requiredPlan === 'starter') {
    return plan === 'starter' || plan === 'pro'
  }

  if (requiredPlan === 'pro') {
    return plan === 'pro'
  }

  return false
}

// ---------------------------------------------------------------------------
// Limit helpers
// ---------------------------------------------------------------------------

/** Maximum number of competitors a user can track. */
export async function getCompetitorLimit(userId: string): Promise<number> {
  const plan = await getUserPlan(userId)
  return plan === 'pro' ? 10 : 3
}

/** Maximum number of video ideas generated per batch. Starter=3, Pro=10, Free=0. */
export async function getIdeaLimit(userId: string): Promise<number> {
  const plan = await getUserPlan(userId)
  if (plan === 'pro') return 10
  if (plan === 'starter') return 3
  return 0
}

/** Maximum number of viral videos shown. */
export async function getViralLimit(userId: string): Promise<number> {
  const plan = await getUserPlan(userId)
  return plan === 'pro' ? 10 : 3
}

/** Maximum number of uncovered topics shown. */
export async function getTopicLimit(userId: string): Promise<number> {
  const plan = await getUserPlan(userId)
  return plan === 'pro' ? 5 : 3
}

/** Number of weeks of digest/data archive accessible. */
export async function getArchiveWeeks(userId: string): Promise<number> {
  const plan = await getUserPlan(userId)
  return plan === 'pro' ? 12 : 4
}

// ---------------------------------------------------------------------------
// canGenerateThumbnail
// ---------------------------------------------------------------------------

export interface ThumbnailQuota {
  allowed: boolean
  reason?: 'upgrade_required' | 'quota_exceeded'
  quotaUsed: number
  quotaLimit: number
  quotaResetAt: Date | null
}

export async function canGenerateThumbnail(userId: string): Promise<ThumbnailQuota> {
  const supabase = createServiceClient()
  const plan = await getUserPlan(userId)

  const quotaLimits: Record<string, number> = { free: 0, starter: 12, pro: 40 }
  const quotaLimit = quotaLimits[plan] ?? 0

  if (plan === 'free') {
    return { allowed: false, reason: 'upgrade_required', quotaUsed: 0, quotaLimit: 0, quotaResetAt: null }
  }

  // Fetch user's quota state
  const { data: userRow } = await supabase
    .from('users')
    .select('thumbnails_generated_this_month, thumbnails_quota_reset_at')
    .eq('id', userId)
    .single()

  let quotaUsed: number = userRow?.thumbnails_generated_this_month ?? 0
  let resetAt: Date | null = userRow?.thumbnails_quota_reset_at
    ? new Date(userRow.thumbnails_quota_reset_at)
    : null

  // Auto-reset quota if period has expired
  if (!resetAt || resetAt < new Date()) {
    const newResetAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
    await supabase
      .from('users')
      .update({ thumbnails_generated_this_month: 0, thumbnails_quota_reset_at: newResetAt.toISOString() })
      .eq('id', userId)
    quotaUsed = 0
    resetAt = newResetAt
  }

  if (quotaUsed >= quotaLimit) {
    return { allowed: false, reason: 'quota_exceeded', quotaUsed, quotaLimit, quotaResetAt: resetAt }
  }

  return { allowed: true, quotaUsed, quotaLimit, quotaResetAt: resetAt }
}

// ---------------------------------------------------------------------------
// Upgrade messages
// ---------------------------------------------------------------------------

/**
 * Returns a friendly upgrade nudge for a feature.
 * Never says "you cannot" — always frames the upgrade positively.
 */
export function getUpgradeMessage(feature: string): string {
  const messages: Record<string, string> = {
    'search:compare':
      'Search and compare any YouTube channel is a Pro feature. Upgrade to Pro to instantly benchmark any creator against your channel.',
    'ideas:6':
      'Get 6 video ideas per week with Pro. Upgrade for more content opportunities every Monday.',
    'competitors:10':
      'Track up to 10 competitors with Pro. Upgrade to get deeper competitive intelligence.',
    'viral:10':
      'See up to 10 trending videos in your niche with Pro. Upgrade to stay ahead of every breakout moment.',
    'topics:5':
      'Unlock 5 uncovered topic suggestions with Pro. Upgrade to find more content gaps your competitors are missing.',
    'archive:12':
      'Access 12 weeks of history with Pro. Upgrade to spot long-term trends in your niche.',
    'digest:weekly':
      'Weekly digests are a Starter feature. Upgrade to get a personalised breakdown every Monday morning.',
    'alerts:daily':
      'Trend alerts are a Starter feature. Upgrade to get notified the same day a competitor video goes viral.',
  }

  return (
    messages[feature] ??
    'This feature requires an upgraded plan. Upgrade to unlock it.'
  )
}
