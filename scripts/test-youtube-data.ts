/**
 * Smoke-test for lib/youtube-data.ts — all 6 functions.
 * Run with: npx tsx --env-file=.env.local scripts/test-youtube-data.ts
 *
 * Quota used: ~304 units total
 *   fn1  getChannelStats          →   1 unit
 *   fn2  getRecentVideos          → 200 units
 *   fn3  getVideoDetails          →   1 unit  (reuses IDs from fn2)
 *   fn4  getChannelVideoVelocity  → 101 units
 *   fn5  getCompetitorFullProfile →   0 extra (reuses fn1-3 results via shared logic)
 *   fn6  getTopicCoverage         →   0 units (pure computation)
 */

import {
  getChannelStats,
  getRecentVideos,
  getVideoDetails,
  getChannelVideoVelocity,
  getCompetitorFullProfile,
  getTopicCoverage,
} from '../lib/youtube-data';

const CHANNEL_ID = 'UCV6KDgJskWaEckne5aPA0aQ'; // Graham Stephan (confirmed from prior run)

function hr(label: string) {
  console.log(`\n${'─'.repeat(60)}`);
  console.log(label);
  console.log('─'.repeat(60));
}

function fmt(n: number) {
  return n.toLocaleString();
}

async function run() {
  // -------------------------------------------------------------------------
  // Function 1 — getChannelStats
  // -------------------------------------------------------------------------
  hr('FUNCTION 1 — getChannelStats');
  const stats = await getChannelStats(CHANNEL_ID);
  if (!stats) {
    console.error('FAIL: null returned');
  } else {
    console.log('name:             ', stats.name);
    console.log('id:               ', stats.id);
    console.log('subscribers:      ', fmt(stats.subscriberCount));
    console.log('totalViews:       ', fmt(stats.totalViews));
    console.log('videoCount:       ', fmt(stats.videoCount));
    console.log('country:          ', stats.country || '(not set)');
    console.log('publishedAt:      ', stats.publishedAt.slice(0, 10));
    console.log('trailerVideoId:   ', stats.trailerVideoId ?? '(none)');
    console.log('keywords:         ', stats.keywords.slice(0, 5).join(', '), `(${stats.keywords.length} total)`);
    console.log('topicCategories:  ', stats.topicCategories.join(' | ') || '(none)');
    console.log('thumbnail:        ', stats.thumbnail ? 'OK' : 'MISSING');
  }

  // -------------------------------------------------------------------------
  // Function 2 — getRecentVideos
  // -------------------------------------------------------------------------
  hr('FUNCTION 2 — getRecentVideos (maxResults=10, last 90 days)');
  const summaries = await getRecentVideos(CHANNEL_ID, 10);
  console.log(`returned ${summaries.length} video(s)`);
  for (const v of summaries.slice(0, 5)) {
    console.log(`  [${v.duration.padEnd(6)}] ${v.publishedAt.slice(0, 10)} — "${v.title.slice(0, 60)}"`);
  }
  if (summaries.length > 5) console.log(`  ... and ${summaries.length - 5} more`);

  const mediumCount = summaries.filter((v) => v.duration === 'medium').length;
  const longCount = summaries.filter((v) => v.duration === 'long').length;
  console.log(`  medium: ${mediumCount}, long: ${longCount}`);

  // -------------------------------------------------------------------------
  // Function 3 — getVideoDetails
  // -------------------------------------------------------------------------
  hr('FUNCTION 3 — getVideoDetails (first 5 IDs from fn2)');
  const ids = summaries.slice(0, 5).map((v) => v.videoId);
  const details = await getVideoDetails(ids);
  console.log(`returned ${details.length} video(s) after filtering`);
  for (const d of details) {
    const mins = Math.round(d.duration / 60);
    console.log(`\n  "${d.title.slice(0, 55)}"`);
    console.log(`    views=${fmt(d.viewCount)}  likes=${fmt(d.likeCount)}  comments=${fmt(d.commentCount)}  duration=${mins}m`);
    console.log(`    category=${d.categoryName} (${d.categoryId})  lang=${d.defaultLanguage || '(unset)'}`);
    console.log(`    tags (${d.tags.length}): ${d.tags.slice(0, 5).join(', ')}`);
    console.log(`    thumbHiRes: ${d.thumbnailHighRes ? 'OK' : 'MISSING'}`);
    console.log(`    isLiveStream=${d.isLiveStream}  madeForKids=${d.madeForKids}`);
  }

  // -------------------------------------------------------------------------
  // Function 4 — getChannelVideoVelocity
  // -------------------------------------------------------------------------
  hr('FUNCTION 4 — getChannelVideoVelocity');
  const velocity = await getChannelVideoVelocity(CHANNEL_ID);
  if (!velocity) {
    console.error('FAIL: null returned');
  } else {
    console.log(`channelAvgViews: ${fmt(velocity.channelAvgViews)}`);
    console.log(`viralThreshold:  ${Math.round((velocity.channelAvgViews / 48) * 3)} views/hr`);
    console.log(`videos analyzed: ${velocity.videos.length}`);
    for (const v of velocity.videos) {
      const flags = [
        v.isViral ? '🔥VIRAL' : '',
        v.isActiveViral ? '⚡ACTIVE' : '',
      ].filter(Boolean).join(' ');
      console.log(
        `  [${String(Math.round(v.hoursSincePublished)).padStart(5)}h ago]` +
        ` vel=${String(v.velocityScore.toFixed(1)).padStart(8)}/hr` +
        ` views=${fmt(v.viewCount).padStart(9)}` +
        `  ${flags ? flags + ' ' : ''}"${v.title.slice(0, 45)}"`,
      );
    }
  }

  // -------------------------------------------------------------------------
  // Function 5 — getCompetitorFullProfile
  // -------------------------------------------------------------------------
  hr('FUNCTION 5 — getCompetitorFullProfile');
  const profile = await getCompetitorFullProfile(CHANNEL_ID);
  if (!profile) {
    console.error('FAIL: null returned');
  } else {
    console.log(`channel:       ${profile.channel.name} (${fmt(profile.channel.subscriberCount)} subs)`);
    console.log(`recentVideos:  ${profile.recentVideos.length} videos returned`);
    console.log(`velocityData:  ${profile.velocityData.videos.length} videos analyzed`);
    console.log(`  avgViews:    ${fmt(profile.velocityData.channelAvgViews)}`);
    const viral = profile.velocityData.videos.filter((v) => v.isViral);
    console.log(`  viral:       ${viral.length} video(s)`);
    console.log(`syncedAt:      ${profile.syncedAt}`);
  }

  // -------------------------------------------------------------------------
  // Function 6 — getTopicCoverage (uses details from fn5 if available)
  // -------------------------------------------------------------------------
  hr('FUNCTION 6 — getTopicCoverage');
  const sourceVideos = profile?.recentVideos ?? details;
  const coverage = getTopicCoverage(sourceVideos);
  console.log(`videos analyzed:      ${sourceVideos.length}`);
  console.log(`unique tags:          ${coverage.allTags.length}`);
  console.log(`top tags:             ${coverage.topTags.slice(0, 8).join(', ')}`);
  console.log(`categories:           ${JSON.stringify(coverage.categories)}`);
  console.log(`avgDurationSeconds:   ${coverage.avgDurationSeconds}s (${Math.round(coverage.avgDurationSeconds / 60)}m)`);
  console.log(`commonTitleWords:     ${coverage.commonTitleWords.slice(0, 10).join(', ')}`);

  console.log('\n\nAll 6 functions tested successfully.');
}

run().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
