import { config } from 'dotenv'
config({ path: '.env.local', override: true })

import { createServiceClient } from '../lib/supabase'

async function main() {
  const supabase = createServiceClient()

  const { data: user } = await supabase
    .from('users')
    .select('id, niche_id, sub_niche, subscription_status')
    .eq('email', 'vedangk2912@gmail.com')
    .single()

  if (!user) {
    console.log('User not found')
    process.exit(1)
  }

  console.log(`User: ${user.id}`)
  console.log(`Niche: ${user.niche_id}, Sub-niche: ${user.sub_niche}`)
  console.log(`Subscription: ${user.subscription_status}`)

  const { data: competitors, count } = await supabase
    .from('competitors')
    .select('channel_name, tier, is_auto_detected, is_active, is_dominator, subscriber_count', { count: 'exact' })
    .eq('user_id', user.id)
    .order('tier')

  console.log(`\nTotal competitor rows: ${count}`)
  for (const c of competitors ?? []) {
    console.log(`  Tier${c.tier} | auto=${c.is_auto_detected} | active=${c.is_active} | dominator=${c.is_dominator} | ${c.subscriber_count?.toLocaleString()} subs | ${c.channel_name}`)
  }

  const { count: autoCount } = await supabase
    .from('competitors')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', user.id)
    .eq('is_auto_detected', true)
    .eq('is_active', true)

  console.log(`\nAuto-detected + active: ${autoCount}`)
  console.log(autoCount === 0 ? '→ Auto-detection WILL run on next sync' : '→ Auto-detection will be SKIPPED (competitors already assigned)')
}

main().catch(console.error)
