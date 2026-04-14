import { createServiceClient } from '@/lib/supabase'

const USER_ID = '848f7497-9a46-40a3-8d90-a96d1c9cf909'

async function main() {
  const sb = createServiceClient()
  const { data, error } = await sb
    .from('user_settings')
    .select('user_id, unsubscribe_token, weekly_digest_enabled, alerts_enabled')
    .eq('user_id', USER_ID)
    .single()

  if (error) {
    console.error('Error:', error.message)
    process.exit(1)
  }

  console.log(JSON.stringify(data, null, 2))
  console.log('\nTest URL:')
  console.log(`http://localhost:3000/api/unsubscribe?token=${data?.unsubscribe_token}`)
}

main()
