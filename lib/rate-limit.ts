/**
 * lib/rate-limit.ts
 * DB-backed per-user, per-endpoint fixed-window rate limiter.
 *
 * Backs the expensive AI endpoints (ideas/generate, generate-thumbnail,
 * competitors/insights, competitors/track) so a scripted loop can't run up real
 * Claude/Gemini/YouTube spend. Uses the check_rate_limit SQL function (atomic
 * count-and-test across a minute and a day window). Fails OPEN on RPC error so a
 * transient DB hiccup never blocks legitimate traffic.
 */

import { createServiceClient } from '@/lib/supabase'

export interface RateLimitConfig {
  perMinute: number
  perDay: number
}

// Sensible defaults for user-triggered AI actions.
export const DEFAULT_RATE_LIMIT: RateLimitConfig = { perMinute: 10, perDay: 100 }

/**
 * Returns true if the request is within limits (allowed), false if it should be
 * rejected with 429. `endpoint` is a stable identifier, e.g. 'ideas/generate'.
 */
export async function checkRateLimit(
  userId: string,
  endpoint: string,
  config: RateLimitConfig = DEFAULT_RATE_LIMIT,
): Promise<boolean> {
  const supabase = createServiceClient()
  const { data, error } = await supabase.rpc('check_rate_limit', {
    p_user_id: userId,
    p_endpoint: endpoint,
    p_per_min: config.perMinute,
    p_per_day: config.perDay,
  })

  if (error) {
    console.error(`[rate-limit] check_rate_limit RPC error for ${endpoint}:`, error.message)
    return true // fail open
  }

  return data === true
}
