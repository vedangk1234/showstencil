import { createServiceClient } from '../lib/supabase'
import { syncUserChannel } from '../lib/sync-logic'

async function main() {
  const targetEmail = 'vedangk2912@gmail.com'
  const supa = createServiceClient()

  const { data: user, error } = await supa
    .from('users')
    .select('id, email, niche_id, sub_niche, youtube_channel_id')
    .eq('email', targetEmail)
    .maybeSingle()

  if (error) {
    console.error('User lookup failed:', error)
    process.exit(1)
  }
  if (!user) {
    console.error(`No user found for email ${targetEmail}`)
    process.exit(1)
  }

  console.log('Target user before sync:')
  console.log(JSON.stringify(user, null, 2))
  console.log('─────────────────────────────────────────────')
  console.log('Running syncUserChannel...')

  const t0 = Date.now()
  const result = await syncUserChannel(user.id)
  const ms = Date.now() - t0

  console.log('─────────────────────────────────────────────')
  console.log(`Sync completed in ${ms}ms`)
  console.log(JSON.stringify(result, null, 2))

  const { data: after } = await supa
    .from('users')
    .select('id, email, niche_id, sub_niche')
    .eq('id', user.id)
    .maybeSingle()
  console.log('─────────────────────────────────────────────')
  console.log('User after sync:')
  console.log(JSON.stringify(after, null, 2))

  const { data: comps } = await supa
    .from('competitors')
    .select('channel_name, tier, is_dominator, is_active, is_auto_detected, sub_niche, last_synced_at')
    .eq('user_id', user.id)
    .eq('is_active', true)
    .order('tier', { ascending: true })

  console.log('─────────────────────────────────────────────')
  console.log(`Active competitors (${comps?.length ?? 0}):`)
  for (const c of comps ?? []) {
    console.log(`  T${c.tier ?? '?'}${c.is_dominator ? ' [DOM]' : ''} ${c.channel_name} — auto=${c.is_auto_detected} sub_niche=${c.sub_niche ?? 'null'}`)
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
