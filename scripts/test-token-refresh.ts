import { createServiceClient } from '../lib/supabase';

const supabase = createServiceClient();

async function run() {
  const { data: user } = await supabase
    .from('users')
    .select('id, youtube_refresh_token, token_expires_at, youtube_access_token')
    .eq('email', 'vedangk2912@gmail.com')
    .single();

  if (!user) { console.error('User not found'); process.exit(1); }

  console.log('Token expires at:', user.token_expires_at);
  console.log('Has refresh token:', !!user.youtube_refresh_token);
  console.log('Refresh token length:', user.youtube_refresh_token?.length ?? 0);

  // Attempt refresh directly
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID ?? '',
    client_secret: process.env.GOOGLE_CLIENT_SECRET ?? '',
    refresh_token: user.youtube_refresh_token ?? '',
    grant_type: 'refresh_token',
  });

  console.log('GOOGLE_CLIENT_ID present:', !!process.env.GOOGLE_CLIENT_ID);
  console.log('GOOGLE_CLIENT_SECRET present:', !!process.env.GOOGLE_CLIENT_SECRET);

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  });

  const data = await res.json();
  console.log('Response status:', res.status);
  console.log('Response body:', JSON.stringify(data, null, 2));

  if (res.ok) {
    console.log('✓ Token refresh successful');
    console.log('New token expires in:', data.expires_in, 'seconds');
  } else {
    console.error('✗ Token refresh failed');
    console.error('Error:', data.error);
    console.error('Description:', data.error_description);
  }

  process.exit(0);
}

run().catch((err) => {
  console.error('Script failed:', (err as Error).message);
  process.exit(1);
});
