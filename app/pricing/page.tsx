import { auth } from '@/auth'
import { createServiceClient } from '@/lib/supabase'
import { PricingClient } from './PricingClient'
import type { PlanType, SubscriptionStatus } from '@/types'

function resolvePlan(row: {
  subscription_status: SubscriptionStatus | null
  subscription_plan: PlanType | null
  trial_ends_at: string | null
} | null): 'free' | 'starter' | 'pro' {
  if (!row) return 'free'
  const { subscription_status, subscription_plan, trial_ends_at } = row
  if (subscription_status === 'on_trial' && trial_ends_at && new Date(trial_ends_at) < new Date()) return 'free'
  if (
    subscription_status === 'on_trial' ||
    subscription_status === 'active' ||
    subscription_status === 'past_due'
  ) {
    const plan = subscription_plan as string
    if (plan === 'starter' || plan === 'pro') return plan
  }
  return 'free'
}

export default async function PricingPage() {
  const session = await auth()
  const isLoggedIn = !!session?.user?.id
  let currentPlan: 'free' | 'starter' | 'pro' = 'free'
  let subscriptionStatus: SubscriptionStatus | null = null
  let currentPeriodEnd: string | null = null

  if (session?.user?.id) {
    try {
      const supabase = createServiceClient()
      const { data } = await supabase
        .from('users')
        .select('subscription_status, subscription_plan, trial_ends_at, current_period_end')
        .eq('id', session.user.id)
        .single()
      if (data) {
        const row = data as {
          subscription_status: SubscriptionStatus | null
          subscription_plan: PlanType | null
          trial_ends_at: string | null
          current_period_end: string | null
        }
        currentPlan = resolvePlan(row)
        subscriptionStatus = row.subscription_status
        currentPeriodEnd = row.current_period_end
      }
    } catch {
      // Fall back to free if DB fetch fails
    }
  }

  return (
    <PricingClient
      currentPlan={currentPlan}
      isLoggedIn={isLoggedIn}
      subscriptionStatus={subscriptionStatus}
      currentPeriodEnd={currentPeriodEnd}
    />
  )
}
