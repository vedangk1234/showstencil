/**
 * One-shot cleanup audit. Confirms no @showstencil-test.invalid users were
 * left behind by the integration suite. Safe to run any time.
 *
 * Run: npx tsx --env-file=.env.local scripts/integration/_audit-cleanup.ts
 */
import { createServiceClient } from '../../lib/supabase'

async function main() {
  const supabase = createServiceClient()

  const { data: leftoverUsers, error } = await supabase
    .from('users')
    .select('id, email, created_at')
    .ilike('email', '%@showstencil-test.invalid')

  if (error) {
    console.error('failed to query users:', error.message)
    process.exit(1)
  }

  console.log(`leftover @showstencil-test.invalid users: ${leftoverUsers?.length ?? 0}`)
  if (leftoverUsers && leftoverUsers.length > 0) {
    for (const u of leftoverUsers) {
      console.log(`  - ${u.id}  ${u.email}  created=${u.created_at}`)
    }
  }

  // Sanity check on snapshots/videos created in last 30min for ANY test user.
  const since = new Date(Date.now() - 30 * 60 * 1000).toISOString()
  const ids = (leftoverUsers ?? []).map((u) => u.id)
  if (ids.length > 0) {
    for (const table of ['channel_snapshots', 'videos']) {
      const { count } = await supabase
        .from(table)
        .select('id', { count: 'exact', head: true })
        .in('user_id', ids)
        .gt('created_at', since)
      console.log(`  ${table} rows for those users in last 30min: ${count ?? 0}`)
    }
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
