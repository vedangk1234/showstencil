import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import { createServiceClient } from '@/lib/supabase'
import { getRecentIdeasBatch } from '@/lib/db'
import { getIdeaLimit } from '@/lib/access'
import { IdeasClient } from '@/components/ideas/IdeasClient'
import type { PlanType } from '@/types'

// ─── Plan resolution (mirrors the route logic) ────────────────────────────────

function resolvePlan(row: {
  subscription_status: string | null
  subscription_plan: string | null
  trial_ends_at: string | null
} | null): PlanType {
  if (!row) return 'free'
  const { subscription_status, subscription_plan, trial_ends_at } = row
  if (subscription_status === 'on_trial' && trial_ends_at && new Date(trial_ends_at) < new Date()) return 'free'
  if (
    subscription_status === 'on_trial' ||
    subscription_status === 'active' ||
    subscription_status === 'past_due'
  ) {
    return (subscription_plan as PlanType) ?? 'free'
  }
  return 'free'
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function IdeasPage() {
  const session = await auth()
  if (!session) redirect('/login')

  const userId = session.user.id
  const supabase = createServiceClient()

  // Load plan info and recent ideas in parallel
  const [userRow, ideas, ideaLimit] = await Promise.all([
    supabase
      .from('users')
      .select('subscription_status, subscription_plan, trial_ends_at')
      .eq('id', userId)
      .single()
      .then((r) => r.data),
    getRecentIdeasBatch(userId),
    getIdeaLimit(userId),
  ])

  const plan = resolvePlan(userRow)

  // Is this batch "fresh" (generated within the last 7 days)?
  const latestGeneratedAt = ideas.length > 0 ? new Date(ideas[0].generated_at) : null
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
  const isFresh = latestGeneratedAt !== null && latestGeneratedAt > sevenDaysAgo

  // Compute regenerateAvailableAt
  let regenerateAvailableAt: string | null = null
  if (isFresh && latestGeneratedAt) {
    if (plan === 'starter') {
      const now = new Date()
      const nextYear = now.getUTCMonth() === 11 ? now.getUTCFullYear() + 1 : now.getUTCFullYear()
      const nextMonth = (now.getUTCMonth() + 1) % 12
      regenerateAvailableAt = new Date(Date.UTC(nextYear, nextMonth, 1)).toISOString()
    } else if (plan === 'pro') {
      const sevenDaysFromGenerated = new Date(latestGeneratedAt.getTime() + 7 * 24 * 60 * 60 * 1000)
      if (sevenDaysFromGenerated > new Date()) {
        regenerateAvailableAt = sevenDaysFromGenerated.toISOString()
      }
    }
  }

  return (
    <IdeasClient
      initialIdeas={ideas}
      isFresh={isFresh}
      plan={plan}
      regenerateAvailableAt={regenerateAvailableAt}
      ideaLimit={ideaLimit}
    />
  )
}
