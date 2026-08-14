import { createServiceClient } from '../lib/supabase'

const USER_ID = 'ea5725ed-e75d-4617-be7b-08e838c1f92e'
const supabase = createServiceClient()

async function run() {
  const { data: user, error: uErr } = await supabase
    .from('users')
    .select('id, niche_id, sub_niche')
    .eq('id', USER_ID)
    .single()
  if (uErr) { console.error('users error:', uErr); process.exit(1) }

  const [competitors, videos, snapshots] = await Promise.all([
    supabase.from('competitors').select('id', { count: 'exact', head: true }).eq('user_id', USER_ID),
    supabase.from('videos').select('id', { count: 'exact', head: true }).eq('user_id', USER_ID),
    supabase.from('channel_snapshots').select('id', { count: 'exact', head: true }).eq('user_id', USER_ID),
  ])

  console.log(JSON.stringify({
    niche_id: user.niche_id,
    sub_niche: user.sub_niche,
    competitor_count: competitors.count,
    video_count: videos.count,
    snapshot_count: snapshots.count,
  }, null, 2))
  process.exit(0)
}

run().catch((err) => {
  console.error('Script failed:', (err as Error).message)
  process.exit(1)
})
