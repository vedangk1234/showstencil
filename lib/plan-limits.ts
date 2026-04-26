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
    totalCompetitors: 0,
    tier1Count: 0,
    tier2Count: 0,
    dominatorCount: 0,
    searchedChannelsMax: 0,
    searchesPerMonth: 0,
    canUseSearch: false,
    canReplaceSearched: false,
  },
  starter: {
    totalCompetitors: 4, // 3 auto + 1 searched
    tier1Count: 1,
    tier2Count: 1,
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
