/**
 * scripts/fix-competitor-tiers.ts
 *
 * Audits and fixes competitor tier assignments for the test user.
 *
 * Tier spec:
 *   Tier 1 = 1-3× user's subscriber count  (Similar)
 *   Tier 2 = 3-10× user's subscriber count (Aspirational)
 *   Tier 3 = 10×+                           (Dominant)
 *
 * Run: npx tsx --env-file=.env.local scripts/fix-competitor-tiers.ts
 */

import { createServiceClient } from '../lib/supabase'

const EMAIL = 'vedangk2912@gmail.com'

function correctTier(compSubs: number, userSubs: number): 1 | 2 | 3 {
  const ratio = compSubs / userSubs
  return ratio <= 3 ? 1 : ratio <= 10 ? 2 : 3
}

async function main() {
  const supabase = createServiceClient()

  // 1. Resolve test user
  const { data: user, error: userErr } = await supabase
    .from('users')
    .select('id')
    .eq('email', EMAIL)
    .single()

  if (userErr || !user) {
    console.error('User not found:', userErr?.message)
    process.exit(1)
  }
  const userId = user.id

  // 2. Get user's subscriber count — look for most recent snapshot with a non-null value
  //    (saveChannelSnapshot doesn't always populate subscriber_count — Data API enrichment
  //    is a later milestone, so seed data may be the only source)
  const { data: snaps } = await supabase
    .from('channel_snapshots')
    .select('subscriber_count, snapshot_date')
    .eq('user_id', userId)
    .not('subscriber_count', 'is', null)
    .order('snapshot_date', { ascending: false })
    .limit(1)

  const userSubs: number = snaps?.[0]?.subscriber_count ?? 0

  if (userSubs === 0) {
    console.log('\n⚠️  No subscriber_count found in channel_snapshots.')
    console.log('   saveChannelSnapshot does not populate subscriber_count yet (Data API enrichment is a later milestone).')
    console.log('   Without this value, tier ratios cannot be calculated.')
    console.log('\n   To proceed, run the seed script first:')
    console.log('   npx tsx --env-file=.env.local scripts/seed-test-data.ts')
    console.log('\n   Then re-run this script.\n')

    // Show current state
    const { data: competitors } = await supabase
      .from('competitors')
      .select('channel_name, subscriber_count, tier')
      .eq('user_id', userId)
      .order('subscriber_count', { ascending: false })

    console.log('Current competitor state:')
    for (const c of competitors ?? []) {
      console.log(`  ${(c.channel_name ?? '?').padEnd(32)} ${String(c.subscriber_count ?? 0).padEnd(8)} subs  tier=${c.tier ?? 'null'}`)
    }
    return
  }

  console.log(`\nUser subscriber count: ${userSubs.toLocaleString()} (from snapshot ${snaps![0].snapshot_date})\n`)

  // 3. Fetch all competitors
  const { data: competitors, error: compErr } = await supabase
    .from('competitors')
    .select('id, channel_name, subscriber_count, tier')
    .eq('user_id', userId)

  if (compErr || !competitors) {
    console.error('Failed to fetch competitors:', compErr?.message)
    process.exit(1)
  }

  // 4. Audit table
  const LINE = '-'.repeat(95)
  console.log(LINE)
  console.log(
    '| ' + 'Competitor'.padEnd(28) +
    ' | ' + 'Comp Subs'.padEnd(10) +
    ' | ' + 'User Subs'.padEnd(10) +
    ' | ' + 'Ratio'.padEnd(7) +
    ' | ' + 'Current'.padEnd(9) +
    ' | ' + 'Correct'.padEnd(9) +
    ' | Wrong? |'
  )
  console.log(LINE)

  const fixes: { id: string; name: string; tier: 1 | 2 | 3 }[] = []

  for (const c of competitors) {
    const compSubs: number = c.subscriber_count ?? 0
    const ratio = compSubs / userSubs
    const current: number = c.tier ?? 0
    const correct = correctTier(compSubs, userSubs)
    const wrong = current !== correct

    if (wrong) fixes.push({ id: c.id, name: c.channel_name ?? c.id, tier: correct })

    const name = (c.channel_name ?? c.id).slice(0, 28)
    console.log(
      '| ' + name.padEnd(28) +
      ' | ' + compSubs.toLocaleString().padEnd(10) +
      ' | ' + userSubs.toLocaleString().padEnd(10) +
      ' | ' + `${ratio.toFixed(2)}×`.padEnd(7) +
      ' | ' + String(current).padEnd(9) +
      ' | ' + String(correct).padEnd(9) +
      ' | ' + (wrong ? 'YES ✗' : 'no  ✓') + '  |'
    )
  }
  console.log(LINE)
  console.log(`\n${fixes.length} of ${competitors.length} competitors had incorrect tiers.\n`)

  if (fixes.length === 0) {
    console.log('✅ All tiers are correct — no fixes needed.')
    return
  }

  // 5. Apply fixes
  console.log('Applying fixes...')
  let updated = 0
  for (const fix of fixes) {
    const { error } = await supabase
      .from('competitors')
      .update({ tier: fix.tier })
      .eq('id', fix.id)
      .eq('user_id', userId)

    if (error) {
      console.error(`  ✗ Failed to update ${fix.name}: ${error.message}`)
    } else {
      console.log(`  ✓ ${fix.name} → tier ${fix.tier}`)
      updated++
    }
  }
  console.log(`\n✅ Updated ${updated}/${fixes.length} competitor tier(s).`)

  // 6. Verify
  const { data: after } = await supabase
    .from('competitors')
    .select('channel_name, subscriber_count, tier')
    .eq('user_id', userId)
    .order('subscriber_count', { ascending: false })

  console.log('\nPost-fix state:')
  for (const c of after ?? []) {
    const ratio = userSubs > 0 ? (c.subscriber_count ?? 0) / userSubs : 0
    const label = c.tier === 1 ? 'Similar' : c.tier === 2 ? 'Aspirational' : c.tier === 3 ? 'Dominant' : '?'
    console.log(`  ${(c.channel_name ?? '?').padEnd(32)} ${String(c.subscriber_count ?? 0).padEnd(8)} subs  ratio=${ratio.toFixed(2)}×  tier=${c.tier} (${label})`)
  }
}

main().catch(console.error)
