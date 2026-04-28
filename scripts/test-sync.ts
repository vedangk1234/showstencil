import { createServiceClient } from '../lib/supabase';

const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';
const cronSecret = process.env.CRON_SECRET ?? '';

const supabase = createServiceClient();

async function run() {
  const { data: user } = await supabase
    .from('users')
    .select('id')
    .eq('email', 'vedangk2912@gmail.com')
    .single();

  if (!user) { console.error('User not found'); process.exit(1); }

  console.log('Calling /api/sync for user:', user.id);
  console.log('App URL:', appUrl);

  const res = await fetch(`${appUrl}/api/sync`, {
    method: 'POST',
    headers: {
      'x-cron-user-id': user.id,
      'x-cron-secret': cronSecret,
    },
  });

  console.log('Response status:', res.status);
  const body = await res.text();
  console.log('Response body:', body);

  process.exit(0);
}

run().catch((err) => {
  console.error('Script failed:', (err as Error).message);
  process.exit(1);
});
