import { createServiceClient } from '../lib/supabase'
import { syncUserChannel } from '../lib/sync-logic'

const supabase = createServiceClient()

async function run() {
  const { data: user } = await supabase
    .from('users')
    .select('id')
    .eq('email', 'vedangk2912@gmail.com')
    .single()

  if (!user) { console.error('User not found'); process.exit(1) }

  console.log('Starting sync for user:', user.id)
  const result = await syncUserChannel(user.id)

  console.log('Result:', JSON.stringify(result, null, 2))

  process.exit(result.success ? 0 : 1)
}

run().catch((err) => {
  console.error('Script failed:', (err as Error).message)
  process.exit(1)
})
