/**
 * scripts/create-ideas-table.ts
 * One-time migration: creates the `ideas` table in Supabase.
 * Run: npx tsx --env-file=.env.local scripts/create-ideas-table.ts
 *
 * NOTE: The Supabase JS client cannot run DDL statements directly.
 * This script checks whether the table exists and prints the SQL if it does not.
 * Copy and run the printed SQL in the Supabase SQL editor.
 */

import { createServiceClient } from '@/lib/supabase';

async function main() {
  const supabase = createServiceClient();

  const { error } = await supabase.from('ideas').select('id').limit(1);

  if (!error) {
    console.log('ideas table already exists.');
    return;
  }

  console.log(`ideas table not found (${error.message})`);
  console.log('\nRun this SQL in the Supabase SQL editor:');
  console.log('https://supabase.com/dashboard/project/hxwnmyirzzuqlenzlujc/sql\n');
  console.log(`
CREATE TABLE IF NOT EXISTS ideas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  generated_at TIMESTAMPTZ NOT NULL,
  niche_id TEXT,
  gap_score_at_generation INTEGER,
  ideas JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
  `.trim());
}

main().catch(console.error);
