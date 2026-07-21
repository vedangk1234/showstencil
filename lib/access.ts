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
  current_period_end: string | null
}

/**
 * Resolves a user's effective plan (accounting for trial expiry, grace periods, etc.).
 * Exported so a request that checks several gates can resolve the plan ONCE and pass
 * it into the gate helpers below (each accepts an optional pre-fetched `plan`), instead
 * of issuing an identical query per gate.
 */
export async function resolveUserPlan(userId: string): Promise<PlanType> {
  const supabase = createServiceClient()

  const { data, error } = await supabase
    .from('users')
    .select('subscription_status, subscription_plan, trial_ends_at, current_period_end')
    .eq('id', userId)
    .single()

  if (error || !data) return 'free'

  const row = data as PlanRow
  const { subscription_status, subscription_plan, trial_ends_at, current_period_end } = row

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

  // Cancelled but still within the paid billing period → keep stored plan
  if (subscription_status === 'cancelled' && current_period_end) {
    if (new Date(current_period_end) > new Date()) {
      return subscription_plan ?? 'free'
    }
  }

  // Expired, free, cancelled-past-period, or anything else
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
  'alerts:daily':   'starter',
  'search:compare': 'pro',
  'insights:ai':    'starter',
}

// ---------------------------------------------------------------------------
// canAccess
// ---------------------------------------------------------------------------

/**
 * Returns true if the user's current plan allows the requested binary feature.
 *
 * Binary gates (see FEATURE_GATES): 'alerts:daily' (starter+), 'insights:ai' (starter+),
 * 'search:compare' (pro only). Features not in the map are available to all plans.
 *
 * Limit-based features are NOT gated here — use the getXxxLimit() helpers, whose
 * actual current values are: competitors free 1 / starter 6 / pro 13; ideas free 1 /
 * starter 3 / pro 10; viral 3 / pro 10; topics 3 / pro 5; archive 4 wks / pro 12;
 * thumbnails free 0 / starter 12 / pro 40.
 */
export async function canAccess(userId: string, feature: string, prefetchedPlan?: PlanType): Promise<boolean> {
  const requiredPlan = FEATURE_GATES[feature]

  // Feature is available to all plans
  if (!requiredPlan) return true

  const plan = prefetchedPlan ?? await resolveUserPlan(userId)

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

/** Maximum number of competitors a user can track (total slots including manual). */
export async function getCompetitorLimit(userId: string, prefetchedPlan?: PlanType): Promise<number> {
  const plan = prefetchedPlan ?? await resolveUserPlan(userId)
  if (plan === 'pro') return 13     // 10 auto + 3 manual
  if (plan === 'starter') return 6  // 5 auto + 1 manual
  return 1                          // 1 auto, 0 manual
}

/** Maximum number of video ideas generated per batch. Free=1, Starter=3, Pro=10. */
export async function getIdeaLimit(userId: string, prefetchedPlan?: PlanType): Promise<number> {
  const plan = prefetchedPlan ?? await resolveUserPlan(userId)
  if (plan === 'pro') return 10
  if (plan === 'starter') return 3
  return 1
}

/** Maximum number of viral videos shown. */
export async function getViralLimit(userId: string, prefetchedPlan?: PlanType): Promise<number> {
  const plan = prefetchedPlan ?? await resolveUserPlan(userId)
  return plan === 'pro' ? 10 : 3
}

/** Maximum number of uncovered topics shown. */
export async function getTopicLimit(userId: string, prefetchedPlan?: PlanType): Promise<number> {
  const plan = prefetchedPlan ?? await resolveUserPlan(userId)
  return plan === 'pro' ? 5 : 3
}

/** Number of weeks of digest/data archive accessible. */
export async function getArchiveWeeks(userId: string, prefetchedPlan?: PlanType): Promise<number> {
  const plan = prefetchedPlan ?? await resolveUserPlan(userId)
  return plan === 'pro' ? 12 : 4
}

const THUMBNAIL_QUOTA_LIMITS: Record<string, number> = { free: 0, starter: 12, pro: 40 }
const THUMBNAIL_RESET_DAYS = 30

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

/**
 * READ-ONLY quota check for display (e.g. the Ideas page shows remaining quota).
 * Does not mutate anything — the racy read-modify-write reset was removed; instead the
 * effective used count is computed as 0 when the reset window has elapsed. The actual
 * reservation is done atomically by reserveThumbnail() at generation time.
 */
export async function canGenerateThumbnail(userId: string, prefetchedPlan?: PlanType): Promise<ThumbnailQuota> {
  const supabase = createServiceClient()
  const plan = prefetchedPlan ?? await resolveUserPlan(userId)
  const quotaLimit = THUMBNAIL_QUOTA_LIMITS[plan] ?? 0

  if (plan === 'free') {
    return { allowed: false, reason: 'upgrade_required', quotaUsed: 0, quotaLimit: 0, quotaResetAt: null }
  }

  const { data: userRow } = await supabase
    .from('users')
    .select('thumbnails_generated_this_month, thumbnails_quota_reset_at')
    .eq('id', userId)
    .single()

  const resetAt: Date | null = userRow?.thumbnails_quota_reset_at
    ? new Date(userRow.thumbnails_quota_reset_at)
    : null

  // Effective used = 0 once the window has elapsed (the atomic reset happens on the
  // next reserve). No write here — this is a pure read for UI.
  const windowElapsed = !resetAt || resetAt < new Date()
  const quotaUsed = windowElapsed ? 0 : (userRow?.thumbnails_generated_this_month ?? 0)

  if (quotaUsed >= quotaLimit) {
    return { allowed: false, reason: 'quota_exceeded', quotaUsed, quotaLimit, quotaResetAt: resetAt }
  }

  return { allowed: true, quotaUsed, quotaLimit, quotaResetAt: resetAt }
}

/**
 * ATOMIC quota reservation for the generation write path. Calls the
 * reserve_thumbnail_quota RPC (atomic monthly-reset + under-limit increment) so two
 * concurrent generations can never both slip past the limit. Call releaseThumbnail()
 * if generation subsequently fails, so a failure never permanently consumes quota.
 */
export async function reserveThumbnail(userId: string, prefetchedPlan?: PlanType): Promise<ThumbnailQuota> {
  const supabase = createServiceClient()
  const plan = prefetchedPlan ?? await resolveUserPlan(userId)
  const quotaLimit = THUMBNAIL_QUOTA_LIMITS[plan] ?? 0

  if (plan === 'free') {
    return { allowed: false, reason: 'upgrade_required', quotaUsed: 0, quotaLimit: 0, quotaResetAt: null }
  }

  const { data, error } = await supabase.rpc('reserve_thumbnail_quota', {
    p_user_id: userId,
    p_limit: quotaLimit,
    p_reset_days: THUMBNAIL_RESET_DAYS,
  })

  if (error) {
    console.error('[access] reserve_thumbnail_quota RPC error:', error.message)
    // Fail closed — do not allow a generation we couldn't atomically reserve.
    return { allowed: false, reason: 'quota_exceeded', quotaUsed: quotaLimit, quotaLimit, quotaResetAt: null }
  }

  const row = Array.isArray(data) ? data[0] : data
  const quotaUsed: number = row?.quota_used ?? quotaLimit
  const quotaResetAt: Date | null = row?.quota_reset_at ? new Date(row.quota_reset_at) : null

  if (!row?.allowed) {
    return { allowed: false, reason: 'quota_exceeded', quotaUsed, quotaLimit, quotaResetAt }
  }

  return { allowed: true, quotaUsed, quotaLimit, quotaResetAt }
}

/** Refund one reserved thumbnail (floored at 0) after a failed generation. */
export async function releaseThumbnail(userId: string): Promise<void> {
  const supabase = createServiceClient()
  const { error } = await supabase.rpc('release_thumbnail_quota', { p_user_id: userId })
  if (error) {
    console.error('[access] release_thumbnail_quota RPC error:', error.message)
  }
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
    'alerts:daily':
      'Trend alerts are a Starter feature. Upgrade to get notified the same day a competitor video goes viral.',
    'insights:ai':
      'AI Competitor Insights are available on Starter and Pro plans. Upgrade to unlock deep AI-powered analysis comparing you to each competitor.',
  }

  return (
    messages[feature] ??
    'This feature requires an upgraded plan. Upgrade to unlock it.'
  )
}
