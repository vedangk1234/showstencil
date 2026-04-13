/**
 * Smoke-test for lib/youtube-analytics.ts — all 5 functions.
 * Run with: npx tsx --env-file=.env.local scripts/test-youtube-analytics.ts
 *
 * Quota used: ~7 units total
 *   fn1  getChannelOverview       → 1 unit  (+ 1 if revenue retry needed)
 *   fn2  getVideoPerformance      → 1 unit  (+ 1 if revenue retry needed)
 *   fn3  getAudienceDemographics  → 2 units
 *   fn4  getTrafficSources        → 1 unit
 *   fn5  getDailyAnalytics        → 1 unit  (+ 1 if revenue retry needed)
 *
 * Fetches the access token for the most recently created user from Supabase.
 * If the token is expired, logs clear instructions for refreshing it.
 */

import { createServiceClient } from '../lib/supabase';
import {
  getChannelOverview,
  getVideoPerformance,
  getAudienceDemographics,
  getTrafficSources,
  getDailyAnalytics,
} from '../lib/youtube-analytics';

function hr(label: string) {
  console.log(`\n${'─'.repeat(60)}`);
  console.log(label);
  console.log('─'.repeat(60));
}

function fmt(n: number, decimals = 0) {
  return n.toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

async function getTestToken(): Promise<{ accessToken: string; email: string; expiresAt: string | null }> {
  const db = createServiceClient();

  const { data: users, error } = await db
    .from('users')
    .select('email, youtube_access_token, token_expires_at')
    .not('youtube_access_token', 'is', null)
    .order('created_at', { ascending: false })
    .limit(1);

  if (error) throw new Error(`Supabase error: ${error.message}`);
  if (!users || users.length === 0) {
    throw new Error(
      'No users with a youtube_access_token found in Supabase.\n' +
      'Sign in at http://localhost:3000 with a Google account that has a YouTube channel first.',
    );
  }

  const user = users[0];
  if (!user.youtube_access_token) {
    throw new Error(
      `User ${user.email} has no youtube_access_token.\n` +
      'Sign in again at http://localhost:3000 to generate a fresh token.',
    );
  }

  return {
    accessToken: user.youtube_access_token,
    email: user.email,
    expiresAt: user.token_expires_at,
  };
}

async function run() {
  // -------------------------------------------------------------------------
  // Fetch access token from Supabase
  // -------------------------------------------------------------------------
  hr('SETUP — Fetching access token from Supabase');
  let accessToken: string;

  try {
    const { accessToken: token, email, expiresAt } = await getTestToken();
    accessToken = token;
    console.log(`user:       ${email}`);
    if (expiresAt) {
      const expiresIn = Math.round((new Date(expiresAt).getTime() - Date.now()) / 60000);
      console.log(`token expires: ${expiresAt} (${expiresIn > 0 ? `in ${expiresIn}m` : `EXPIRED ${Math.abs(expiresIn)}m ago`})`);
      if (expiresIn <= 0) {
        console.warn('\n⚠ Token appears expired. Re-sign in at http://localhost:3000 to get a fresh token.');
        console.warn('  NextAuth will automatically refresh it on next request.');
      }
    } else {
      console.log('token expires: (no expiry recorded)');
    }
  } catch (err) {
    console.error('FATAL:', (err as Error).message);
    process.exit(1);
  }

  // -------------------------------------------------------------------------
  // Function 1 — getChannelOverview
  // -------------------------------------------------------------------------
  hr('FUNCTION 1 — getChannelOverview (last 90 days)');
  try {
    const overview = await getChannelOverview(accessToken);
    if (!overview) {
      console.error('FAIL: null returned — no YouTube channel or no Analytics access.');
      console.error('      Ensure the signed-in Google account has a YouTube channel.');
    } else {
      console.log(`totalViews:             ${fmt(overview.totalViews)}`);
      console.log(`totalWatchTimeMinutes:  ${fmt(overview.totalWatchTimeMinutes)}`);
      console.log(`avgViewDurationSeconds: ${fmt(overview.avgViewDurationSeconds)}s`);
      console.log(`subscribersGained:      ${fmt(overview.subscribersGained)}`);
      console.log(`subscribersLost:        ${fmt(overview.subscribersLost)}`);
      console.log(`netSubscribers:         ${fmt(overview.netSubscribers)}`);
      console.log(`estimatedRevenue:       $${fmt(overview.estimatedRevenue, 2)}`);
    }
  } catch (err) {
    if ((err as Error).message === 'TOKEN_EXPIRED') {
      console.error('TOKEN EXPIRED — re-sign in at http://localhost:3000 to refresh.');
      process.exit(1);
    }
    console.error('Error:', err);
  }

  // -------------------------------------------------------------------------
  // Function 2 — getVideoPerformance
  // -------------------------------------------------------------------------
  hr('FUNCTION 2 — getVideoPerformance (top 10 videos, last 90 days)');
  try {
    const videos = await getVideoPerformance(accessToken, 10);
    if (videos.length === 0) {
      console.log('returned 0 videos — channel may have no videos in the last 90 days.');
    } else {
      console.log(`returned ${videos.length} video(s)\n`);
      for (const v of videos) {
        console.log(`  [${v.videoId}]`);
        console.log(`    views=${fmt(v.views)}  watchTime=${fmt(v.watchTimeMinutes)}m  avgDuration=${v.avgViewDurationSeconds}s`);
        console.log(`    avgViewPct=${v.avgViewPercentage.toFixed(1)}%  likes=${fmt(v.likes)}  comments=${fmt(v.comments)}  shares=${fmt(v.shares)}`);
        console.log(`    subsGained=${v.subscribersGained}  revenue=$${fmt(v.estimatedRevenue, 2)}  ctr=${v.ctr.toFixed(4)}`);
      }
    }
  } catch (err) {
    if ((err as Error).message === 'TOKEN_EXPIRED') { console.error('TOKEN EXPIRED'); process.exit(1); }
    console.error('Error:', err);
  }

  // -------------------------------------------------------------------------
  // Function 3 — getAudienceDemographics
  // -------------------------------------------------------------------------
  hr('FUNCTION 3 — getAudienceDemographics');
  try {
    const demo = await getAudienceDemographics(accessToken);
    if (!demo) {
      console.error('FAIL: null returned');
    } else {
      console.log(`Age/gender breakdown (${demo.ageGender.length} rows):`);
      for (const ag of demo.ageGender) {
        console.log(`  ${ag.ageGroup.padEnd(12)} ${ag.gender.padEnd(15)} ${ag.viewerPercentage.toFixed(2)}%`);
      }
      console.log(`\nTop countries (${demo.topCountries.length} rows):`);
      for (const c of demo.topCountries) {
        console.log(`  ${c.country.padEnd(5)} ${fmt(c.views)} views`);
      }
    }
  } catch (err) {
    if ((err as Error).message === 'TOKEN_EXPIRED') { console.error('TOKEN EXPIRED'); process.exit(1); }
    console.error('Error:', err);
  }

  // -------------------------------------------------------------------------
  // Function 4 — getTrafficSources
  // -------------------------------------------------------------------------
  hr('FUNCTION 4 — getTrafficSources (last 90 days)');
  try {
    const sources = await getTrafficSources(accessToken);
    if (sources.length === 0) {
      console.log('returned 0 sources');
    } else {
      console.log(`returned ${sources.length} source(s)\n`);
      const sorted = [...sources].sort((a, b) => b.views - a.views);
      for (const s of sorted) {
        console.log(
          `  ${s.source.padEnd(35)} ${fmt(s.views).padStart(10)} views  ${s.percentage.toFixed(1).padStart(6)}%  ${fmt(s.watchTimeMinutes)}m`,
        );
      }
    }
  } catch (err) {
    if ((err as Error).message === 'TOKEN_EXPIRED') { console.error('TOKEN EXPIRED'); process.exit(1); }
    console.error('Error:', err);
  }

  // -------------------------------------------------------------------------
  // Function 5 — getDailyAnalytics
  // -------------------------------------------------------------------------
  hr('FUNCTION 5 — getDailyAnalytics (last 30 days)');
  try {
    const daily = await getDailyAnalytics(accessToken, 30);
    if (daily.length === 0) {
      console.log('returned 0 days — no data in range');
    } else {
      console.log(`returned ${daily.length} day(s)\n`);
      // Show first 5, last 5
      const show = daily.length <= 10 ? daily : [...daily.slice(0, 5), ...daily.slice(-5)];
      const showWithGap = daily.length > 10;
      let gapShown = false;
      for (const d of show) {
        if (showWithGap && !gapShown && d === daily[daily.length - 5]) {
          console.log('  ...');
          gapShown = true;
        }
        console.log(
          `  ${d.date}  views=${fmt(d.views).padStart(7)}  subs=${fmt(d.subscribersGained).padStart(5)}  ` +
          `watchTime=${fmt(d.watchTimeMinutes).padStart(8)}m  revenue=$${fmt(d.estimatedRevenue, 2)}`,
        );
      }
      const totals = daily.reduce(
        (acc, d) => ({
          views: acc.views + d.views,
          subs: acc.subs + d.subscribersGained,
          revenue: acc.revenue + d.estimatedRevenue,
        }),
        { views: 0, subs: 0, revenue: 0 },
      );
      console.log(`\n  TOTALS: views=${fmt(totals.views)}  subs=${fmt(totals.subs)}  revenue=$${fmt(totals.revenue, 2)}`);
    }
  } catch (err) {
    if ((err as Error).message === 'TOKEN_EXPIRED') { console.error('TOKEN EXPIRED'); process.exit(1); }
    console.error('Error:', err);
  }

  console.log('\n\nAll 5 functions tested.');
}

run().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
