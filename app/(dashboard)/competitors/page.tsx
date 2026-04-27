import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import { createServiceClient } from '@/lib/supabase'
import { CompetitorsTable } from '@/components/competitors/CompetitorsTable'
import { getPlanLimits } from '@/lib/plan-limits'
import type { Competitor } from '@/types'

export default async function CompetitorsPage() {
  const session = await auth()
  if (!session) redirect('/login')

  const supabase = createServiceClient()

  const { data: user } = await supabase
    .from('users')
    .select('id, subscription_plan, sub_niche, niche_id')
    .eq('id', session.user.id)
    .single()

  if (!user) redirect('/login')

  const [{ data: competitors }, { data: lockedSearched }] = await Promise.all([
    supabase
      .from('competitors')
      .select('*')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .order('subscriber_count', { ascending: false }),
    supabase
      .from('competitors')
      .select('channel_name, replacement_locked_until')
      .eq('user_id', user.id)
      .eq('is_searched', true)
      .eq('is_active', true)
      .not('replacement_locked_until', 'is', null)
      .gt('replacement_locked_until', new Date().toISOString())
      .limit(1)
      .maybeSingle(),
  ])

  const planLimits = getPlanLimits(user.subscription_plan)

  return (
    <CompetitorsTable
      competitors={(competitors ?? []) as Competitor[]}
      user={user}
      planLimits={planLimits}
      lockedUntil={lockedSearched?.replacement_locked_until ?? null}
      lockedChannelName={lockedSearched?.channel_name ?? null}
    />
  )
}
