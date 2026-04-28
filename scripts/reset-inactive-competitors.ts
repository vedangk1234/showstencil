import { config } from 'dotenv'
config({ path: '.env.local', override: true })

import { createServiceClient } from '../lib/supabase'

const TEST_EMAIL = 'vedangk2912@gmail.com'

async function run() {
  const supabase = createServiceClient()

  const { data: user } = await supabase
    .from('users')
    .select('id')
    .eq('email', TEST_EMAIL)
    .single()

  if (!user) {
    console.error('User not found')
    process.exit(1)
  }

  console.log(`User found: ${user.id}`)

  const { data: competitors } = await supabase
    .from('competitors')
    .select('id, channel_name, youtube_channel_id')
    .eq('user_id', user.id)
    .eq('is_auto_detected', true)
    .eq('is_active', true)

  console.log(`Found ${competitors?.length ?? 0} active auto-detected competitors`)

  for (const comp of competitors ?? []) {
    const { count } = await supabase
      .from('competitor_videos')
      .select('*', { count: 'exact', head: true })
      .eq('competitor_id', comp.id)

    const videoCount = count ?? 0
    console.log(`  ${comp.channel_name}: ${videoCount} videos in competitor_videos`)

    if (videoCount === 0) {
      console.log(`  → Removing inactive competitor: ${comp.channel_name}`)

      // Delete child rows first to avoid FK violations
      const { error: snapErr } = await supabase
        .from('competitor_snapshots')
        .delete()
        .eq('competitor_id', comp.id)

      if (snapErr) {
        console.error(`    Failed to delete snapshots for ${comp.channel_name}:`, snapErr.message)
      }

      const { error: vidErr } = await supabase
        .from('competitor_videos')
        .delete()
        .eq('competitor_id', comp.id)

      if (vidErr) {
        console.error(`    Failed to delete videos for ${comp.channel_name}:`, vidErr.message)
      }

      const { error: compErr } = await supabase
        .from('competitors')
        .delete()
        .eq('id', comp.id)

      if (compErr) {
        console.error(`    Failed to delete competitor ${comp.channel_name}:`, compErr.message)
      } else {
        console.log(`  ✓ Deleted ${comp.channel_name}`)
      }
    } else {
      console.log(`  ✓ ${comp.channel_name} is active — keeping`)
    }
  }

  console.log('\nDone. Trigger sync to re-detect active replacements.')
}

run().catch((err) => {
  console.error('Script failed:', (err as Error).message)
  process.exit(1)
})
