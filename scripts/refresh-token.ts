/**
 * Refresh the expired YouTube access token using the stored refresh token.
 * Updates the access token in Supabase so test scripts can use it immediately.
 *
 * Run with: npx tsx --env-file=.env.local scripts/refresh-token.ts
 */

import { createServiceClient } from '../lib/supabase';

async function run() {
  const db = createServiceClient();

  // Get the most recent user with a refresh token
  const { data: users, error } = await db
    .from('users')
    .select('id, email, youtube_refresh_token, token_expires_at')
    .not('youtube_refresh_token', 'is', null)
    .order('created_at', { ascending: false })
    .limit(1);

  if (error) throw new Error(`Supabase error: ${error.message}`);
  if (!users || users.length === 0) {
    throw new Error('No user with a refresh token found. Sign in at http://localhost:3000 first.');
  }

  const user = users[0];
  console.log(`Refreshing token for: ${user.email}`);
  console.log(`Current expiry: ${user.token_expires_at ?? '(none)'}`);

  if (!user.youtube_refresh_token) {
    throw new Error('No refresh token stored for this user.');
  }

  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error('GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET not set in .env.local');
  }

  // Exchange refresh token for a new access token
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: user.youtube_refresh_token,
      grant_type: 'refresh_token',
    }),
  });

  const tokenData = await res.json() as {
    access_token?: string;
    expires_in?: number;
    error?: string;
    error_description?: string;
  };

  if (!res.ok || !tokenData.access_token) {
    throw new Error(
      `Token refresh failed: ${tokenData.error} — ${tokenData.error_description ?? ''}`,
    );
  }

  const expiresAt = new Date(Date.now() + (tokenData.expires_in ?? 3600) * 1000).toISOString();

  // Save new access token to Supabase
  const { error: updateError } = await db
    .from('users')
    .update({
      youtube_access_token: tokenData.access_token,
      token_expires_at: expiresAt,
    })
    .eq('id', user.id);

  if (updateError) throw new Error(`Failed to update token: ${updateError.message}`);

  console.log(`\nToken refreshed successfully.`);
  console.log(`New expiry: ${expiresAt}`);
  console.log(`Expires in: ${Math.round((tokenData.expires_in ?? 3600) / 60)} minutes`);
}

run().catch((err) => {
  console.error('Error:', (err as Error).message);
  process.exit(1);
});
