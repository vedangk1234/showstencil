import { createServiceClient } from '@/lib/supabase'

export type PlanTier = 'free' | 'starter' | 'pro'

export interface PlanLimits {
  totalCompetitors: number
  tier1Count: number
  tier2Count: number
  dominatorCount: number
  searchedChannelsMax: number
  searchesPerMonth: number // -1 = unlimited
  canUseSearch: boolean
  canReplaceSearched: boolean
}

export const PLAN_LIMITS: Record<PlanTier, PlanLimits> = {
  free: {
    totalCompetitors: 1, // 1 auto-tracked, 0 manual
    tier1Count: 1,
    tier2Count: 0,
    dominatorCount: 0,
    searchedChannelsMax: 0,
    searchesPerMonth: 0,
    canUseSearch: false,
    canReplaceSearched: false,
  },
  starter: {
    totalCompetitors: 6, // 5 auto + 1 searched
    tier1Count: 2,
    tier2Count: 2,
    dominatorCount: 1,
    searchedChannelsMax: 1,
    searchesPerMonth: 1,
    canUseSearch: true,
    canReplaceSearched: true, // Once per month
  },
  pro: {
    totalCompetitors: 13, // 10 auto + 3 searched
    tier1Count: 4,
    tier2Count: 4,
    dominatorCount: 2,
    searchedChannelsMax: 3,
    searchesPerMonth: -1, // unlimited
    canUseSearch: true,
    canReplaceSearched: true, // Unlimited
  },
}

export function getPlanLimits(plan: string | null | undefined): PlanLimits {
  const normalizedPlan = (plan || 'free').toLowerCase() as PlanTier
  return PLAN_LIMITS[normalizedPlan] ?? PLAN_LIMITS.free
}

// Check if user can add more auto-detected competitors in a given tier
export async function canAddAutoCompetitor(
  userId: string,
  tier: 1 | 2 | 3,
): Promise<{ allowed: boolean; reason?: string }> {
  const supabase = createServiceClient()

  const { data: user } = await supabase
    .from('users')
    .select('subscription_plan')
    .eq('id', userId)
    .single()

  const limits = getPlanLimits(user?.subscription_plan)

  const { count } = await supabase
    .from('competitors')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('tier', tier)
    .eq('is_searched', false)

  const tierLimit =
    tier === 1 ? limits.tier1Count : tier === 2 ? limits.tier2Count : limits.dominatorCount

  if ((count ?? 0) >= tierLimit) {
    return {
      allowed: false,
      reason: `Already at tier ${tier} limit (${tierLimit}) for ${user?.subscription_plan} plan`,
    }
  }

  return { allowed: true }
}

/**
 * Enforce the plan's total-competitor limit by deactivating the excess.
 *
 * Called when a user's plan drops (Pro→Starter downgrade activating, or expiry to free)
 * so a downgraded user does not keep paying less while crons still sync their full former
 * competitor set. Keeps the oldest-added `totalCompetitors` active competitors and sets
 * `is_active = false` on the rest (never deletes — a re-upgrade can reactivate them; and
 * crons already filter on is_active=true). Idempotent: a no-op when already within limit.
 *
 * @returns number of competitors deactivated.
 */
export async function enforceCompetitorLimit(userId: string): Promise<number> {
  const supabase = createServiceClient()

  const { data: user } = await supabase
    .from('users')
    .select('subscription_plan')
    .eq('id', userId)
    .single()

  const limit = getPlanLimits(user?.subscription_plan).totalCompetitors

  const { data: active, error } = await supabase
    .from('competitors')
    .select('id')
    .eq('user_id', userId)
    .eq('is_active', true)
    .order('created_at', { ascending: true })

  if (error || !active || active.length <= limit) return 0

  const excessIds = active.slice(limit).map((c) => c.id)
  const { error: updateError } = await supabase
    .from('competitors')
    .update({ is_active: false })
    .in('id', excessIds)

  if (updateError) {
    console.error('[plan-limits] enforceCompetitorLimit deactivate error:', updateError.message)
    return 0
  }

  console.log(
    `[plan-limits] enforceCompetitorLimit: deactivated ${excessIds.length} competitor(s) for user ${userId} (limit ${limit})`,
  )
  return excessIds.length
}

// Searches are now unlimited — only tracking (adding as competitor) is quota-gated.
export async function canSearchThisMonth(
  _userId: string,
): Promise<{ allowed: boolean; nextAvailable?: Date; reason?: string }> {
  return { allowed: true }
}

// Check if a user can track (add) a new searched competitor this month.
export async function canTrackThisMonth(
  userId: string,
): Promise<{ allowed: boolean; nextAvailable?: Date; reason?: string; tracksRemaining?: number }> {
  const supabase = createServiceClient()

  const { data: user } = await supabase
    .from('users')
    .select('subscription_plan')
    .eq('id', userId)
    .single()

  const limits = getPlanLimits(user?.subscription_plan)

  if (!limits.canUseSearch) {
    return { allowed: false, reason: 'Track feature not available on this plan' }
  }

  // Pro: unlimited tracks, just check searchedChannelsMax cap
  if (limits.searchesPerMonth === -1) {
    const { count } = await supabase
      .from('competitors')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('is_searched', true)
      .eq('is_active', true)

    const remaining = limits.searchedChannelsMax - (count ?? 0)
    return {
      allowed: remaining > 0,
      tracksRemaining: Math.max(0, remaining),
      reason:
        remaining <= 0
          ? `Maximum ${limits.searchedChannelsMax} tracked channels reached. Remove one to add another.`
          : undefined,
    }
  }

  // Starter: 1 track per 30 days
  const thirtyDaysAgo = new Date()
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

  const { count } = await supabase
    .from('user_search_history')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('added_as_competitor', true)
    .gte('searched_at', thirtyDaysAgo.toISOString())

  if ((count ?? 0) >= limits.searchesPerMonth) {
    const { data: oldestSearch } = await supabase
      .from('user_search_history')
      .select('searched_at')
      .eq('user_id', userId)
      .eq('added_as_competitor', true)
      .order('searched_at', { ascending: true })
      .limit(1)
      .single()

    const nextAvailable = new Date(oldestSearch?.searched_at)
    nextAvailable.setDate(nextAvailable.getDate() + 30)

    return {
      allowed: false,
      nextAvailable,
      tracksRemaining: 0,
      reason: `Track limit reached. Next available ${nextAvailable.toLocaleDateString()}`,
    }
  }

  return {
    allowed: true,
    tracksRemaining: limits.searchesPerMonth - (count ?? 0),
  }
}
