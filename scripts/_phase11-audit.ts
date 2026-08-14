import { createServiceClient } from '../lib/supabase';

async function main() {
  const supabase = createServiceClient();

  // 1. niche_description column exists?
  const probeUsers = await supabase
    .from('users')
    .select('id, niche_id, niche_description, sub_niche')
    .limit(5);

  console.log('\n=== users probe (niche_description column existence + sub_niche state) ===');
  if (probeUsers.error) {
    console.log('ERROR:', probeUsers.error.message);
    console.log('(This likely means niche_description column does NOT exist yet.)');
  } else {
    console.log('Sample rows:');
    for (const r of probeUsers.data ?? []) {
      console.log(JSON.stringify(r));
    }
  }

  // 2. Count of non-null sub_niche on users + competitors
  const u = await supabase
    .from('users')
    .select('id', { count: 'exact', head: true })
    .not('sub_niche', 'is', null);
  const c = await supabase
    .from('competitors')
    .select('id', { count: 'exact', head: true })
    .not('sub_niche', 'is', null);

  console.log('\n=== sub_niche non-null counts (should be 0 if migration ran) ===');
  console.log('users.sub_niche non-null:        ', u.count);
  console.log('competitors.sub_niche non-null:  ', c.count);
}

main();
