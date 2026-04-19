import { createServiceClient } from '../lib/supabase';

async function main() {
  const supabase = createServiceClient();

  const { data: user, error: userErr } = await supabase
    .from('users')
    .select('id')
    .eq('email', 'vedangk2912@gmail.com')
    .single();

  if (userErr || !user) {
    console.error('User not found:', userErr?.message);
    process.exit(1);
  }
  console.log('User ID:', user.id);

  const { data, error } = await supabase
    .from('gap_scores')
    .update({
      watch_time_gap_score: 15,
      upload_frequency_gap_score: 85,
      topic_coverage_gap_score: null,
    })
    .eq('user_id', user.id)
    .select('id, views_gap_score, ctr_gap_score, watch_time_gap_score, upload_frequency_gap_score, topic_coverage_gap_score');

  if (error) {
    console.error('Update error:', error.message);
    process.exit(1);
  }
  console.log('Updated rows:', JSON.stringify(data, null, 2));
}

main();
