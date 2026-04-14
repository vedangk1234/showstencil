/**
 * Re-enables notifications for the test user after unsubscribe testing.
 * Run: npx tsx --env-file=.env.local scripts/re-enable-notifications.ts
 */

import { createServiceClient } from '@/lib/supabase'

const USER_ID = '848f7497-9a46-40a3-8d90-a96d1c9cf909'

async function main() {
  const sb = createServiceClient()
  const { error } = await sb
    .from('user_settings')
    .update({
      weekly_digest_enabled: true,
      alerts_enabled: true,
      updated_at: new Date().toISOString(),
    })
    .eq('user_id', USER_ID)

  if (error) {
    console.error('Error:', error.message)
    process.exit(1)
  }

  console.log('✓ Notifications re-enabled for test user')

  // Verify
  const { data } = await sb
    .from('user_settings')
    .select('weekly_digest_enabled, alerts_enabled')
    .eq('user_id', USER_ID)
    .single()

  console.log('Current state:', JSON.stringify(data))
}

main()
