import { createServiceClient } from '../lib/supabase';
import {
  getChannelOverview,
  getVideoPerformance,
  getAudienceDemographics,
  getTrafficSources,
  getDailyAnalytics,
} from '../lib/youtube-analytics';

const supabase = createServiceClient();

async function run() {
  const { data: user, error: userErr } = await supabase
    .from('users')
    .select('id, youtube_access_token, youtube_refresh_token, youtube_channel_id, token_expires_at')
    .eq('email', 'vedangk2912@gmail.com')
    .single();

  if (userErr || !user) {
    console.error('User not found:', userErr);
    process.exit(1);
  }

  console.log('═══════════════════════════════════════════════════════════');
  console.log('USER STATE');
  console.log('═══════════════════════════════════════════════════════════');
  console.log('User ID:', user.id);
  console.log('Channel ID:', user.youtube_channel_id);
  console.log('Token expires at:', user.token_expires_at);
  console.log('Access token present:', !!user.youtube_access_token);
  console.log('Refresh token present:', !!user.youtube_refresh_token);
  console.log('Token is expired:', new Date(user.token_expires_at) < new Date());
  console.log();

  if (!user.youtube_access_token) {
    console.error('❌ No access token — cannot proceed');
    process.exit(1);
  }

  const token = user.youtube_access_token;
  let testsPassed = 0;
  let testsFailed = 0;

  async function testCall(name: string, fn: () => Promise<unknown>) {
    console.log('═══════════════════════════════════════════════════════════');
    console.log('TEST:', name);
    console.log('═══════════════════════════════════════════════════════════');
    try {
      const start = Date.now();
      const result = await fn();
      const elapsed = Date.now() - start;
      console.log(`✓ Success (${elapsed}ms)`);
      console.log('Result:', JSON.stringify(result, null, 2));
      testsPassed++;
    } catch (err) {
      console.log('✗ Failed');
      console.error('Error:', err instanceof Error ? err.message : err);
      if (err instanceof Error && err.stack) console.error('Stack:', err.stack);
      testsFailed++;
    }
    console.log();
  }

  await testCall('getChannelOverview', () => getChannelOverview(token));
  await testCall('getVideoPerformance', () => getVideoPerformance(token));
  await testCall('getAudienceDemographics', () => getAudienceDemographics(token));
  await testCall('getTrafficSources', () => getTrafficSources(token));
  await testCall('getDailyAnalytics', () => getDailyAnalytics(token));

  console.log('═══════════════════════════════════════════════════════════');
  console.log('SUMMARY');
  console.log('═══════════════════════════════════════════════════════════');
  console.log(`Passed: ${testsPassed}`);
  console.log(`Failed: ${testsFailed}`);

  process.exit(testsFailed > 0 ? 1 : 0);
}

run().catch((err) => {
  console.error('Script failed:', (err as Error).message);
  process.exit(1);
});
