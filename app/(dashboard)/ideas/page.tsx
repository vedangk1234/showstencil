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

  // Load plan info, niche, and recent ideas in parallel
  const [userRow, ideas, ideaLimit] = await Promise.all([
    supabase
      .from('users')
      .select('subscription_status, subscription_plan, trial_ends_at, niche_id')
      .eq('id', userId)
      .single()
      .then((r) => r.data),
    getRecentIdeasBatch(userId),
    getIdeaLimit(userId),
  ])

  const plan = resolvePlan(userRow)
  const nicheId = userRow?.niche_id ?? 'finance'

  // Is this batch "fresh" (generated within the last 7 days)?
  const latestGeneratedAt = ideas.length > 0 ? new Date(ideas[0].generated_at) : null
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
  const isFresh = latestGeneratedAt !== null && latestGeneratedAt > sevenDaysAgo

  // Pass raw generated_at to client — lock state is computed there
  const mostRecentGeneratedAt = latestGeneratedAt?.toISOString() ?? null

  // Seed for deterministic image shuffle — stable across refreshes, changes on regeneration
  const imageSeed = mostRecentGeneratedAt ? new Date(mostRecentGeneratedAt).getTime() : 1

  return (
    <IdeasClient
      initialIdeas={ideas}
      isFresh={isFresh}
      plan={plan}
      mostRecentGeneratedAt={mostRecentGeneratedAt}
      ideaLimit={ideaLimit}
      nicheId={nicheId}
      imageSeed={imageSeed}
    />
  )
}
