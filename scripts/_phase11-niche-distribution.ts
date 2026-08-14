import { createServiceClient } from '../lib/supabase'
import { VALID_NICHE_SLUGS } from '../lib/niches'

async function main() {
  const supa = createServiceClient()
  const { data, error } = await supa
    .from('users')
    .select('niche_id')

  if (error) {
    console.error('Query failed:', error)
    process.exit(1)
  }

  const counts = new Map<string, number>()
  for (const row of data ?? []) {
    const key = row.niche_id === null ? '<null>' : row.niche_id
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }

  const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1])

  const validSet = new Set<string>([...VALID_NICHE_SLUGS, 'other', '<null>'])

  console.log('niche_id distribution:')
  console.log('─────────────────────────────────────────────')
  let unknownCount = 0
  for (const [slug, count] of sorted) {
    const ok = validSet.has(slug) ? '✓' : '✗ UNKNOWN'
    if (!validSet.has(slug)) unknownCount += count
    console.log(`  ${ok}  ${slug.padEnd(40)} ${count}`)
  }
  console.log('─────────────────────────────────────────────')
  console.log(`total rows: ${data?.length ?? 0}`)
  console.log(`unknown slugs total rows: ${unknownCount}`)
  console.log(`valid taxonomy slugs: ${VALID_NICHE_SLUGS.length}`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
