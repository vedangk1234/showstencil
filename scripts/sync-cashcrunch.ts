import { syncUserChannel } from '../lib/sync-logic'

const USER_ID = 'ea5725ed-e75d-4617-be7b-08e838c1f92e'

async function run() {
  console.log('Starting sync for user:', USER_ID)
  const result = await syncUserChannel(USER_ID)
  console.log('Result:', JSON.stringify(result, null, 2))
  process.exit(result.success ? 0 : 1)
}

run().catch((err) => {
  console.error('Script failed:', (err as Error).message)
  process.exit(1)
})
