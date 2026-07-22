# ShowStencil — Build Log, Status, Known Issues

> Extracted from CLAUDE.md (PR-9). Chronological build history, feature status, security audit log, known issues, and planned-but-not-built.

## Feature Build Status

> Legend: ✅ Done | 🔲 Not started | 🚧 Stub/partial

### Backend / Library layer

| File | Status | Notes |
|---|---|---|
| `lib/supabase.ts` | ✅ | createClient (anon) + createServiceClient (service role) |
| `lib/youtube-analytics.ts` | ✅ | 5 authenticated functions, revenue 401 fix |
| `lib/youtube-data.ts` | ✅ | 6 public Data API functions, velocity scoring |
| `lib/niche-engine.ts` | ✅ | detectNiche (Claude), findCompetitors, saveDetectedNiche, detectAndAssignCompetitors — now detects up to 2 Tier1 + 2 Tier2 + 1 Dominator (was 1+1+1); tier slot counts checked per-tier, not global |
| `lib/gap-scorer.ts` | ✅ | calculateGapScore, buildCompetitorMetrics, estimateRevenue, saveGapScore |
| `lib/db.ts` | ✅ | All snapshot/video/competitor CRUD + getCompetitorMetricsFromDB |
| `lib/trend-detector.ts` | ✅ | detectViralVideos, findUncoveredTopics (Claude), getTrendingInNiche |
| `lib/digest-generator.ts` | ✅ | Full Claude digest pipeline — best/worst videos, posting day, structured ideas, fallback mode, multi-niche test |
| `lib/idea-generator.ts` | 🗑️ deleted | Superseded by `app/api/ideas/generate/route.ts` (Day 20). Dead JSONB schema writer removed Day 32. |
| `lib/revenue-benchmarks.ts` | ✅ | getNicheBenchmarks (12 niches), calculateRevenuePotential, getBenchmarkComparison, getSubscriberTier |
| `lib/email.ts` | ✅ | sendWeeklyDigest, sendTrendAlert, checkAndSendAlerts, generateUnsubscribeToken |
| `lib/stripe.ts` | 🔲 | Replaced by PayPal — file deleted; use lib/paypal.ts |
| `lib/paypal.ts` | ✅ | getAccessToken, createSubscription, cancelSubscription, getSubscriptionDetails, verifyWebhookSignature, getPlanFromPayPalPlanId — replaces lib/lemonsqueezy.ts (Day 41) |
| `lib/access.ts` | ✅ | canAccess, getCompetitorLimit (free:1, starter:6, pro:13), getIdeaLimit (free:1, starter:3, pro:10), getViralLimit, getTopicLimit, getArchiveWeeks, getUpgradeMessage, canGenerateThumbnail; FEATURE_GATES: alerts:daily (starter+), insights:ai (starter+), search:compare (pro only); getUserPlan: cancelled+future current_period_end → keeps stored plan, cancelled+past period or expired → free |
| `lib/utils.ts` | ✅ | Shared formatting/date utilities — cn() Tailwind class merger (clsx + tailwind-merge) |
| `lib/competitor-metrics.ts` | ✅ | calculateCompetitorMetrics — pure function, no DB calls; computes video_count, avg_views, avg_length, upload_frequency_30d, velocity_score_avg from a video row array |
| `lib/image-utils.ts` | ✅ | padToSixteenNine (sharp) — server-side padding of any image to 16:9 by sampling edge pixel colour; used in thumbnail pipeline before Supabase upload |
| `lib/niche-images.ts` | ✅ | getNicheImage + getShuffledNicheImages — maps niche_id to curated stock image filenames in public/niche-images/ with seeded Fisher-Yates shuffle; stable per generation seed |
| `lib/env-validation.ts` | ✅ | validateEnv — checks 9 required env vars at startup; throws with clear list of missing keys |
| `lib/logger.ts` | ✅ | logError — writes structured error records to error_logs Supabase table (userId, route, error, details JSONB, severity); logSyncAttempt — writes every /api/sync attempt to sync_logs (status, durationMs, ip, country, city, userAgent, channelId, videosSynced); both never throw; both called with void |
| `lib/sub-niche-detector.ts` | ✅ | detectSubNiche (Claude, model claude-sonnet-4-6), calculateSubNicheSimilarity, detectAndSaveSubNiche(userId) — granular sub-niche within a broad niche; detectAndSaveSubNiche loads user + recent video titles ('title' only — videos has no description column), runs detection, writes sub_niche fields; called in-process (awaited) by sync-logic and by the detect-sub-niche route |
| `lib/db.ts` (Day 13 additions) | ✅ | saveCompetitorSnapshot, getCompetitorSnapshots, getAllCompetitorSnapshotsForUser, updateCompetitorMetrics, saveCompetitorInsights, getCachedInsights; saveChannelSnapshot extended with optional extras (demographics + trafficSources) written to three new JSONB columns (Day 42) |
| `lib/dominator-finder.ts` | ✅ | findDominatorsForUser — niche-specific rules (sub_niche match for gaming/fitness/tech/education, broad for others) |
| `lib/plan-limits.ts` | ✅ | PLAN_LIMITS config, getPlanLimits, canSearchThisMonth — Free: 1 total (1 auto Tier1), Starter: 6 total (2 T1 + 2 T2 + 1 Dom auto + 1 searched), Pro: 13 total (10 auto + 3 searched) |
| `lib/competitor-matcher.ts` | ✅ | calculateTier, CompetitorMatch — tier from sub ratio, sub-niche enrichment |
| `lib/channel-search.ts` | ✅ | normalizeChannelInput (URL/handle/channelId), getChannelData, cache read/write — 7-day TTL |
| `lib/competitor-insights.ts` | ✅ | generateCompetitorInsights (Claude) — 6-8 typed insights; expanded with best/worst videos, revenue+RPM, gap scores, viral videos, subscriber growth trend; max_tokens 1800 |
| `lib/gemini-image.ts` | ✅ | generateThumbnail — calls Gemini gemini-2.5-flash-image with creator photo + thumbnail brief + title; 16:9 safe-zone and widescreen framing enforced in prompt; no-photo mode sends solid-colour background prompt (stick figure removed Day 36); returns base64 PNG |
| `lib/thumbnail-storage.ts` | ✅ | uploadThumbnail (stores to Supabase Storage, returns public URL), deleteThumbnailFromStorage; loadStickFigureBase64 removed (stick figure eliminated from thumbnail pipeline) |
| `lib/access.ts` (thumbnail additions) | ✅ | canGenerateThumbnail — checks plan + monthly quota (free: 0, starter: 12, pro: 40); auto-resets quota monthly; returns ThumbnailQuota with quotaUsed/quotaLimit/quotaResetAt |

### API routes

| Route | Status | Notes |
|---|---|---|
| `app/api/auth/[...nextauth]/route.ts` | ✅ | NextAuth v5 with Google + YouTube scopes |
| `app/api/sync/route.ts` | ✅ | Thin session-auth wrapper around `lib/sync-logic.ts`; fires sub-niche detection fire-and-forget on first sync |
| `lib/sync-logic.ts` | ✅ | `syncUserChannel` + `refreshAccessToken` — all user analytics sync logic; callable without HTTP |
| `app/api/cron/user-sync/route.ts` | ✅ | Daily 3am UTC; calls `syncUserChannel()` directly per user via Promise.allSettled |
| `app/api/cron/weekly-digest/route.ts` | ✅ | Runs every Monday 9am UTC; generateDigest for all active users |
| `app/api/cron/refresh-data/route.ts` | ✅ | Runs daily 3am UTC; competitor data sync only (user sync moved to user-sync cron) |
| `app/api/cron/trend-detection/route.ts` | ✅ | Runs daily 6am UTC; fetches competitor videos, calculates velocity + is_viral |
| `app/api/cron/cache-cleanup/route.ts` | ✅ | Runs daily 2am UTC; purges expired searched_channels_cache + search_history >90 days |
| `app/api/cron/sub-niche-detection/route.ts` | ✅ | Runs daily 5am UTC; refreshes sub_niche for users missing it or stale >30 days |
| `app/api/cron/dominator-refresh/route.ts` | ✅ | Runs daily 4am UTC; finds + updates Dominator (Tier 3) competitor for all active users |
| `app/api/cron/daily/route.ts` | 🗑️ deleted | Old Week 1 stub — deleted Day 36; fully superseded by the 5 dedicated cron routes above |
| `app/api/subscription/create/route.ts` | ✅ | PayPal subscription checkout — reads plan from body, calls createSubscription(), returns approvalUrl for redirect |
| `app/api/webhooks/paypal/route.ts` | ✅ | PayPal webhook: BILLING.SUBSCRIPTION.ACTIVATED/CANCELLED/EXPIRED/SUSPENDED + PAYMENT.SALE.COMPLETED; verifyWebhookSignature via PayPal API; CANCELLED preserves plan + stores billing_info.next_billing_time; EXPIRED downgrades to free; SUSPENDED sends payment failed email (Day 41) |
| `app/api/competitors/[id]/sync/route.ts` | ✅ | POST manually re-syncs videos for a single competitor — auth + ownership check, fetches last 10 YouTube videos, upserts to competitor_videos |
| `app/api/thumbnail-jobs/[jobId]/status/route.ts` | ✅ | GET thumbnail job status — auth-gated; returns status/thumbnail_url/error_message/timestamps |
| `app/api/health/route.ts` | ✅ | GET — public, no auth; returns { status: 'ok', timestamp } for uptime monitoring |
| `app/api/unsubscribe/route.ts` | ✅ | Token-based one-click unsubscribe, no auth required, returns styled HTML |
| `app/api/settings/notifications/route.ts` | ✅ | GET + POST notification prefs, auth required, validates multiplier range |
| `app/api/competitors/[id]/route.ts` | ✅ | GET single competitor row (auth + ownership check) |
| `app/api/competitors/search/route.ts` | ✅ | POST channel search — validates plan limit, normalises URL/handle/ID, checks cache, returns channel data |
| `app/api/competitors/track/route.ts` | ✅ | POST add searched channel as competitor — enforces plan slot limit, calculates tier + sub-niche match |
| `app/api/competitors/insights/route.ts` | ✅ | POST generate Claude insights for a specific competitor — loads user/competitor metrics, returns typed insights array |
| `app/api/users/detect-sub-niche/route.ts` | ✅ | POST trigger sub-niche detection — thin auth wrapper (session OR cron secret) over `detectAndSaveSubNiche()` in lib/sub-niche-detector.ts; no duplicated detection logic |
| `app/api/ideas/generate/route.ts` | ✅ | POST full idea generation pipeline — plan gate, insights pre-warm, 4-signal Claude prompt, bracket-depth JSON parse, individual row insert, prune; max_tokens 5000 |
| `app/api/ideas/[id]/plan/route.ts` | ✅ | POST mark idea as planned — sets planned_at |
| `app/api/ideas/[id]/made/route.ts` | ✅ | POST mark idea as made — sets made_at |
| `app/api/ideas/[id]/generate-thumbnail/route.ts` | ✅ | POST generate thumbnail — plan + quota gate, fetches creator photo (camera/upload/Google profile/no-photo), calls Gemini via lib/gemini-image.ts, uploads to Supabase Storage, updates ideas row; uses next/server after() for async DB writes |
| `app/api/user/profile/route.ts` | ✅ | GET user profile + subscriber count; PATCH niche_id (validated against 12-niche list) |
| `app/api/competitors/route.ts` | ✅ | GET competitor list for authenticated user, supports ?active=true filter |
| `app/api/gap-score/latest/route.ts` | ✅ | GET most recent gap_scores row (overall_score, primary_bottleneck, all per-metric scores) |
| `app/api/ideas/latest/route.ts` | ✅ | GET top 3 most recent ideas with non-null opportunity_score, ordered by generated_at DESC |
| `app/api/onboarding/complete/route.ts` | ✅ | POST sets onboarding_completed=true — called by Step 5 and skip link |
| `app/api/account/delete/route.ts` | ✅ | POST deletes all user data in FK order, cancels LS subscription if active, signs user out |
| `app/api/subscription/cancel/route.ts` | ✅ | POST cancels LS subscription via DELETE /v1/subscriptions/:id API call; sets subscription_status='cancelled' and stores ends_at as current_period_end — does NOT drop subscription_plan to free immediately; user retains paid access until billing period ends |
| `app/api/subscription/downgrade/route.ts` | ✅ | POST downgrade Pro → Starter via PayPal subscription revise API; validates user is on pro plan with active subscription; calls POST /v1/billing/subscriptions/{id}/revise with PAYPAL_STARTER_PLAN_ID; returns approvalUrl for PayPal redirect |

### App pages

| Page | Status | Notes |
|---|---|---|
| `app/(auth)/login/page.tsx` | ✅ | Google sign-in button |
| `app/(auth)/callback/page.tsx` | 🔲 | OAuth callback — not yet needed (NextAuth handles it) |
| `app/(dashboard)/layout.tsx` | ✅ | Auth guard + first-sync trigger |
| `app/(dashboard)/dashboard/page.tsx` | ✅ | Full dashboard: gap score panel, 5-metric strip, competitors table (Tier1+Tier2 only), trend radar, views chart, top ideas, "View all competitors →" link |
| `app/(dashboard)/competitors/page.tsx` | ✅ | Rebuilt: filter tabs (All/Tier1/Tier2/Dominator), CompetitorsTable, UpgradeBanner, PlanLimitIndicator |
| `app/(dashboard)/competitors/[id]/page.tsx` | ✅ | Per-competitor deep analysis: loads competitor + videos + user snapshots, renders CompetitorAnalysis (5 tabs) |
| `app/(dashboard)/digest/page.tsx` | ✅ | Weekly digest list: past digests with preview, gap score, email-sent status |
| `app/(dashboard)/digest/[id]/page.tsx` | ✅ | Digest detail view — parses markdown into sections, injects live competitor block from DB, removes ideas section (ideas live on /ideas), shows key metrics grid |
| `app/(dashboard)/ideas/page.tsx` | ✅ | Video idea suggestions: scored idea cards with 3-hook content brief, thumbnail generation, mark-as-planned/made, done section |
| `app/(dashboard)/settings/page.tsx` | ✅ | Settings page: plan info, interactive notification toggles + threshold slider wired to API, account actions |
| `app/(dashboard)/settings/notifications/page.tsx` | ✅ | Redirects to `/settings` — notifications UI lives in NotificationSettings component on the main settings page |
| `app/(dashboard)/dashboard/loading.tsx` | ✅ | Skeleton loading UI for dashboard route |
| `app/(dashboard)/competitors/loading.tsx` | ✅ | Skeleton loading UI for competitors list route |
| `app/(dashboard)/digest/loading.tsx` | ✅ | Skeleton loading UI for digest route |
| `app/(dashboard)/ideas/loading.tsx` | ✅ | Skeleton loading UI for ideas route |
| `app/(dashboard)/settings/loading.tsx` | ✅ | Skeleton loading UI for settings route |
| `app/global-error.tsx` | ✅ | Sentry-wired global error boundary — captures errors to Sentry, shows recovery UI |
| `instrumentation.ts` | ✅ | Next.js instrumentation hook — initialises Sentry on server startup |
| `app/onboarding/page.tsx` | ✅ | 5-step onboarding wizard — URL state (?step=1..5), background sync on Step 1, skip anywhere Step 2+, browser back/forward syncs step state |
| `app/page.tsx` | ✅ | Full landing page — Nagai hero, time-of-day sky system, feature grid, CTA, footer |
| `app/pricing/page.tsx` | ✅ | Thin server wrapper — passes session + plan to PricingClient.tsx |
| `app/pricing/PricingClient.tsx` | ✅ | Full 3-card pricing page (Free / Starter / Pro) — rebuilt Day 39; feature comparison rows, CTA buttons wired to LS checkout; highlights current plan; free tier card shows 1 competitor / 1 idea limits |
| `app/privacy/page.tsx` | ✅ | Privacy policy — Termly-generated HTML embedded in dark-themed Next.js page |
| `app/terms/page.tsx` | ✅ | Terms of use — Termly-generated HTML embedded in dark-themed Next.js page |

### Components

| Directory | Status | Notes |
|---|---|---|
| `components/sync-context.tsx` | ✅ | SyncProvider + useSyncStatus hook |
| `components/BlackholeLoader.tsx` | ✅ | Animated loading spinner used during first sync |
| `components/dashboard/DashboardClient.tsx` | ✅ | Full dashboard client component — all panels, chart, metric strip, gap rows; updated to show Tier1+Tier2 only + View all link |
| `components/dashboard/SidebarNav.tsx` | ✅ | Left sidebar navigation: workspace + account links, active state |
| `components/dashboard/SignOutButton.tsx` | ✅ | Sign-out button using next-auth signOut |
| `components/competitors/CompetitorsTable.tsx` | ✅ | Filterable table — tier badge, sub-niche label, last synced, link to /competitors/[id] |
| `components/competitors/CompetitorAnalysis.tsx` | ✅ | 5-tab shell (Overview/Content/Growth/Videos/Insights) for /competitors/[id] |
| `components/competitors/ChannelSearchBar.tsx` | ✅ | URL/handle/ID input, search API call, results list with track button, plan limit guard |
| `components/competitors/TierBadge.tsx` | ✅ | Tier 1/2/3 + Dominator label, colour-coded pill badges |
| `components/competitors/UpgradeBanner.tsx` | ✅ | Plan upgrade prompt displayed when competitor slot limit is reached |
| `components/competitors/PlanLimitIndicator.tsx` | ✅ | Shows X of N competitor slots used |
| `components/competitors/tabs/OverviewTab.tsx` | ✅ | Subscriber/view/watch-time comparison cards between user and competitor |
| `components/competitors/tabs/ContentTab.tsx` | ✅ | Upload patterns, video formats, topic cluster analysis |
| `components/competitors/tabs/GrowthTab.tsx` | ✅ | Growth velocity chart comparing user vs competitor snapshots |
| `components/competitors/tabs/VideosTab.tsx` | ✅ | Recent competitor videos list with velocity score and viral flag |
| `components/competitors/tabs/InsightsTab.tsx` | ✅ | Fetches Claude insights via /api/competitors/insights, renders typed insight cards; free plan shows locked upgrade prompt instead of generating |
| `components/ideas/IdeasClient.tsx` | ✅ | Full ideas client — loading stages, 3-hook content brief (Safe/Bolder/Most controversial; hooks 2+3 locked for free plan), thumbnail generation (locked for free — shows upgrade link); mark-as-planned/made, done section, regenerate confirmation modal; regenerate button removed from individual cards (one thumbnail per idea) |
| `components/ideas/ThumbnailGenerationModal.tsx` | ✅ | Multi-step modal — choose_source → camera/upload/google_profile/no_photo → generating → completed/failed; resizes images client-side before upload; framer-motion transitions; no-photo flow simplified (stick figure removed) |
| `components/onboarding/OnboardingProgress.tsx` | ✅ | Animated dot progress bar — completed=green, current=wide white pill, future=zinc-700 |
| `components/onboarding/StepWelcome.tsx` | ✅ | Hero step — Instrument Serif heading, italic amber accent, fires sync on "Let's go" |
| `components/onboarding/StepConfirmChannel.tsx` | ✅ | Polls /api/user/profile, shows avatar/name/subs, "Wrong account" signout |
| `components/onboarding/StepConfirmNiche.tsx` | ✅ | Polls for niche detection (1.5s × 20), dropdown override, PATCH on change |
| `components/onboarding/StepMeetCompetitors.tsx` | ✅ | Polls for all 3 tiers (2s × 30), staggered reveal, tier badges, partial/timeout fallback |
| `components/onboarding/StepFirstAnalysis.tsx` | ✅ | 20s progress bar + stage labels, fetches gap score + latest idea, reveal with fallback |
| `components/settings/NotificationSettings.tsx` | ✅ | Client Component — digest toggle, alerts toggle, threshold slider, optimistic updates, 2s "Saved ✓" indicator, slider disabled when alerts off |
| `components/settings/CancelSubscription.tsx` | ✅ | Client Component — "Cancel Subscription" button + confirmation modal; calls POST /api/subscription/cancel; on success shows "access until [date]" confirmation state before refreshing page; shown for 'active' and 'on_trial' users only |
| `components/settings/DeleteAccount.tsx` | ✅ | Client Component — "Delete Account" button, confirmation modal requiring exact "CONFIRM" input, calls POST /api/account/delete, redirects to / on success |
| `components/ui/expandable-card.tsx` | ✅ | Framer-motion expandable card primitive (title, image, description, children) — available but not yet wired to any dashboard feature |
| `components/charts/SubscriberGrowthChart.tsx` | ✅ | Log-scale multi-line Recharts chart for subscriber growth over time (user + all competitors, colour-coded by tier) |
| `emails/weekly-digest.tsx` | ✅ | React Email template: gap score badge, metrics, ideas, competitor moves, CTA |
| `emails/trend-alert.tsx` | ✅ | React Email template: viral video alert with suggested angle |

### Types

| File | Status | Notes |
|---|---|---|
| `types/index.ts` | ✅ | All interfaces + additions: User (sub_niche fields, paypal_subscription_id, thumbnail quota fields), Competitor (is_dominator, is_searched, sub_niche fields), Idea (thumbnail_image_url, thumbnail_generated_at, thumbnail_source_type, hook_2, hook_3), ThumbnailJob, PlanType, SubscriptionStatus (includes 'expired'); ChannelSnapshot: added age_gender_breakdown, top_countries, traffic_sources nullable JSONB fields (Day 42) |
| `types/next-auth.d.ts` | ✅ | NextAuth session type extensions |

### Scripts / Dev tooling

| Script | Status | Notes |
|---|---|---|
| `scripts/refresh-token.ts` | ✅ | Refresh expired OAuth token without browser re-login |
| `scripts/test-youtube-analytics.ts` | ✅ | Manual test for all 5 Analytics API functions |
| `scripts/test-youtube-data.ts` | ✅ | Manual test for all 6 Data API functions |
| `scripts/seed-test-data.ts` | ✅ | Inserts realistic finance creator test data into Supabase |
| `scripts/test-gap-scorer.ts` | ✅ | End-to-end DB → gap scorer → save pipeline test |
| `scripts/test-full-pipeline.ts` | 🗑️ deleted | Day 6 artifact. Tested old 7-step pipeline incl. dead JSONB ideas writer. Deleted Day 32. |
| `scripts/create-ideas-table.ts` | ✅ | Provisions the ideas table in Supabase (run once) |
| `scripts/test-email.ts` | ✅ | Sends real weekly digest email to test user inbox |
| `scripts/test-trend-alert.ts` | ✅ | Sends real trend alert email + tests checkAndSendAlerts |
| `scripts/get-unsubscribe-token.ts` | ✅ | Prints unsubscribe token + test URL for the test user |
| `scripts/re-enable-notifications.ts` | ✅ | Re-enables digest + alerts for test user after unsubscribe testing |
| `scripts/update-gap-scores.ts` | ✅ | One-time script: sets watch_time=15, upload_freq=85, topic_coverage=NULL for test user |
| `scripts/check-competitors.ts` | ✅ | Prints competitor rows + video counts for the test user — diagnostic |
| `scripts/diagnose-sync.ts` | ✅ | End-to-end sync diagnostic: token validity, channel snapshot, video count, competitor counts |
| `scripts/fix-competitor-tiers.ts` | ✅ | One-time script: recalculates and writes correct tier values from sub ratio |
| `scripts/reset-inactive-competitors.ts` | ✅ | Deletes competitors with zero videos (FK order: snapshots → videos → row) — used to clean up inactive auto-detected channels |
| `scripts/sync-competitor-videos.ts` | ✅ | One-time manual video sync for a specific competitor — used to backfill after track-route fix |
| `scripts/test-all-endpoints.ts` | ✅ | Full API endpoint smoke-test suite — sends real HTTP requests to all 29 routes and checks status codes |
| `scripts/test-api-key.ts` | ✅ | Validates Anthropic + YouTube API keys by making minimal live calls |
| `scripts/test-cron.ts` | ✅ | Sends authenticated requests to all 7 cron routes and checks responses |
| `scripts/test-insights-expanded.ts` | ✅ | Validates expanded insights output (9 checks: both channel names, specific metrics, gap scores, viral patterns) |
| `scripts/test-send-digest-email.ts` | ✅ | Sends a real weekly digest email to the test inbox and verifies Resend message ID |
| `scripts/test-sync.ts` | ✅ | Calls POST /api/sync for the test user and logs timing + snapshot results |
| `scripts/test-token-refresh.ts` | ✅ | Tests OAuth token refresh flow — uses stored refresh token, writes new access token to DB |
| `scripts/update-competitor-thumbnails.ts` | ✅ | One-time script: populates missing channel_thumbnail on competitors rows via YouTube Data API |
| `scripts/health-check.ts` | ✅ | Production invariant checker (read-only). 8 SQL invariants + 1 deferred (cron staleness — needs cron route instrumentation). Exit codes: 0=pass, 1=CRITICAL, 2=HIGH/WARN. Run: `npx tsx --env-file=.env.local scripts/health-check.ts` |
| `scripts/integration/sync-pipeline.test.ts` | ✅ | 7 integration tests for `syncUserChannel()`. Real Supabase, mocked external APIs via `globalThis.fetch` interceptor. Test users use `@showstencil-test.invalid` for isolated cleanup. Covers: happy path with niche detection, niche-already-set (Claude not called), 0-video user, Claude confidence 0, expired-token-no-refresh, Analytics 500 graceful degradation, self-heal on second sync. Run: `npx tsx --env-file=.env.local scripts/integration/sync-pipeline.test.ts` |
| `scripts/integration/mock-fetch.ts` | ✅ | Strict-mode `globalThis.fetch` interceptor with Supabase passthrough. Stock handlers for YouTube Analytics, YouTube Data (channels + videos), Anthropic, Google OAuth, sub-niche no-op. Used by sync-pipeline.test.ts only |
| `scripts/integration/_audit-cleanup.ts` | ✅ | One-shot audit confirming no `@showstencil-test.invalid` users remain in prod after integration runs. Run: `npx tsx --env-file=.env.local scripts/integration/_audit-cleanup.ts` |

---


## What Is Built So Far

> Update this section every Friday

### Week 5 — Day 50 (2026-07-09) — YouTube API compliance fixes (III.A.1 + III.E.4)

**Two YouTube API Services compliance violations fixed in one pass. tsc --noEmit: zero errors.**

*Fix 1 — Violation III.A.1 (Terms of Use must reference YouTube ToS):*
* `app/terms/page.tsx` — added a visible bordered card above the Termly embed (below the "← Back to settings" link) stating: "By using ShowStencil, you agree to be bound by the YouTube Terms of Service (linked to https://www.youtube.com/t/terms). ShowStencil uses YouTube API Services." The phrase "YouTube Terms of Service" is a real anchor to `https://www.youtube.com/t/terms` (`target="_blank"`, `rel="noopener noreferrer"`), styled `#60a5fa` underline to be visible on the dark theme. Termly content untouched.

*Fix 2 — Violation III.E.4(a–g) (only store/use tokens for ACTIVE users; revoke + delete otherwise):*
* `supabase/migrations/20260709000000_add_last_active_at.sql` — NEW. `ALTER TABLE public.users ADD COLUMN IF NOT EXISTS last_active_at TIMESTAMPTZ;`
* `types/index.ts` — `User` interface gains `last_active_at: string | null` (after `onboarding_completed`).
* `app/(dashboard)/layout.tsx` — after the auth + `getUser` check, stamps `users.last_active_at = NOW()` for the logged-in user. Wrapped in try/catch, logs via `logError` (warn) on failure, never blocks render. Runs before the onboarding redirect.
* `app/api/cron/user-sync/route.ts` — (2c) user-load query now adds `.gte('last_active_at', thirtyDaysAgo)` (ISO string) alongside the existing `onboarding_completed` + `youtube_access_token IS NOT NULL` filters; NULL last_active_at is treated as inactive by design. (2d) new self-contained block after the sync loop (own try/catch): selects users with `last_active_at < thirtyDaysAgo` AND non-null `youtube_access_token`, POSTs to `https://oauth2.googleapis.com/revoke?token=...` (per-token try/catch), then nulls `youtube_access_token` + `youtube_refresh_token` + `token_expires_at`. Summary count `stale_tokens_cleared` logged + returned in the JSON response.
* `app/api/account/delete/route.ts` — user SELECT extended with `youtube_access_token`; before deleting the user row, POSTs to the same revoke endpoint (try/catch, non-fatal, `logError` warn on failure). All existing FK-order deletion + PayPal cancellation logic intact.

*Manual step required:* run `supabase/migrations/20260709000000_add_last_active_at.sql` in the Supabase SQL editor before deploy.

---

### Week 4 — Day 49 (2026-06-18 → 06-19) — sub-niche detection production fixes + dead self-HTTP removal

**Four production bugs that all shared the same symptom — `sub_niche` never populated for any real user — plus removal of the last localhost self-HTTP call. After the Day 48 taxonomy migration wiped every `sub_niche` value (intentionally, to repopulate under the new taxonomy), the repopulation never happened in production because the detection path was broken in four independent ways. This session fixed all four and made the failures loud instead of silent.**

*tsc --noEmit: zero errors after each commit.*

---

*Fix 1 — `lib/sub-niche-detector.ts` + `scripts/test-api-key.ts` — stale Anthropic model ID (commit 6db2e5f):*
* `detectSubNiche` hardcoded the deprecated model string `"claude-sonnet-4-20250514"`, which the Anthropic API now returns 404 for. The 404 was swallowed by the surrounding try/catch + `Promise.allSettled`, so sub-niche detection silently produced nothing for every user (both the daily cron and the per-sync trigger). Updated to the current `claude-sonnet-4-6`. Same stale ID fixed in `scripts/test-api-key.ts`.

*Fix 2 — `lib/sub-niche-detector.ts` + `lib/sync-logic.ts` + `app/api/users/detect-sub-niche/route.ts` — self-HTTP to localhost (commit e33b170):*
* `syncUserChannel` fired sub-niche detection as a fire-and-forget `POST` to `${NEXT_PUBLIC_APP_URL}/api/users/detect-sub-niche` — and `NEXT_PUBLIC_APP_URL` defaults to `http://localhost:3000`, which does not resolve on Vercel. The POST failed silently, so `sub_niche` was never populated in production. Additionally, a detached fire-and-forget promise would be killed when the serverless function returns anyway.
* Extracted **`detectAndSaveSubNiche(userId)`** as a reusable function in `lib/sub-niche-detector.ts` (returns a `DetectAndSaveSubNicheResult` discriminated union: `user_not_found` | `insufficient_videos` | success). It loads the user, fetches recent video titles, runs `detectSubNiche`, and writes `sub_niche` + `sub_niche_keywords` + `sub_niche_confidence` + `sub_niche_detected_at` to the users table.
* `sync-logic.ts` step 5 now **awaits** `detectAndSaveSubNiche(userId)` directly in-process (mirroring how niche detection already worked), wrapped in try/catch with a warn-level `logError`. Awaiting (not fire-and-forget) guarantees completion before the serverless response returns.
* `app/api/users/detect-sub-niche/route.ts` reduced to a thin auth wrapper (session OR cron-secret) over the same `detectAndSaveSubNiche` function — no duplicated detection logic.

*Fix 3 — `lib/sub-niche-detector.ts` — non-existent `videos.description` column (commit 8a83136):*
* `detectAndSaveSubNiche` selected `'title, description'` from the `videos` table, but that table has **no `description` column**. The query errored with Postgres `42703` (undefined column), the error was discarded, `videos` degraded to `null`, and the `≥ 3-video` guard returned `insufficient_videos` before ever reaching Claude or the DB write. So sub-niche never populated despite valid video titles existing. Changed the select to `'title'` only (`detectSubNiche` already tolerates a missing description).
* Also captured the previously-swallowed errors on **both** the video fetch and the users `UPDATE` — they now `logError` (warn) with the Postgres error code, so future query / RLS / type failures surface loudly instead of masquerading as `insufficient_videos` or a silent no-op.

*Fix 4 — `lib/niche-engine.ts` — dead self-HTTP refresh-data trigger (commit 8612df1):*
* `detectAndAssignCompetitors` fired a fire-and-forget `GET` to `${NEXT_PUBLIC_APP_URL}/api/cron/refresh-data` (again defaulting to `http://localhost:3000`, failing silently on Vercel). The call was both **redundant** — `assignCompetitor` already populates each new competitor's videos, metrics, sub-niche, and snapshot synchronously before this block ran — and **mis-scoped**, since the unscoped cron GET would refresh *all* users from a single user's sync. Removed it. This was the last localhost self-HTTP call remaining in production code.

---

**Pattern across all four fixes:** every bug was masked by a swallowed error (404, network failure, `42703`, or a detached promise). The common remedy was to stop relying on self-HTTP for in-process work and to log the failures that were previously discarded. Sub-niche values now repopulate under the Day 48 taxonomy on the next sync / daily cron for every active user.

*Files touched:* `lib/sub-niche-detector.ts` (all 3 sub-niche fixes), `lib/sync-logic.ts`, `app/api/users/detect-sub-niche/route.ts`, `lib/niche-engine.ts`, `scripts/test-api-key.ts`.

---

### Week 4 — Day 48 (2026-06-11) — niche taxonomy v2 (12 → 31) + manual-selection flow

**Replaces the 12-niche legacy taxonomy with a 31-niche canonical taxonomy backed by a single source of truth (`lib/niches.ts`), removes the silent confidence-0 fallback that wrote a guessed niche to the DB, and adds an end-to-end manual-selection flow (NichePicker UI + /api/user/niche/manual + freeform niche_description column) for users whose channel can't be classified confidently. Impact: every niche-dependent surface (competitor auto-detection, sub-niche detection, dominator finder, gap scorer, digest, ideas, settings page, niche images) now reads from one slug allowlist; users in ambiguous niches are no longer silently misclassified as `'entertainment'`.**

*tsc --noEmit: zero errors across all 9 phases.*

---

*Phase 1 — `lib/niches.ts` — NEW (canonical taxonomy):*
* Exports `VALID_NICHE_SLUGS` (31 readonly tuple), `ValidNicheSlug` type, `NICHES` (full taxonomy with 400 sub-niches across all parents), `NicheDefinition`, `SubNiche` types, plus lookups: `getNicheBySlug`, `getSubNicheBySlug`, `getDisplayName`, `isValidNicheSlug`, `isNicheSlug`, `isSubNicheSlug`, `getAllNicheSlugs`, `getAllSubNicheSlugs`.
* Every entry exposes `searchQuery` — the canonical YouTube search phrase used by `findCompetitors` and `findBestCompetitorsForTier`. Replaces every previous per-file hardcoded query map.
* Slug rules applied uniformly: lowercase ASCII, underscores, apostrophes stripped, `&`/`and`/commas/slashes/hyphens collapse to `_`, US-specific niches suffix `_us`, parenthetical content dropped from slug (preserved in displayName). Sub-niches whose bare name would collide with another slug are parent-prefixed (e.g. `podcast → "Music"` becomes `podcast_music`).
* `assertTaxonomyInvariants()` runs at module load and throws on: duplicate niche slug, duplicate sub-niche slug, sub-niche slug colliding with a top-level slug, parentSlug mismatch, or NICHES drift from VALID_NICHE_SLUGS.
* Zero internal imports — the file is safely importable from anywhere in the project.

*Phase 2 — `supabase/migrations/20260609000000_niche_taxonomy_v2.sql` — NEW (DB migration):*
* Adds `users.niche_description TEXT` (nullable) for user-supplied free-text niche descriptions from the manual picker's "Other" branch.
* Remaps 8 legacy slugs in `users.niche_id` to their new-taxonomy equivalents (table below).
* Wipes legacy free-text `sub_niche` values from both `users` and `competitors` (the old detector returned arbitrary 2-5 word labels; the new taxonomy stores constrained slugs, so the existing values would never match). Sub-niches repopulate on next sync.

| Legacy slug | New slug | Why |
| --- | --- | --- |
| `finance` | `finance_crypto` | Personal finance + crypto are commonly mixed on YouTube; one bucket reflects how creators index. |
| `tech` | `tech_ai_software` | Modern tech vertical is dominated by AI + software + gadgets; renamed slug reflects scope. |
| `gaming` | `gaming` | Already valid under new taxonomy — no remap. |
| `cooking` | `food_drink_cooking` | Expanded scope (alcohol/drinks/mukbangs/food reviews). |
| `fitness` | `fitness` | Already valid under new taxonomy — no remap. |
| `beauty` | `beauty_makeup` | Slug renamed to match new displayName. |
| `travel` | `travel` | Already valid under new taxonomy — no remap. |
| `education` | `education` | Already valid under new taxonomy — no remap. |
| `business` | `business_startups` | Expanded scope (VC/leadership/freelancing/productivity). |
| `entertainment` | `entertainment_comedy` | Comedy is the dominant sub-vertical; renamed to match displayName. |
| `diy` | `home_diy` | Expanded scope (gardening/interior design/homesteading). |
| `vlog` | `entertainment_comedy` | Vlogs are now a sub-niche (`vlogs_daily_life`) under Entertainment & Comedy. The `sub_niche` column is wiped, so re-detection will assign the correct sub-niche on next sync. |

*Phase 3 — `lib/niche-engine.ts` + `types/index.ts` — Claude detection rewritten:*
* `NicheResult` interface rebuilt (`types/index.ts:227`): `nicheSlug: string | null`, `confidence: number`, `reasoning: string`, `requiresManualSelection: boolean`, `source: 'cache' | 'claude' | 'manual' | 'failure'`. The legacy `nicheId`/`nicheName` fields are gone.
* `detectNiche()`: prompt rebuilt to enumerate all 31 slugs + per-slug one-line descriptions via `describeNiche(slug)`. Confidence calibration explicit in prompt (0.9+ unambiguous, 0.6–0.8 mostly-clear, <0.6 return null). Cache path now ignores stale slugs that aren't in the current taxonomy (warn-level `logError`) instead of trusting them.
* `CONFIDENCE_THRESHOLD = 0.6`. **The silent confidence-0 / unknown-slug fallback to `'entertainment'` is removed entirely** — when Claude returns confidence below threshold OR an unknown slug, `detectNiche` returns `{ nicheSlug: null, requiresManualSelection: true }` and the DB is NOT written. The caller is responsible for surfacing the manual picker.
* `NICHE_OTHER_SENTINEL = 'other'` exported. Stored in `users.niche_id` when the user picks "Other" in the picker.
* `saveManualNicheSelection(userId, nicheSlug, { subNicheSlug, description })` — NEW, validated server-side: nicheSlug must be a valid taxonomy slug OR the `'other'` sentinel; subNicheSlug (if provided) must be a valid child of nicheSlug OR `'other'`; description ≥ 50 chars after trim is required when either is `'other'`. Writes `niche_id`, `sub_niche` (or null), `niche_description` (or null), and `niche_detected_at`. Returns boolean.
* `VALID_NICHE_IDS` (legacy 12-slug union) retained for a single deprecation cycle — explicitly marked DO NOT USE; only competitor-matcher.ts and dominator-finder.ts still imported it during Phase 3 (both migrated in Phase 4).
* Sync wiring (`lib/sync-logic.ts:459`, `app/api/sync/route.ts:185`): when `requiresManualSelection=true`, `niche_id` is left null and the flag is propagated up to the sync response so the dashboard can redirect to the picker. A warn-level `error_logs` entry is recorded for visibility.

*Phase 4 — Library layer migrated to canonical slugs:*
* `lib/competitor-matcher.ts` — `NICHE_SEARCH_TERMS` deleted. `findBestCompetitorsForTier` now reads the search query directly from `getNicheBySlug(slug)?.searchQuery` — one source of truth.
* `lib/dominator-finder.ts` — `NICHE_ID_TO_NAME` deleted. `NICHE_DOMINATOR_RULES: Record<ValidNicheSlug, 'sub_niche' | 'broad'>` rebuilt for all 31 slugs; `Record<ValidNicheSlug, …>` makes the map exhaustive at compile time (adding a niche without an entry is a TS error). Vertical-with-many-distinct-cultures niches (gaming, fitness, education, tech_ai_software, music, sports, podcast, product_reviews) require sub-niche match; coherent verticals (everything else) use broad match.
* `lib/revenue-benchmarks.ts` — benchmark table re-keyed by the 31 canonical slugs. Unknown slugs no longer throw; `getNicheBenchmarks(slug)` returns a mid-range default (CPM 5 / RPM 2.5) and logs a warn-level entry. New niches without real CPM data inherit reasonable defaults from the closest legacy niche, flagged as "estimated" in the file.
* `lib/gap-scorer.ts` — niche benchmark lookups migrated to the 31-slug map. No revenue formula changes.

*Phase 5 — `lib/niche-images.ts`:*
* Keyed on the new 31-slug taxonomy. `NEW_SLUG_TO_FOLDER` maps the 11 slugs that currently have image assets to their pre-existing on-disk folder names (folders weren't renamed to reduce deploy risk). The other 20 new slugs return `null` / `[]` silently — niche image cards on the digest just don't render until assets are added. `'vlog'` legacy images are orphaned on disk (both `'entertainment'` and `'vlog'` remap to `entertainment_comedy`; only the `entertainment/` folder is referenced).

*Phase 6 — `lib/sub-niche-detector.ts` + `app/api/users/detect-sub-niche/route.ts`:*
* `detectSubNiche(videos, { nicheDescription })` — added optional `nicheDescription` option. When non-empty, the description is appended to the Claude prompt as a separate "creator described their channel as" block AND the ≥ 3-video minimum is waived (so users who picked 'Other' or supplied a description but haven't synced many videos still get a sub-niche).
* `app/api/users/detect-sub-niche/route.ts` — reads `users.niche_description` in the same SELECT. When non-empty, passes through as `nicheDescription`. The minimum-3-videos guard now only fires when there's no description.

*Phase 7 — Manual-picker UI + API:*
* `components/onboarding/NichePicker.tsx` — NEW. Two cascading dropdowns: top-level niche (sorted alphabetically + literal "Other — describe below" option), then sub-niche (sorted alphabetically + "Other — describe below") only when a real top-level niche is chosen. Description textarea (3-5 sentence prompt + character counter) renders only when either dropdown is set to "Other". Submit disabled until: (1) top-level chosen, AND (2) either sub-niche chosen OR top-level is 'other', AND (3) when an "Other" branch was taken, description has ≥ 50 chars. Calls a parent-provided `onSubmit(selection)` that re-throws 4xx errors so the picker can display the validation message.
* `app/api/user/niche/manual/route.ts` — NEW. Auth-gated POST. Validates: nicheSlug ∈ VALID_NICHE_SLUGS ∪ {'other'}; subNicheSlug ∈ children-of-nicheSlug ∪ {'other'} OR absent; description ≥ 50 chars when either branch is 'other', ≤ 2000 chars always. Calls `saveManualNicheSelection()`. Returns `{ success, nicheSlug, subNicheSlug, displayName }` with displayName resolved via the canonical taxonomy.
* `components/onboarding/StepConfirmNiche.tsx` — rewritten. Three modes: `loading` (polls `/api/user/profile` every 1.5s × 20 attempts), `confirm-detected` (heading: "Based on your recent videos, you create *X* content. Is that right?" + "That's right →" / "Wrong niche" buttons), `picker` (renders NichePicker pre-filled with the detected slug when available, OR opened blank when polling timed out). The previous `'finance'` silent default and manual fallback dropdown are replaced entirely. Tap "Wrong niche" → picker mode.
* `app/api/user/profile/route.ts` — GET extended with `niche_description`, `niche_confidence`, `niche_display_name`, `sub_niche_display_name`, `requires_manual_selection` (derived: true when `niche_id IS NULL`, OR `niche_id='other'` without description, OR `sub_niche_confidence < 0.6`). PATCH now accepts `niche_description` (string ≤ 2000 chars or null).

*Phase 8 — UI surfaces aligned to new taxonomy:*
* `app/(dashboard)/settings/page.tsx:190` — "Detected niche" row uses `getDisplayName(user.niche_id)` instead of `.charAt(0).toUpperCase()...`. Renders human-readable displayNames for all 31 niches and a clean "Other" label for the sentinel.
* `components/competitors/tabs/ContentTab.tsx:108` — sub-niche explainer pulls niche displayName from `getDisplayName(nicheId)` instead of the legacy slug-with-first-letter-uppercased hack.

*Phase 9 — Scripts + seed data:*
* `scripts/seed-test-data.ts` — sets `niche_id='finance_crypto'` (was `'finance'`). Synthetic competitor channel IDs prefixed `comp_finance_crypto_*`. Verification block asserts the new slug.
* `scripts/test-gap-scorer.ts` — test user metrics use `nicheId: 'finance_crypto'`.
* `scripts/test-trend-alert.ts` — `channelId: 'comp_finance_crypto_sarah'`.
* `scripts/find-creators.ts` — `CATEGORY: ValidNicheSlug` typed against the canonical export; legacy 12-slug union removed.
* `scripts/test-everything.ts` — assertion banks updated (`niche_id` now expected to be a Phase-3 slug).

---

**Architecture: manual-selection flow end-to-end.** First sync runs `detectNiche()` against Claude. If `confidence ≥ 0.6` and the returned slug is in `VALID_NICHE_SLUGS`, niche is written and the user lands on the dashboard via Step 5 of onboarding. If `confidence < 0.6` OR Claude returns an unknown slug, **no DB write happens** — `requiresManualSelection: true` is set on the sync response. Step 3 of onboarding (`StepConfirmNiche`) polls `/api/user/profile`; the moment it sees `requires_manual_selection: true` it opens the NichePicker. The user picks a top-level niche (or "Other"), then a sub-niche (or "Other"), and supplies a 50–2000 char description when either is "Other". POST `/api/user/niche/manual` validates and writes `niche_id` + `sub_niche` + `niche_description`. Sub-niche detection then runs with the description as primary signal (the ≥ 3-video minimum is waived when a description exists), so newly-onboarded users with sparse video titles still get a useful sub-niche.

`niche_description` is also fed into competitor matching and digest prompts as the substitute for a known niche slug when the user is on `niche_id='other'` — it's the contract that keeps every downstream surface useful for niches the taxonomy doesn't cover.

---

**New invariants in `scripts/health-check.ts`:**

* **Invariant #1 (`users_with_videos_missing_niche`, CRITICAL) — cutoff widened from 2 hours to 7 days.** The manual-selection flow intentionally leaves `niche_id` NULL while the user sits in the picker. A 2-hour window would fire mid-picker. The 7-day window matches invariant #11 — past that point the user has abandoned the picker rather than just being slow, and NULL niche + synced videos is a real bug again.
* **Invariant #11 (`users_stuck_in_manual_niche_selection`, HIGH) — NEW.** `niche_id IS NULL` AND `created_at < NOW() - 7 days` AND email not `@showstencil-test.invalid` AND ≥ 1 `channel_snapshots` row exists (proves first sync completed). HIGH because the account is functional but degraded — every niche-dependent surface is blocked until the user picks. Sample limit 50.
* **Invariant #12 (`users_with_other_niche_no_description`, CRITICAL) — NEW.** `niche_id = 'other'` AND `niche_description IS NULL OR LENGTH(niche_description) < 50`. CRITICAL because every niche-dependent downstream surface (competitor matching, digest prompts, idea generation) leans on the description as the substitute for a known slug. The 50-char minimum is enforced by `/api/user/niche/manual`; this check verifies the contract holds in storage.

---

**Migration notes (run once in Supabase SQL editor):**

Order matters — Phase 9 application code reads the new slugs, so the migration must run BEFORE the Phase 1–8 deploy. The Phase 7 manual-picker API reads `niche_description`, so the column must exist before it's hit.

*Pre-flight dry run (verify the remap will hit the expected rows):*
```sql
-- 1. Confirm distinct legacy slugs in production
SELECT niche_id, COUNT(*) AS n
FROM   public.users
GROUP  BY niche_id
ORDER  BY n DESC;
-- Expected to show some mix of: finance, tech, cooking, beauty, business,
-- entertainment, diy, vlog, and any of the already-valid slugs
-- (gaming, fitness, travel, education).

-- 2. Count users that will be remapped vs. left alone
SELECT
  COUNT(*) FILTER (WHERE niche_id IN
    ('finance','tech','cooking','beauty','business','entertainment','diy','vlog'))  AS will_remap,
  COUNT(*) FILTER (WHERE niche_id IN
    ('gaming','fitness','travel','education'))                                       AS already_valid,
  COUNT(*) FILTER (WHERE niche_id IS NULL)                                           AS null_niche,
  COUNT(*) FILTER (WHERE niche_id NOT IN
    ('finance','tech','cooking','beauty','business','entertainment','diy','vlog',
     'gaming','fitness','travel','education') AND niche_id IS NOT NULL)              AS unknown_slugs
FROM public.users;
-- unknown_slugs should be 0; if not, investigate before running the migration.

-- 3. Inspect sub_niche values about to be wiped
SELECT COUNT(*) FROM public.users WHERE sub_niche IS NOT NULL;
SELECT COUNT(*) FROM public.competitors WHERE sub_niche IS NOT NULL;
```

*Run the migration:*
```sql
-- Apply supabase/migrations/20260609000000_niche_taxonomy_v2.sql in full.
-- The file is idempotent (ADD COLUMN IF NOT EXISTS + targeted UPDATEs).
```

*Post-deploy verification:*
```sql
-- 1. niche_description column exists and is nullable
SELECT column_name, data_type, is_nullable
FROM   information_schema.columns
WHERE  table_schema='public' AND table_name='users' AND column_name='niche_description';

-- 2. No legacy slugs remain in users.niche_id
SELECT niche_id, COUNT(*) FROM public.users
WHERE  niche_id IN ('finance','tech','cooking','beauty','business','entertainment','diy','vlog')
GROUP  BY niche_id;
-- Expected: 0 rows.

-- 3. All non-null niche_ids are in the new taxonomy (or 'other')
SELECT niche_id, COUNT(*) FROM public.users
WHERE  niche_id IS NOT NULL
GROUP  BY niche_id ORDER BY 1;
-- Every row must be a slug from VALID_NICHE_SLUGS or 'other'.

-- 4. sub_niche columns are wiped (will repopulate over the next 24h via sync + cron)
SELECT COUNT(*) FROM public.users        WHERE sub_niche IS NOT NULL;  -- expected 0
SELECT COUNT(*) FROM public.competitors  WHERE sub_niche IS NOT NULL;  -- expected 0

-- 5. Run health-check.ts to confirm invariants #1, #11, #12 pass on the new slugs
-- npx tsx --env-file=.env.local scripts/health-check.ts
```

Sub-niches will be NULL across the board for ~24h after the migration. The daily `/api/cron/sub-niche-detection` route + the in-line sub-niche detection on every sync repopulate them under the new taxonomy.

---

**Explicitly NOT done in this expansion (logged for future phases):**

* **Niche image assets for the 20 new slugs.** `lib/niche-images.ts` returns `null` / `[]` for `animals`, `arts_culture`, `automotive`, `ecommerce`, `fashion`, `health`, `humanities`, `magic_paranormal`, `motivation_self_improvement`, `music`, `nature_outdoors`, `news_politics`, `news_politics_us`, `podcast`, `product_reviews`, `relationships_family`, `sales_marketing`, `social_media`, `sports`, `video_essays`. Digest emails and idea cards for users in these niches show no thumbnail until assets are added under `public/niche-images/<folder>/` and wired into the `NEW_SLUG_TO_FOLDER` map.
* **Niche-specific dominator-rule tuning.** `NICHE_DOMINATOR_RULES` in `lib/dominator-finder.ts` uses a coarse `sub_niche` vs `broad` toggle per niche, picked with reasonable defaults (vertical-with-distinct-cultures → sub_niche; coherent verticals → broad). Some new niches may benefit from finer-grained rules; revisit after first ~50 production users in each new niche so there's real data to calibrate against.
* **Niche-specific CPM / RPM tuning.** `lib/revenue-benchmarks.ts` uses seed data — values for the 11 legacy-derived niches are real; values for the 20 brand-new niches are estimates inherited from the closest legacy neighbour. Revenue-gap dollar amounts shown in the digest for users in those niches should be treated as ballpark until benchmark data is collected from real CPM dashboards.
* **Niche-specific Claude prompt examples.** `app/api/ideas/generate/route.ts` and `lib/digest-generator.ts` use generic example titles in their system prompts across all 31 niches. Per-niche example pools (e.g. real Personal Finance hook templates vs. real Gaming hook templates) would lift Claude output quality but require curation work per niche.

---

*Files touched:*

| File | Phase | Change |
| --- | --- | --- |
| `lib/niches.ts` | 1 | NEW — canonical 31-niche taxonomy + 400 sub-niches + runtime invariant check. |
| `supabase/migrations/20260609000000_niche_taxonomy_v2.sql` | 2 | NEW — adds `users.niche_description`, remaps 8 legacy slugs, wipes legacy sub_niche values. |
| `lib/niche-engine.ts` | 3 | Claude prompt rebuilt for 31 niches; confidence-0 fallback removed; `NICHE_OTHER_SENTINEL` exported; `saveManualNicheSelection()` added. |
| `types/index.ts` | 3 | `NicheResult` rebuilt (nicheSlug/null + requiresManualSelection). |
| `lib/sync-logic.ts` | 3 | Skips DB write on requiresManualSelection; propagates flag up via sync response. |
| `app/api/sync/route.ts` | 3 | Returns `requiresManualSelection` in JSON response. |
| `lib/competitor-matcher.ts` | 4 | NICHE_SEARCH_TERMS deleted; reads searchQuery from `getNicheBySlug()`. |
| `lib/dominator-finder.ts` | 4 | NICHE_ID_TO_NAME deleted; rules re-keyed on `Record<ValidNicheSlug, …>`. |
| `lib/revenue-benchmarks.ts` | 4 | Re-keyed on 31 slugs; unknown-slug fallback returns defaults instead of throwing. |
| `lib/gap-scorer.ts` | 4 | Niche benchmark lookups migrated to 31-slug map. |
| `lib/niche-images.ts` | 5 | Re-keyed on 31 slugs; folder names preserved via `NEW_SLUG_TO_FOLDER`; missing assets return null silently. |
| `lib/sub-niche-detector.ts` | 6 | Optional `nicheDescription` option; ≥ 3-video minimum waived when description provided. |
| `app/api/users/detect-sub-niche/route.ts` | 6 | Reads `niche_description`; feeds it to detector; waives the minimum-3 guard accordingly. |
| `components/onboarding/NichePicker.tsx` | 7 | NEW — cascading top-level / sub-niche dropdowns + "Other" textarea + char counter. |
| `app/api/user/niche/manual/route.ts` | 7 | NEW — auth + validation + `saveManualNicheSelection()`. |
| `components/onboarding/StepConfirmNiche.tsx` | 7 | Rewritten — three modes (loading / confirm-detected / picker); silent `'finance'` default removed. |
| `app/api/user/profile/route.ts` | 7 | GET returns display names + `requires_manual_selection`; PATCH accepts `niche_description`. |
| `app/(dashboard)/settings/page.tsx` | 8 | Detected-niche row uses `getDisplayName()`. |
| `components/competitors/tabs/ContentTab.tsx` | 8 | Niche display label uses `getDisplayName()`. |
| `scripts/seed-test-data.ts` | 9 | Sets `niche_id='finance_crypto'`; channel ID prefix updated. |
| `scripts/test-gap-scorer.ts` | 9 | `nicheId: 'finance_crypto'`. |
| `scripts/test-trend-alert.ts` | 9 | Channel ID prefix updated. |
| `scripts/find-creators.ts` | 9 | `ValidNicheSlug` import from `lib/niches.ts`; legacy union removed. |
| `scripts/test-everything.ts` | 9 | Assertion banks aligned to Phase-3 slugs. |
| `scripts/health-check.ts` | 9 | Invariant #1 cutoff widened to 7 days; invariants #11 and #12 added. |

---

### Week 4 — Day 47 (2026-06-09)

**Fixed two latent bugs in dominator-finder.ts and competitor-matcher.ts where NICHE_ID_TO_NAME and NICHE_SEARCH_TERMS used numeric '1'..'12' keys that never matched string niche_ids — both maps always fell through to 'general' fallback, silently bypassing all niche-specific dominator rules and competitor search terms.**

*tsc --noEmit: zero errors.*

---

*Root cause:* Production `niche_id` values are string slugs (`'finance'`, `'tech'`, `'gaming'`, etc.) emitted by `detectNiche` in `lib/niche-engine.ts` and validated against the `VALID_NICHE_IDS` allowlist. Both `NICHE_ID_TO_NAME` in `lib/dominator-finder.ts` and `NICHE_SEARCH_TERMS` in `lib/competitor-matcher.ts` were keyed by numeric strings `'1'..'12'`. A lookup like `NICHE_ID_TO_NAME['finance']` returned `undefined` and the `|| 'general'` fallback fired on every call. The behavioural consequences were silent: `findDominatorsForUser` used the generic `'general'` query and bypassed the sub_niche vs broad-niche rule in `NICHE_DOMINATOR_RULES` for every user; `findBestCompetitorsForTier` searched YouTube for the literal term `'general'` instead of a niche-specific term whenever a user lacked a sub_niche.

*`lib/niche-engine.ts` — MODIFIED:*
* `VALID_NICHE_IDS` and `ValidNicheId` type promoted from `const`/local-type to `export const`/`export type` so other lib files can use the authoritative niche allowlist directly. No behaviour change inside niche-engine.ts.

*`lib/dominator-finder.ts` — MODIFIED:*
* Added `import { VALID_NICHE_IDS, type ValidNicheId } from './niche-engine'`.
* `NICHE_ID_TO_NAME` retyped from `Record<string, string>` to `Record<ValidNicheId, string>`. Keys changed from `'1'..'12'` to the 12 niche slugs. Each slug maps to itself (identity) — preserves existing downstream behaviour where `nicheName` is fed back into the slug-keyed `NICHE_DOMINATOR_RULES` and into the YouTube search query. The `Record<ValidNicheId, …>` type forces the map to stay exhaustive — adding a new niche to `VALID_NICHE_IDS` without an entry here is now a compile error.
* Added local `isValidNicheId(id: string): id is ValidNicheId` type guard.
* Lookup site: `NICHE_ID_TO_NAME[userNicheId] || 'general'` → `isValidNicheId(userNicheId) ? NICHE_ID_TO_NAME[userNicheId] : 'general'`. Same fallback semantics, but now a real cache hit when `userNicheId` is a known slug instead of always missing.

*`lib/competitor-matcher.ts` — MODIFIED:*
* Same import added.
* `NICHE_SEARCH_TERMS` retyped from `Record<string, string>` to `Record<ValidNicheId, string>`. Keys changed from `'1'..'12'` to the 12 niche slugs. Values retained as the bare slugs (matches what the original numeric-key values were before they became unreachable).
* Added local `isValidNicheId` type guard.
* Lookup site rewritten so the sub_niche-first preference and `'general'` fallback are preserved, but the niche term is now reachable when `userSubNiche?.sub_niche` is absent.

*No other logic changed.* `NICHE_DOMINATOR_RULES` in dominator-finder.ts (which is already correctly keyed by slugs and contains entries for `'music'` and `'comedy'` that are not in `VALID_NICHE_IDS`) was left untouched per the "key types only" scope.

*No test fixtures assert the previous `'general'` fallback.* Grep confirmed the only other `'general'` references are independent fallbacks in `lib/digest-generator.ts` and `app/api/ideas/generate/route.ts` on `user.niche_id` and `sub_niche` — unrelated to the two faulty maps.

---

### Week 4 — Day 46 (2026-06-08)

**Fix null-title video rows — `saveVideoData` skips rows whose Data API metadata is missing**

*tsc --noEmit: zero errors.*

---

*Root cause:* `lib/db.ts` `saveVideoData` iterated every Analytics-returned video and wrote a row regardless of whether `getVideoDetails` had returned matching metadata. When the Data API omitted an ID (private/unlisted/deleted/restricted via the public key context, or silently filtered by `lib/youtube-data.ts:459` because the video is a Short/livestream/kids), the row was still inserted with `title=NULL` and `published_at=NULL` but real `view_count` from the Analytics API. 13 such rows had accumulated in production — 10 for one Brand Account user (real views, no titles) and 3 isolated `view_count=1` rows (the literal `1` came straight from the Analytics API for low-view videos, not from any fallback). The Day 45 niche-detection self-heal correctly skipped these users because their `videos.title` rows were unusable.

*`lib/db.ts` — MODIFIED (`saveVideoData`):*
* Replaced the unconditional `.map()` with a `for` loop that skips any row where `detailMap.get(av.videoId)` is undefined or where `detail.title`/`detail.publishedAt` is empty. Skipped rows are collected with a reason string and reported via a single warn-level `logError` call (`route: 'lib/db/saveVideoData'`, `details.skipped: [{youtube_video_id, reason}, ...]`).
* Removed every `?? null` fallback on metadata fields — the row type now requires non-null `title`, `published_at`, `duration_seconds`, `like_count`, `comment_count`. The only nullable field is `thumbnail_url` (falls back to `null` when both `thumbnailHighRes` and `thumbnailDefault` are empty strings).
* DELETE narrowed from `analyticsVideos.map(...)` to `rows.map(...)` — only IDs we're about to re-insert get cleared. Comment above the delete explains the trade-off: if the Data API temporarily fails to enrich an ID we previously had good data for, the prior row is preserved rather than nulled out. A separate reconciliation pass (not in this fix) would be the right place to handle videos genuinely deleted by the user.
* Failed DELETE / INSERT now also log to `error_logs` (severity `'error'`) with `details.row_count`.

*`scripts/integration/mock-fetch.ts` — MODIFIED:*
* `youtubeVideosHandler` now accepts an optional `missingIds?: string[]`. IDs in this set are filtered out of the response `items[]` array entirely — mirrors the real Data API behaviour when an ID is private/deleted/restricted (omitted, never null-placeholder).

*`scripts/integration/sync-pipeline.test.ts` — MODIFIED (case 8 added):*
* `case8_videoMetadataMissingSkipsRow` — 3 input video IDs from Analytics, Data API omits the middle one via `missingIds: ['vid_metadata_b']`. Five assertions: `result.videosSynced === 2`, exactly 2 video rows in the DB, zero rows with null title/published_at, a warn-level `error_logs` entry from `lib/db/saveVideoData` exists, and the missing ID `vid_metadata_b` appears verbatim in the log's `error_details` JSON. Surviving IDs are also checked via a `deepEqual` against `['vid_metadata_a', 'vid_metadata_c']`.

*`scripts/health-check.ts` — MODIFIED (invariant #10 added):*
* `checkVideoRowsMissingMetadata` — CRITICAL severity. Queries `videos` for `title IS NULL OR published_at IS NULL`, ordered by `synced_at DESC`. Sample limit 50. Post-fix this count must always be zero; non-zero exits the script with code 1 so the regression class is monitored going forward.

*Cleanup query (run once after deploy, manually in Supabase SQL editor):*
```sql
-- DRY RUN — confirm exactly 13 rows match before deleting
SELECT v.id, v.user_id, u.email, v.youtube_video_id, v.view_count, v.synced_at
FROM   public.videos v
JOIN   public.users  u ON u.id = v.user_id
WHERE  v.title IS NULL
    OR v.published_at IS NULL
ORDER  BY v.synced_at;

-- DELETE — once the dry run is verified
DELETE FROM public.videos
WHERE title IS NULL
   OR published_at IS NULL;
-- expected: 13 rows
```

After this delete runs, `health-check.ts` invariant #1 (`users_with_videos_missing_niche`) should also drop because the stilllifemotion user's 10 null-title rows blocked Day 45 niche detection from finding usable titles.

---

### Week 4 — Day 44 (2026-05-14)

**Fix sync 429 handling — reload instead of error on empty dashboard**

*tsc --noEmit: zero errors.*

---

*`app/api/sync/route.ts` — MODIFIED:*
* 429 cooldown response message changed from `"Sync completed recently. Please wait N minute(s) before syncing again."` to `"Your channel was synced recently. Refreshing your dashboard..."` — the new message matches the client-side behaviour (a reload, not a wait).

*`components/dashboard/DashboardClient.tsx` — MODIFIED:*
* `handleManualSync()` now checks `res.status === 429` before reading the response body and calls `window.location.reload()` immediately, returning early. Previously a 429 fell through to the error branch and set `manualSyncError`, showing a red error message on the empty dashboard. A 429 on the empty dashboard always means the onboarding background sync already completed and data exists — a reload reveals it. Non-429 failures continue to show the error string as before.

---

### Week 4 — Day 43 (2026-05-14)

**Observability layer, proactive token refresh, Pro→Starter downgrade route, and Supabase explicit grants migration**

*tsc --noEmit: zero errors across all changes.*

---

*`lib/logger.ts` — NEW:*
* `logError({ userId, route, error, details, severity })` — writes structured error records to the `error_logs` Supabase table using the service role client. `userId` and `details` (JSONB) are nullable. `severity` defaults to `'error'`; accepts `'error' | 'warn' | 'info'`. Never throws — logging failures are caught and written to `console.error` only so a logging hiccup never crashes the caller. Called with `void` everywhere to make the fire-and-forget intent explicit.

*`supabase/migrations/20260513000000_add_explicit_grants.sql` — NEW:*
* Creates `error_logs` table: `id UUID`, `created_at TIMESTAMPTZ`, `user_id UUID` (FK → users, ON DELETE SET NULL), `route TEXT`, `error_message TEXT`, `error_details JSONB`, `severity TEXT DEFAULT 'error'`. RLS enabled. `service_role` gets SELECT + INSERT only — `authenticated` role intentionally excluded (users must never read other users' errors).
* Enables RLS on `ideas` and `thumbnail_jobs` — both were created without explicit RLS in earlier migrations/scripts.
* Adds explicit `GRANT SELECT, INSERT, UPDATE, DELETE` on all 15 existing tables for `authenticated` and `service_role`. Required by Supabase from October 30 2026 when implicit grants are removed. `anon` gets SELECT only on `searched_channels_cache` (its existing RLS policy already allows `USING (true)` for unauthenticated reads).

*`app/api/subscription/downgrade/route.ts` — NEW:*
* `POST /api/subscription/downgrade` — auth-gated. Validates user is on `subscription_plan = 'pro'` with an active/on_trial/past_due status and has a `paypal_subscription_id`. Calls PayPal's `POST /v1/billing/subscriptions/{id}/revise` with `PAYPAL_STARTER_PLAN_ID` as the new plan. `return_url → /dashboard?downgrade=success`, `cancel_url → /pricing`. Returns `{ approvalUrl }` for frontend redirect to PayPal approval page. Returns 400 if user is not Pro or has no subscription; 502 if PayPal returns non-2xx; 500 if `PAYPAL_STARTER_PLAN_ID` env var is not set.

*Observability pass — `logError()` wired into 20+ files:*

`auth.ts`:
* Sign-in upsert failure (`severity: 'error'`) — logs email, Supabase error code, and whether tokens were present.
* Missing YouTube channel ID (`severity: 'warn'`) — logs email and OAuth token presence; fires when `account.access_token` returns a null channel list.
* No access token in account (`severity: 'error'`) — fires when Google OAuth completes but `account.access_token` is null (tokens never stored to DB).

`lib/sync-logic.ts` (beyond logging — proactive token refresh added):
* Added proactive token refresh before any YouTube API calls: if `token_expires_at <= NOW() + 5 minutes`, attempts refresh immediately rather than waiting for `TOKEN_EXPIRED` from the API. This prevents the cron failure mode where the token expires between the DB read and the first API call. Returns early (401) if no refresh token is stored or if refresh fails, with a user-facing message instructing the user to reconnect.
* `logError` added for: user not found in DB, no access token, proactive refresh failure, reactive TOKEN_EXPIRED refresh failure, YouTube Analytics API errors, video save errors, competitor auto-detection failures.

`app/api/sync/route.ts`:
* Parallel fetch: now fetches `channel_snapshots` (for cooldown) and `users` row (for pre-flight checks) simultaneously via `Promise.all` instead of sequentially.
* Pre-flight validation added before `syncUserChannel()`: (1) if `userRow` is null → 400 "Account not found" with `logError severity: 'error'`; (2) if `youtube_access_token` is null → 400 "YouTube is not connected" with `logError severity: 'error'`. Both return early before burning any quota.
* Structured pre-flight log on every sync attempt (channel ID, token expiry, refresh token presence) — visible in Vercel logs even for successful syncs.
* `manualSyncError` state in `DashboardClient.tsx` changed from `boolean` to `string | null` — the sync error message returned from the API is now displayed verbatim instead of a generic "Sync failed — please try again" string.
* `logError` added for: sync unexpected exception, `syncUserChannel` returning `success=false`.

`lib/paypal.ts`:
* `getAccessToken` — missing credentials error, OAuth failed error.
* `createSubscription` — non-2xx response (includes partial `plan_id_prefix` in details, not the full ID).
* `verifyWebhookSignature` — getAccessToken step failure, PayPal verification API non-2xx, exception during verification fetch.

`lib/youtube-analytics.ts`:
* `analyticsQuery` — network error, HTTP error response (with status code and error message).

`lib/youtube-data.ts`:
* `getChannelStats`, `getRecentVideos`, `getVideoDetails`, `getChannelVideoVelocity`, `getCompetitorFullProfile` — all catch blocks now call `logError` with channel ID and error stack.

`lib/email.ts`:
* `sendWeeklyDigest` — Resend send error (logs `to` and `subject`), unexpected catch error (logs stack).
* `sendTrendAlert` — Resend send error (logs `to` and video title), unexpected catch error.
* `checkAndSendAlerts` — per-user batch error.

`lib/gap-scorer.ts`:
* `saveGapScore` — DB insert error.

`lib/niche-engine.ts`:
* `detectNiche` — Claude API error.
* `saveDetectedNiche` — DB update error (logs `niche_id`).
* `assignCompetitor` — `getCompetitorFullProfile` failure (logs channel ID, name, tier; `severity: 'warn'`).
* `detectAndAssignCompetitors` — per-tier assignment failure (logs tier and channel name).

`lib/digest-generator.ts`:
* `callClaudeForDigest` — Claude API error (`severity: 'warn'` since fallback kicks in).
* `generateDigest` — DB save error.

*API routes — `logError` wired into catch blocks:*
* `api/competitors/insights` — empty generation result (`severity: 'warn'`), unhandled exception.
* `api/competitors/search` — unhandled exception.
* `api/competitors/track` — DB insert error (logs channel_id + tier), unhandled exception.
* `api/competitors/[id]/sync` — DB upsert error, unhandled exception.
* `api/cron/refresh-data` — users load failure, per-competitor sync failure (`severity: 'warn'`), per-user competitor block failure.
* `api/cron/trend-detection` — competitors load failure, per-competitor processing failure (logs competitor ID, name, stack).
* `api/cron/user-sync` — users load failure, per-user sync failure (`severity: 'warn'`), per-user unexpected error.
* `api/cron/weekly-digest` — users load failure, per-user digest failure.
* `api/ideas/generate` — unhandled exception.
* `api/ideas/[id]/generate-thumbnail` — thumbnail job creation failure.
* `api/ideas/[id]/made` — DB update error, unhandled exception.
* `api/ideas/[id]/plan` — DB update error, unhandled exception.
* `api/subscription/cancel` — PayPal cancel error (logs partial subscription ID).
* `api/subscription/create` — missing plan ID env var (`severity: 'error'`), PayPal error.
* `api/unsubscribe` — DB update error (logs token prefix).
* `api/webhooks/paypal` — signature verification failure (`severity: 'warn'`), JSON parse failure (`severity: 'warn'`), unhandled exception.
* `api/account/delete` — DB deletion error.

*Database migration (run once in Supabase SQL editor):*
```sql
-- Run supabase/migrations/20260513000000_add_explicit_grants.sql in full.
-- Creates error_logs table, enables RLS on ideas + thumbnail_jobs,
-- and adds explicit grants on all 15 tables.
```

---

### Week 4 — Day 42 (2026-05-12)

**Bug fixes, audience data persistence, and observability improvements**

*tsc --noEmit: zero errors across all changes.*

---

*`lib/paypal.ts` — MODIFIED (PayPal error logging):*
* `getAccessToken()` — now validates `PAYPAL_CLIENT_ID` and `PAYPAL_SECRET` are present before constructing the credentials header; throws a clear error with the var names when missing. Added `console.log` logging the base URL and whether credentials are set (first 8 chars only, not the full secret). Logs success on token obtained.
* `createSubscription()` — request body now constructed as a named local variable (`requestBody`) and logged via `console.log` before the `fetch` call. This makes the full subscription payload visible in Vercel logs when diagnosing 4xx failures from PayPal. No change to the request itself.

*`app/api/subscription/create/route.ts` — MODIFIED:*
* Added logging of resolved `planId` before calling `createSubscription()`.
* Added full response body logging when PayPal returns a non-2xx status, surfacing PayPal's error message/name/description in Vercel logs.

*`lib/db.ts` — MODIFIED (audience demographics persistence):*
* `saveChannelSnapshot` signature extended with optional `extras?: { demographics: AudienceDemographics | null; trafficSources: TrafficSourceItem[] }`.
* Three new JSONB columns written on every sync: `age_gender_breakdown` (from `AudienceDemographics.ageGender`), `top_countries` (from `AudienceDemographics.topCountries`), `traffic_sources` (from the `TrafficSourceItem[]` array). All nullable — absence of data never blocks the snapshot save.
* Logs row counts for demographics and traffic sources when non-null.

*`lib/sync-logic.ts` — MODIFIED:*
* `syncUserChannel` now passes `{ demographics, trafficSources }` as `extras` to `saveChannelSnapshot`. Both were already being fetched from the YouTube Analytics API (`getAudienceDemographics`, `getTrafficSources`) but discarded. Now persisted silently.
* Subscriber count fallback (`?? 45000`) removed from auto-detection call. When `latestSnapshot?.subscriber_count` is null, logs a warning and skips auto-detection entirely rather than using a fake subscriber count that produces meaningless tier buckets.

*`lib/niche-engine.ts` — MODIFIED:*
* `detectNiche`: when Claude returns `confidence === 0` (API failure, insufficient data), `saveDetectedNiche` is no longer called. Previously a failed detection would write `'entertainment'` (Claude's fallback niche string) to the users table, silently corrupting the user's niche. Now: no write on zero-confidence detections.

*`lib/digest-generator.ts` — MODIFIED:*
* Niche fallback on line ~400 changed from `'entertainment'` to `'general'` — consistent with the `'general'` fallback used elsewhere in the same file (lines ~472 and ~522).

*`lib/email.ts` — MODIFIED (from address split + replyTo):*
* Weekly digest emails: `from` hardcoded to `"ShowStencil <digest@showstencil.com>"`.
* Trend alert emails: `from` hardcoded to `"ShowStencil <trend@showstencil.com>"`.
* Both: `replyTo: process.env.SUPPORT_EMAIL` added so replies land in the support inbox, not a no-reply black hole.
* Shared `FROM_EMAIL` env var constant removed — the two addresses are now different and hardcoded per type.
* `SUPPORT_EMAIL` env var added to `.env.example`.

*`app/(dashboard)/dashboard/page.tsx` — MODIFIED (no-channel guard):*
* When `user.youtube_channel_id` is null (user authenticated with Google but never connected a YouTube channel, or the channel was disconnected), the page now renders a full-screen message explaining the situation with a support email link. `DashboardClient` is never rendered in this case — prevents a cascade of broken API calls for a user with no channel data.

*`components/onboarding/StepConfirmNiche.tsx` — MODIFIED:*
* Removed silent `'finance'` fallback on polling timeout. Previously, if niche detection didn't complete within 20 polling attempts (30 seconds), the component silently selected `'finance'` and wrote it to the DB — wrong for any non-finance creator who took longer to process. Now: on timeout, the component switches to an explicit manual selection mode where the user must choose their niche from the dropdown before continuing. No default is auto-selected.

*`app/page.tsx` — MODIFIED (landing page timezone fix):*
* `getHours()` call that drives the time-of-day sky system now wrapped in try/catch with range validation. `Intl.DateTimeFormat` silently falls back to the device's local timezone in certain browsers (Reddit in-app browser, old Android WebViews). The fix: if the computed New York offset is outside the valid range (UTC-4 to UTC-5), returns `19.0` (7pm ET = sunset scene) as a safe fallback instead of showing a random scene tied to the device clock.

*`app/layout.tsx` + `package.json` — MODIFIED (Vercel Analytics):*
* `@vercel/analytics` package installed. `<Analytics />` component added to root layout. Tracks page views and Web Vitals automatically with no additional configuration. Data visible in the Vercel dashboard under Analytics tab.

*Database migration (run once in Supabase SQL editor):*
```sql
ALTER TABLE channel_snapshots
  ADD COLUMN IF NOT EXISTS age_gender_breakdown JSONB,
  ADD COLUMN IF NOT EXISTS top_countries JSONB,
  ADD COLUMN IF NOT EXISTS traffic_sources JSONB;
```

---

### Week 4 — Day 41 (2026-05-12)

**Payment system migrated from Lemon Squeezy to PayPal Subscriptions API**

*tsc --noEmit: zero errors. @lemonsqueezy/lemonsqueezy.js package removed.*

---

*`lib/paypal.ts` — NEW (replaces lib/lemonsqueezy.ts):*
* `getAccessToken()` — client_credentials OAuth via `POST /v1/oauth2/token`, reads `PAYPAL_CLIENT_ID` + `PAYPAL_SECRET`, switches base URL on `PAYPAL_MODE` env var (sandbox vs live).
* `createSubscription(planId, userId, userEmail)` — `POST /v1/billing/subscriptions`, sets `custom_id: userId`, return_url → `/dashboard?upgrade=success`, cancel_url → `/pricing`. Returns `{ subscriptionId, approvalUrl }`.
* `cancelSubscription(subscriptionId)` — `POST /v1/billing/subscriptions/{id}/cancel`.
* `getSubscriptionDetails(subscriptionId)` — `GET /v1/billing/subscriptions/{id}`.
* `verifyWebhookSignature(headers, body)` — async verification via PayPal's own `POST /v1/notifications/verify-webhook-signature` API; reads `PAYPAL_WEBHOOK_ID`.
* `getPlanFromPayPalPlanId(planId)` — maps `PAYPAL_STARTER_PLAN_ID` / `PAYPAL_PRO_PLAN_ID` env vars to `'starter'` / `'pro'`.

*`lib/lemonsqueezy.ts` — DELETED*

*`scripts/create-paypal-plans.ts` — NEW:*
* Gets OAuth token, creates "ShowStencil" product, creates Starter ($29/mo) and Pro ($79/mo) billing plans each with 7-day TRIAL cycle then infinite REGULAR cycle.
* Prints `PAYPAL_STARTER_PLAN_ID` and `PAYPAL_PRO_PLAN_ID` to terminal — copy into Vercel env vars.
* Run: `npx tsx --env-file=.env.local scripts/create-paypal-plans.ts`

*`app/api/subscription/create/route.ts` — NEW:*
* Auth-gated POST. Reads `plan` from body, resolves `PAYPAL_STARTER_PLAN_ID` / `PAYPAL_PRO_PLAN_ID`, calls `createSubscription()`, returns `{ approvalUrl }` for frontend redirect.

*`app/api/subscription/cancel/route.ts` — REWRITTEN:*
* Now reads `paypal_subscription_id` (not LS fields). Calls `getSubscriptionDetails()` first to extract `billing_info.next_billing_time` as `current_period_end`, then calls `cancelSubscription()`. Same grace period logic preserved — `subscription_plan` is NOT changed.

*`app/api/webhooks/paypal/route.ts` — NEW (replaces webhooks/lemonsqueezy):*
* Verifies signature via `verifyWebhookSignature()` — async PayPal API call, returns 401 on failure.
* `BILLING.SUBSCRIPTION.ACTIVATED` — reads `resource.custom_id` (userId set at creation), `resource.plan_id` (mapped to plan via `getPlanFromPayPalPlanId`), `billing_info.next_billing_time` (stored as `current_period_end`). Sets `subscription_status='active'`.
* `BILLING.SUBSCRIPTION.CANCELLED` — reads `resource.id` (subscription ID), looks up user via `getUserByPayPalSubscriptionId`, stores `billing_info.next_billing_time` as `current_period_end`. Does NOT drop plan to free.
* `BILLING.SUBSCRIPTION.EXPIRED` — sets `subscription_status='expired'`, `subscription_plan='free'`.
* `BILLING.SUBSCRIPTION.SUSPENDED` — sets `subscription_status='past_due'`, sends payment failed email via Resend.
* `PAYMENT.SALE.COMPLETED` — logs amount + currency only.

*`app/api/webhooks/lemonsqueezy/` — DELETED (entire directory)*

*`app/api/create-checkout-session/` — DELETED (entire directory)*

*`lib/db.ts` — MODIFIED:*
* Removed `getUserByLSCustomerId` and `getUserByLSSubscriptionId`.
* Added `getUserByPayPalSubscriptionId(subscriptionId)` — queries `paypal_subscription_id` column.
* `updateUserSubscription` data type: removed `lemon_squeezy_customer_id?` and `lemon_squeezy_subscription_id?`, added `paypal_subscription_id?: string`.

*`types/index.ts` — MODIFIED:*
* `User` interface: removed `lemon_squeezy_customer_id` and `lemon_squeezy_subscription_id`, added `paypal_subscription_id: string | null`.

*`app/pricing/PricingClient.tsx` — MODIFIED:*
* Checkout: `/api/create-checkout-session` → `/api/subscription/create`, `data.url` → `data.approvalUrl`.
* Both "Manage subscription at Lemon Squeezy" spans → "Manage subscription at PayPal".

*`app/api/account/delete/route.ts` — REWRITTEN:*
* Reads `paypal_subscription_id` (not LS fields), calls `cancelSubscription()` from `lib/paypal`. Same FK-order DB deletion preserved.

*Database migration (run once in Supabase SQL editor):*
```sql
ALTER TABLE users ADD COLUMN IF NOT EXISTS paypal_subscription_id TEXT;
ALTER TABLE users DROP COLUMN IF EXISTS lemon_squeezy_customer_id;
ALTER TABLE users DROP COLUMN IF EXISTS lemon_squeezy_subscription_id;
```

*`.env.example` — MODIFIED:*
* Removed `LEMONSQUEEZY_*` block. Added `PAYPAL_CLIENT_ID`, `PAYPAL_SECRET`, `PAYPAL_MODE`, `PAYPAL_STARTER_PLAN_ID`, `PAYPAL_PRO_PLAN_ID`, `PAYPAL_WEBHOOK_ID`.

*`@lemonsqueezy/lemonsqueezy.js` — UNINSTALLED from package.json.*

---

### Week 4 — Day 40 (2026-05-08)

**Cancellation grace period — users retain paid access until billing period ends**

*tsc --noEmit: zero errors.*

---

*Root cause:* `app/api/subscription/cancel/route.ts` and the `subscription_cancelled` webhook handler both previously wrote `subscription_plan='free'` on cancellation, immediately revoking paid access regardless of how much of the billing period remained. `lib/access.ts` resolved `cancelled` status directly to `free` with no period check. Users who cancelled mid-month lost all paid features instantly.

*`app/api/subscription/cancel/route.ts` — MODIFIED*
* No longer writes `subscription_plan='free'`.
* Parses the LS `DELETE /v1/subscriptions/:id` response body and extracts `data.attributes.ends_at` — the end date of the current billing period.
* Stores `ends_at` as `current_period_end` alongside `subscription_status='cancelled'`.
* Returns `{ success: true, accessUntil: endsAt }` so the client can display the exact date.

*`app/api/webhooks/lemonsqueezy/route.ts` — MODIFIED + new handler*
* `subscription_cancelled` event: now stores `attributes.ends_at` as `current_period_end`, sets `subscription_status='cancelled'`, does NOT touch `subscription_plan`. Comment added explaining the separation of concerns.
* New `subscription_expired` handler: fires when the billing period actually ends after cancellation. Sets `subscription_status='expired'` and `subscription_plan='free'`. This is the correct and only place a cancellation results in a free downgrade.

*`lib/access.ts` — MODIFIED*
* `getUserPlan` now selects `current_period_end` in addition to existing fields.
* New branch after the `past_due` check: if `subscription_status === 'cancelled'` and `current_period_end` is in the future, returns `subscription_plan` (the stored paid plan). Falls through to `'free'` only if the period has expired or `current_period_end` is null.
* `PlanRow` interface extended with `current_period_end: string | null`.

*`types/index.ts` — MODIFIED*
* `SubscriptionStatus` union type extended: added `'expired'`. The `subscription_expired` webhook writes this value; it was previously missing, causing a TypeScript type mismatch bug (discovered by audit). `'paused'` retained for completeness.

*`components/settings/CancelSubscription.tsx` — MODIFIED*
* Added `cancelled: boolean` and `accessUntil: string | null` states.
* After a successful cancel API call, `accessUntil` is updated from the `accessUntil` field in the response (falls back to the `currentPeriodEnd` prop).
* `setCancelled(true)` switches the modal to a confirmation view: "Subscription cancelled. You'll keep full access until [date], then your account will move to the Free plan."
* `router.refresh()` moved into `handleClose()` — only fires when the user dismisses the confirmation, not immediately on API success. This prevents the page reloading under the open modal.

*`app/(dashboard)/settings/page.tsx` — MODIFIED*
* "Renews" row now hidden for cancelled users (was showing their end date under the wrong label).
* New amber info row rendered when `subscription_status === 'cancelled' && current_period_end`: "Subscription cancelled — [Plan] access until [date]" in `color: #fbbf24`. Makes the access window explicit without burying it.

---

### Week 4 — Day 39 (2026-05-08)

**Sentry monitoring, loading skeletons, thumbnail overhaul, free tier gating, cancel subscription, pricing rebuild, 2T1+2T2 auto-detection**

*Multiple sessions across Day 36–39. tsc --noEmit: zero errors after each session.*

---

**Session A — Sentry + loading skeletons + thumbnail fixes (commit 59b35c5)**

*Sentry monitoring integrated:*
* `sentry.client.config.ts` / `sentry.server.config.ts` / `sentry.edge.config.ts` — Sentry SDK initialisation for all three Next.js runtime contexts. DSN read from `SENTRY_DSN` env var.
* `instrumentation.ts` — Next.js instrumentation hook, registers the Sentry server config on startup.
* `app/global-error.tsx` — Global React error boundary wired to `Sentry.captureException`; shows a recovery UI and a "Reload page" button.
* `next.config.ts` — wrapped with `withSentryConfig`; source maps enabled in production, tree-shaking for unused Sentry features.

*Loading skeleton pages added for all 5 dashboard routes:*
* `app/(dashboard)/dashboard/loading.tsx` — skeleton mimicking gap score panel + metric strip + two chart placeholders.
* `app/(dashboard)/competitors/loading.tsx` — skeleton filter tabs + table rows.
* `app/(dashboard)/digest/loading.tsx` — skeleton digest list cards.
* `app/(dashboard)/ideas/loading.tsx` — skeleton idea grid.
* `app/(dashboard)/settings/loading.tsx` — skeleton settings sections.
All use inline `animate-pulse` Tailwind styles — no external component needed.

*Thumbnail pipeline overhauled:*
* `lib/gemini-image.ts` — stick figure removed from no-photo mode; no-photo now sends a solid-colour background prompt only. 16:9 safe-zone and widescreen framing enforced: explicit instruction to keep all key elements in the centred 80%×80% safe zone and fill the full 16:9 frame.
* `lib/thumbnail-storage.ts` — `loadStickFigureBase64()` removed (no callers).
* `app/api/ideas/[id]/generate-thumbnail/route.ts` — after `generateThumbnail` returns, calls `padToSixteenNine(buffer)` from `lib/image-utils.ts` before upload. Guarantees every stored thumbnail is exactly 16:9 regardless of Gemini's output aspect ratio.
* `components/ideas/ThumbnailGenerationModal.tsx` — no-photo flow simplified: jumps directly to generating state, no stick figure preview step.
* Regenerate thumbnail button removed from `IdeasClient.tsx` — one thumbnail per idea only. Existing thumbnails show Download button only. Eliminates quota drain from repeated regeneration.

*Security hardening — see Security Audit Section 5.*

---

**Session B — Text-only logo + cancel subscription (commit 9a5f5ac)**

*Text-only SHOWSTENCIL. logo:*
* `app/layout.tsx` — Montserrat font (weight 700) added via `next/font/google`.
* `app/(dashboard)/layout.tsx` — Sidebar logo replaced: was a boxed-S SVG icon, now plain `SHOWSTENCIL.` text in Montserrat 700, `text-sm tracking-widest uppercase text-white`.
* `app/page.tsx` — Landing page nav + footer logo replaced with matching text treatment.
* Sidebar search hint bar removed (the "⌘K — Search" shortcut hint that had no backing functionality).

*Cancel subscription flow (as of Day 39 — corrected by Day 40 grace period fix):*
* `components/settings/CancelSubscription.tsx` — NEW Client Component. "Cancel Subscription" button opens a confirmation modal. Confirm calls `POST /api/subscription/cancel`. On success shows a "Subscription cancelled — access until [date]" confirmation state before closing and triggering `router.refresh()`. Day 40: added `cancelled` + `accessUntil` states; `router.refresh()` moved to `handleClose()` so it only fires after the user dismisses the confirmation.
* `app/api/subscription/cancel/route.ts` — NEW. Auth-gated. Reads `paypal_subscription_id` from DB. Calls `getSubscriptionDetails()` to extract `billing_info.next_billing_time` as `current_period_end`, then calls `cancelSubscription()`. Does NOT write `subscription_plan='free'`. Returns `{ success: true, accessUntil }`. (Day 41: migrated from Lemon Squeezy to PayPal.)
* `app/(dashboard)/settings/page.tsx` — `CancelSubscription` rendered in Subscription section when `subscription_status === 'active' || 'on_trial'`. Day 40: added amber "Subscription cancelled — [Plan] access until [date]" info row for cancelled users; "Renews" row suppressed for cancelled users.

---

**Session C — Free tier gating + pricing rebuild (commit 0aeaf2e)**

*`lib/access.ts` — plan limits updated:*
* `getCompetitorLimit`: free → 1 (was effectively 0), starter → 6 (was 3), pro → 13 (unchanged).
* `getIdeaLimit`: free → 1 (was 0 — blocked entirely), starter → 3, pro → 10.
* `FEATURE_GATES`: removed `'digest:weekly': 'starter'`. Added `'insights:ai': 'starter'` — AI Competitor Insights require Starter or Pro.

*`lib/plan-limits.ts` — PLAN_LIMITS config updated:*
* `free`: `totalCompetitors: 1`, `tier1Count: 1` (was 0/0 — free users got no auto-detected competitors).
* `starter`: `totalCompetitors: 6` (was 4), `tier1Count: 2` (was 1), `tier2Count: 2` (was 1).

*`components/competitors/tabs/InsightsTab.tsx` — free plan gate:*
* `plan?: 'free' | 'starter' | 'pro'` prop added. Free plan renders a locked state: lock icon, explanation, "Upgrade to unlock" CTA → `/pricing`. No API call made.

*`components/ideas/IdeasClient.tsx` — hooks + thumbnail gating for free plan:*
* Hooks 2 + 3 (Bolder / Most Controversial): free renders a single locked block in place of both, with upgrade link. Hook 1 (Safe) always visible.
* Thumbnail button: free plan shows `<a href="/pricing">Upgrade to generate thumbnails</a>` instead of a disabled button.

*`app/pricing/PricingClient.tsx` — NEW 3-card pricing page:*
* Three cards: Free (grey), Starter ($29/mo, blue), Pro ($79/mo, gold). Feature comparison rows per card. CTA buttons call `/api/create-checkout-session`. Current plan highlighted.

---

**Session D — Delete account + extend cancel to trial users (commit 939c895)**

*`app/(dashboard)/settings/page.tsx` — Cancel Subscription extended:*
* `CancelSubscription` now renders when `subscription_status === 'active' || subscription_status === 'on_trial'` (previously active-only). Trial users can now self-cancel.
* Danger Zone section added below Subscription: contains `DeleteAccount` component.

*`components/settings/DeleteAccount.tsx` — NEW:*
* "Delete Account" button opens a modal requiring the user to type `CONFIRM` exactly before proceeding.
* Calls `POST /api/account/delete`. On success, calls `signOut({ callbackUrl: '/' })`.

*`app/api/account/delete/route.ts` — NEW:*
* Auth-gated. Cancels PayPal subscription if `paypal_subscription_id` is set (best-effort, logs error but proceeds). Deletes all user data in FK order: `thumbnail_jobs → ideas → digests → trends → gap_scores → competitor_videos → competitor_snapshots → competitors → channel_snapshots → videos → user_settings → user_search_history → dominator_history → users`.

---

**Session E — 2 Tier1 + 2 Tier2 + 1 Dominator auto-detection (commit e84c312)**

*`lib/niche-engine.ts` — `detectAndAssignCompetitors` rewritten:*
* Old: 1 Tier1 + 1 Tier2 + 1 Dominator. Tier tracking: `Set<number>` — once any competitor in a tier existed, tier was never refilled.
* New: up to 2 Tier1 + 2 Tier2 + 1 Dominator. Tier tracking: `Record<1|2|3, number>` counts; slots remaining = target − current. Only missing slots are assigned on each run, so re-running detection after a competitor is deleted correctly fills just the missing slot without touching filled tiers.
* Quota: ~101 + up to 5 × 203 ≈ 1116 units per run (was ~710).
* Log output: `"T1:N T2:N Dom:N — slots remaining = T1:N T2:N Dom:N"` before and after assignment for clear Vercel log diagnostics.

---

### Week 3 — Day 37 (2026-05-07)

**CLAUDE.md full audit — documentation brought up to date with actual codebase**

*No code changes. Documentation only.*

Feature Build Status tables updated to reflect actual codebase state:
* `lib/utils.ts` — changed from 🔲 to ✅
* `app/privacy/page.tsx` and `app/terms/page.tsx` — changed from 🔲 to ✅ (Termly-generated legal pages)
* `app/api/cron/daily/route.ts` — changed from 🚧 to 🗑️ deleted (deleted Day 36)
* `components/ui/` and `components/charts/` — expanded entries with actual filenames and statuses

New entries added (files that existed but were undocumented):
* `lib/lemonsqueezy.ts` — Lemon Squeezy JS SDK wrapper (createCheckoutSession, getVariantId)
* `lib/competitor-metrics.ts` — pure computation for competitor video metrics
* `lib/image-utils.ts` — sharp-based server-side 16:9 padding for thumbnails
* `lib/niche-images.ts` — curated niche stock images with seeded shuffle
* `lib/env-validation.ts` — required env var check at startup
* `app/(dashboard)/digest/[id]/page.tsx` — digest detail view
* `app/api/competitors/[id]/sync/route.ts` — manual competitor video re-sync
* `app/api/thumbnail-jobs/[jobId]/status/route.ts` — thumbnail job polling
* `app/api/health/route.ts` — uptime monitoring endpoint
* 14 dev scripts added to the Scripts table (check-competitors, diagnose-sync, fix-competitor-tiers, reset-inactive-competitors, sync-competitor-videos, test-all-endpoints, test-api-key, test-cron, test-insights-expanded, test-send-digest-email, test-sync, test-token-refresh, update-competitor-thumbnails)

New section added: **Planned But Not Yet Built** — documents 8 features gated in access.ts or implied by the product roadmap but not yet implemented (Revenue Forecast, Whitespace Map, Collaboration Finder, re-subscribe flow, topic coverage, pricing wiring, auth callback placeholder, stripe webhook stub).

Tech stack table corrected: Payments updated from "Stripe" to "Lemon Squeezy".

---

### Week 3 — Day 34 (2026-05-04)

**A4 + A5: Empty states and error states across all dashboard pages**

*8 fixes applied across 12 files. tsc --noEmit: zero errors.*

*components/dashboard/DashboardClient.tsx — Fix 1, Fix 2, Fix 5*
* Fix 1 — Dashboard empty state CTA: replaced broken `href="/api/sync"` anchor (navigated to a JSON API response) with a proper `handleManualSync()` async function that calls `POST /api/sync`, shows a loading spinner during the call, reloads on success, and shows an inline error on failure. Empty state copy updated to "Your dashboard is empty." + "We need to sync your YouTube channel data before we can show you anything. This takes about 30 seconds." + "Sync my channel →" button.
* Fix 2 — Chart empty text: changed `"Not enough data yet."` to `"Not enough data yet — charts populate after a few daily syncs. Check back tomorrow."` so users understand why the chart is empty and when to expect it to fill in.
* Fix 5 — Sync error banner: added `syncError` to the `useSyncStatus()` destructure (it was already exposed by sync-context.tsx but never consumed). Added `syncErrorDismissed` state and a dismissable banner rendered as the first child of `<Shell>` when `syncError && !syncErrorDismissed`. Banner styled dark red (`background: '#1a0a0a'`, `border: '1px solid #3a1a1a'`); includes a "Sync now" button that calls `handleManualSync()` and a × dismiss button.

*components/competitors/CompetitorsTable.tsx — Fix 3*
* `EmptyState` function rewritten with two branches:
  * `filter === 'all'`: "No competitors found yet." + "Competitors are automatically detected when you first sync your channel. This can take a few minutes. If you've just connected, check back shortly." + "You can also search for any YouTube channel manually →" scroll-to-top link.
  * Tier-specific filters: "No {label} competitors yet." + "Competitors are assigned to tiers automatically based on their subscriber count relative to yours." message.

*components/competitors/tabs/OverviewTab.tsx — Fix 4a*
* Added early return at the top of the component when `userSnapshot === null`: renders a `48px`-padded card with `"Overview data is still syncing."` + `"Data syncs overnight — check back tomorrow."`. Prevents the tab from showing misleading 0-subscriber / 0% CTR values when the user's first sync hasn't completed yet.

*components/competitors/tabs/ContentTab.tsx — Fix 4b*
* Added early return when `competitorVideos.length === 0`: renders `"No content data yet — video data syncs overnight."` + `"Data syncs overnight — check back tomorrow."`. Consistent with OverviewTab empty state styling.

*components/competitors/tabs/GrowthTab.tsx — Fix 4c*
* Added early return when `competitorSnapshots.length === 0`: renders `"Not enough history yet — growth charts appear after a few daily syncs."` + `"Data syncs overnight — check back tomorrow."`. Placed before the existing `chartData.length < 2` guard so both conditions are handled cleanly.

*components/competitors/tabs/InsightsTab.tsx — Fix 7*
* Replaced the non-retryable hard error (`<p style={{ color: '#f87171' }}>{error}</p>`) with a proper error card: `"Could not generate insights right now."` + explanation (`"This usually happens when there isn't enough competitor data yet, or when the AI service is temporarily unavailable."`) + `"Try again"` button that calls `fetchInsights()`. The existing 422 retryable state ("Gathering data for this channel…") was already correct and was left untouched.

*components/ideas/IdeasClient.tsx — Fix 6*
* Added `useRef` to React imports.
* Added `ideasRef` (synced via `useEffect`) so the `generate()` `useCallback` (which has empty `[]` deps and captures a stale empty `ideas` value) can read the current ideas count without requiring deps changes.
* Added `regenError: string | null` state.
* In `generate()`: `setRegenError(null)` called at start. Non-ok responses now route through `regenError` (not `error`) when `ideasRef.current.length > 0` — so existing ideas stay visible while the banner shows the failure. Same pattern applied in the `catch` block.
* Added dismissable error banner rendered above the ideas grid when `regenError` is set: dark red style matching the dashboard sync error banner, with × dismiss button.

*app/(dashboard)/dashboard/page.tsx — Fix 8*
* Wrapped all Supabase fetches in try/catch. Error path returns a dark full-screen error UI: "Something went wrong", explanation, and `<a href="/dashboard">Refresh dashboard</a>` link. All inline styles (no Tailwind) consistent with other dashboard error screens.

*app/(dashboard)/competitors/page.tsx — Fix 8*
* Wrapped all Supabase fetches in try/catch. Moved `createServiceClient()` inside the try block. Error path returns dark error UI with "Back to competitors" → `/competitors` link.

*app/(dashboard)/ideas/page.tsx — Fix 8*
* Wrapped all Supabase fetches in try/catch. Moved `createServiceClient()` inside the try block. Error path returns dark error UI with "Refresh page" → `/ideas` link.

*app/(dashboard)/digest/page.tsx — Fix 8*
* Wrapped all Supabase fetches in try/catch. Renamed pre-existing unused `user` destructure to `_user` to clear TS hint. Error path returns dark error UI with "Refresh page" → `/digest` link.

*app/(dashboard)/competitors/[id]/page.tsx — Fix 8*
* Wrapped all Supabase fetches in try/catch. Moved `createServiceClient()` inside the try block. Error path returns dark error UI with "Back to competitors" → `/competitors` link. `notFound()` / `redirect()` calls left outside the try scope where appropriate.

---

### Week 3 — Day 33 (2026-05-04)

**Ideas page: stop infinite reload loop + replace 429 with friendly message**

*components/ideas/IdeasClient.tsx — MODIFIED*
* Auto-trigger guard: `useEffect` that calls `generate()` on mount was checking `!isFresh && initialIdeas.length === 0`. A user with `ideas_refresh_available=false` and no ideas (e.g. new account, ideas not yet generated) would trigger `generate()` → get a 429 → reload → trigger again indefinitely. Fixed by adding `&& localRefreshAvailable` to the condition, so the auto-trigger only fires when the flag confirms generation is allowed.
* 429 handler: `window.location.reload()` replaced with `setLocalRefreshAvailable(false)` + `setError('New ideas are available every Monday when competitor data refreshes.')` + `setIsGenerating(false)` + `setIsRegenerating(false)`. The page no longer reloads on 429 — it shows a friendly message and stops attempting generation. A 429 means the user has already generated this week; reloading served no purpose and caused the infinite loop.

*tsc --noEmit: zero errors.*

---

### Week 3 — Day 32 (2026-05-04)

**lib/idea-generator.ts fully deleted — all orphaned Day 6 code gone**

*scripts/test-full-pipeline.ts — DELETED*
* Day 6 artifact testing the old 7-step pipeline (data sync → gap score → trend detection → uncovered topics → digest → old JSONB ideas → revenue benchmarks). Step 6 called `generateVideoIdeas` which writes to the old JSONB schema the UI never reads. Not referenced in package.json scripts. Last commit was `day 6 night: full pipeline test`. No current value — deleted entirely.

*scripts/test-everything.ts — MODIFIED*
* Removed `import { generateVideoIdeas } from '@/lib/idea-generator'` (was line 38). Removed `IdeaResult` from the `@/types` import block.
* 3.6+3.7 `Promise.allSettled([generateDigest, generateVideoIdeas])` block restructured: digest now runs with a plain `try/await`, test 3.7 changed to `record('3.7', ... 'SKIP', 'lib/idea-generator.ts removed — ideas via /api/ideas/generate')`. `step3637WallMs` → `step36WallMs`. Pipeline timing log updated to show "3.6 digest" instead of "3.6+3.7 parallel".
* The rest of the suite (28 tests — Phase 1 env vars, Phase 2 DB, Phase 3 intelligence pipeline, Phase 4 email, Phase 5 payments) remains intact and still runs. Only the dead test 3.7 was removed.
* fileMap entry for 3.7 updated to note it is skipped.

*lib/idea-generator.ts — DELETED*
* Confirmed zero imports after script changes (grep showed only string literals in test-everything.ts comments). Deleted.

*types/index.ts — MODIFIED*
* `GeneratedVideoIdea` and `IdeaResult` interfaces deleted (22 lines). Grep confirmed zero external references after lib/idea-generator.ts deletion.

*tsc --noEmit: zero errors.*

---

### Week 3 — Day 31 (2026-05-04)

**Remove zombie generateVideoIdeas call from weekly-digest cron (Change 2 + 3 blocked by script imports)**

*app/api/cron/weekly-digest/route.ts — MODIFIED*
* Deleted `import { generateVideoIdeas } from '@/lib/idea-generator'` (was line 15).
* `Promise.all([generateDigest(user.id), generateVideoIdeas(user.id)])` → `await generateDigest(user.id)`. Result was already discarded; `Promise.all` removed along with the call.
* Log message updated: `"Digest + ideas generated for user"` → `"Digest generated for user"`.
* The call was writing to the old JSONB `ideas` schema the current UI never reads, burning Claude API credits every Monday with no user-visible effect.

*Change 2 (lib/idea-generator.ts deletion) — BLOCKED*
* Grep found two dev scripts still importing from the file:
  * `scripts/test-full-pipeline.ts:17` — `import { generateVideoIdeas } from '@/lib/idea-generator'`
  * `scripts/test-everything.ts:38` — `import { generateVideoIdeas } from '@/lib/idea-generator'`
* File not deleted. Scripts need to be updated or deleted first before the file can be removed safely.

*Change 3 (GeneratedVideoIdea / IdeaResult type cleanup) — BLOCKED*
* Blocked by Change 2 not completing. `lib/idea-generator.ts` still imports both types from `types/index.ts` so they cannot be removed yet.

*tsc --noEmit: zero errors.*

---

### Week 3 — Day 30 (2026-05-04)

**Ideas system diagnostic — 7 of 8 fixes applied (Fix A blocked by active import)**

*Fix A — lib/idea-generator.ts: NOT deleted*
* Grep confirmed `app/api/cron/weekly-digest/route.ts` line 15 imports `generateVideoIdeas` from this file. The file is in active use by the Monday cron. Not deleted. Reported and skipped per instructions.

*Fix B — types/index.ts — MODIFIED*
* `ideas_refresh_available: boolean | null` added to `UserSettings` interface after `timezone`. The field exists in the DB (`user_settings.ideas_refresh_available`) but was missing from the TypeScript type, causing implicit `any` drift when reading settings rows.

*Fix C — components/ideas/IdeasClient.tsx — MODIFIED (Header indicator bar)*
* Starter plan indicator bar: replaced `"{ideasCount} of {ideaLimit} monthly ideas generated. Pro users get 10 ideas, refreshed weekly. Upgrade to Pro →"` with `"{ideasCount} of {ideaLimit} ideas generated this week. Refreshes every Monday."` — both plans refresh every Monday now; "monthly" was wrong, and the upsell belonged elsewhere.

*Fix D — components/ideas/IdeasClient.tsx — MODIFIED (empty state)*
* Empty state `<Header>` had `canRegenerate={true}` hardcoded — bypassing the `localRefreshAvailable` flag. A user with `ideas_refresh_available=false` and no ideas would see an enabled button that always returned 429. Changed to `canRegenerate={localRefreshAvailable}`.
* The "Generate ideas" button in the empty state body also always rendered as enabled. Wrapped in conditional: when `localRefreshAvailable` is true shows the green button; when false shows `"New ideas available every Monday when competitor data refreshes."` in zinc-500 monospace text.
* Empty state error display extended to include `<a href="/pricing">View pricing →</a>` when the error string contains "Upgrade" (same pattern as the main error display).

*Fix E — components/ideas/IdeasClient.tsx — MODIFIED (generate callback + error display)*
* `generate()` callback restructured: 403 is now caught before reading the response body — shows human-readable `"Video ideas are available on Starter and Pro plans. Upgrade to start generating ideas for your channel."` instead of the raw `"upgrade_required"` error key. 429 reloads the page (later superseded by Day 33 fix — now shows friendly message instead). Other non-ok responses read the body and show `errData.error ?? 'Generation failed. Please try again.'`
* Main-view error display extended: added `{error.includes('Upgrade') && <a href="/pricing">View pricing →</a>}` below the red error text.

*Fix F — app/api/ideas/generate/route.ts — MODIFIED*
* Removed the `regenerateAvailableAt` computation block (lines 439-448: plan-based first-of-next-month / now+7d calculation). Removed `regenerateAvailableAt` from the return JSON. The field was never read by IdeasClient (diagnostic confirmed). Button state is controlled entirely by the DB flag.

*Fix G — lib/db.ts — MODIFIED*
* Deleted `getRecentIdeas` function (42 lines). Grep confirmed zero external callers — only defined in db.ts, never imported. The function used the old JSONB ideas schema and mapped to `GeneratedVideoIdea` — a schema that no longer matches the DB. `GeneratedVideoIdea` type kept in types/index.ts because `lib/idea-generator.ts` still imports it.

*Fix H — app/api/ideas/latest/route.ts — MODIFIED*
* Previous implementation used `ORDER BY generated_at DESC LIMIT 3` — could return 3 ideas from 3 different generation runs if a user had generated multiple batches.
* New implementation: (1) fetches the most recent `generated_at` timestamp for the user; returns `{ideas:[]}` immediately when none found. (2) computes `batchStart = latestIdea.generated_at - 60s`. (3) fetches all ideas `WHERE generated_at >= batchStart ORDER BY opportunity_score DESC LIMIT 10`. This matches the window used by `getRecentIdeasBatch` in lib/db.ts, ensuring onboarding Step 5 always shows ideas from the same generation run.

*tsc --noEmit: zero errors after all changes.*

---

### Week 3 — Day 29 (2026-05-04)

**Onboarding code audit — skip flow verification + mobile responsive fixes + TS fix**

Full read-and-audit pass across all 8 onboarding files before touching any code.

*Audit findings — skip flow: PASS*
* `app/onboarding/page.tsx` line 88: `{step > 1 && (...)}` correctly hides the skip button on Step 1.
* `skipOnboarding()` calls `await fetch('/api/onboarding/complete', { method: 'POST' })` then `router.push('/dashboard')` — correct order.
* `app/api/onboarding/complete/route.ts` calls `.update({ onboarding_completed: true }).eq('id', session.user.id)` — correct.
* `StepWelcome.tsx` return statement (lines 8-39) contains no skip button — correct.
* `goToDashboard()` in `StepFirstAnalysis.tsx` calls `await fetch('/api/onboarding/complete', { method: 'POST' })` then `router.push('/dashboard')` — correct.

*Audit findings — mobile (390px): 2 issues, both fixed*

*app/onboarding/page.tsx — MODIFIED*
* Outer div changed from `min-h-screen bg-[#0A0A0A] text-white flex flex-col` → `relative min-h-screen bg-[#0A0A0A] text-white flex flex-col`. The `absolute top-6 right-6` skip button was positioning relative to the viewport (no positioned ancestor) rather than its container. Adding `relative` anchors it correctly.

*components/onboarding/OnboardingProgress.tsx — MODIFIED*
* Step label div: added `text-center`. Previously the div had no text alignment set. The parent's `items-center` (flex) centres the div as a block, but text within the div would be left-aligned if it ever wrapped. `text-center` makes wrapping clean on all screen sizes.

*app/api/cron/cache-cleanup/route.ts — TS fix*
* Pre-existing TypeScript error (introduced in Day 28): `.select('*', { count: 'exact', head: true })` after `.update()` was passing two arguments to `.select()` — Supabase JS v2's `.select()` only accepts 0-1 arguments (the column string). The `count: 'exact'` option belongs in `.update(data, options)`. Fixed: removed `.select()` call entirely; moved `{ count: 'exact' }` into `.update({ ideas_refresh_available: true }, { count: 'exact' })`. `npx tsc --noEmit` confirms zero errors after fix.

*All 21 checklist items confirmed PASS*
* Skip flow: 5/5 PASS. Mobile: all steps — hero text ≤48px, all buttons w-full on mobile, flex-col sm:flex-row stacking, truncate on competitor names, shrink-0 on tier badges, text-5xl sm:text-7xl on gap score, break-words on idea title, progress dots centred, no horizontal overflow at 390px.

---

### Week 3 — Day 28 (2026-05-04)

**Weekly insights cache rhythm + Generate Ideas button controlled by DB flag**

*app/(dashboard)/ideas/page.tsx — MODIFIED*
* Bug fix: `getIdeasRefreshAvailable(userId)` was missing from the `Promise.all` destructure (5 variables, 4 items — `ideasRefreshAvailable` was `undefined`). Added as the 5th item in the parallel fetch.
* `ideasRefreshAvailable` passed to `IdeasClient` as a new prop (type `boolean`).
* `mostRecentGeneratedAt` removed as a prop to `IdeasClient` — still computed server-side for `imageSeed` but no longer needed by the client.

*components/ideas/IdeasClient.tsx — MODIFIED*
* Added `ideasRefreshAvailable: boolean` prop.
* Added `localRefreshAvailable` useState initialised from the prop — so the button disables immediately on successful generation without a page reload.
* `setLocalRefreshAvailable(false)` called inside the generation success path before `setIdeas`.
* `canRegenerate` simplified: was complex date math per plan → now just `localRefreshAvailable`.
* Header message updated: when `localRefreshAvailable` is true shows "Fresh competitor data available — generate new ideas"; when false shows "New ideas available every Monday when competitor data refreshes". This removes the old plan-specific "regenerate once per month / once per 7 days" messaging which was confusing and inconsistent with the DB flag.

*lib/db.ts — 2 new functions*
* `setIdeasRefreshAvailable(userId, available)` — upserts `ideas_refresh_available` on `user_settings` with `{ onConflict: 'user_id' }`. Returns `true/false`. Called with `false` by `/api/ideas/generate` after ideas are saved.
* `getIdeasRefreshAvailable(userId)` — reads `ideas_refresh_available` from `user_settings`. Returns `true` when no row exists (new users can generate immediately). Used by `ideas/page.tsx` server component.

*app/api/ideas/generate/route.ts — MODIFIED*
* After the DB insert confirming ideas saved (step 9), calls `await setIdeasRefreshAvailable(userId, false)` before the prune step. This disables the Generate Ideas button immediately after a successful generation — the flag is re-enabled every Monday at 2am UTC by the `cache-cleanup` Monday branch.

*app/api/cron/cache-cleanup/route.ts — MODIFIED (Monday-only branch added)*
* After the existing daily cleanup (expired cache rows, old search history, stale thumbnail jobs), added a `if (new Date().getUTCDay() === 1)` branch that runs only on Mondays.
* Monday branch — step 1: counts competitors with cached insights, then runs `.update({ insights: null, insights_generated_at: null }).not('id', 'is', null)` to wipe insights for ALL competitors across ALL users. This forces fresh generation on next Ideas page visit or Insights tab open — giving users insights regenerated from the latest 7 days of competitor video data.
* Monday branch — step 2: runs `.update({ ideas_refresh_available: true }, { count: 'exact' }).not('user_id', 'is', null)` to re-enable the Generate Ideas button for all users with an existing `user_settings` row.
* Monday branch — step 3: finds users without a `user_settings` row (new users who have never generated ideas) and inserts rows with `ideas_refresh_available: true` so they can generate immediately.
* Response JSON extended: when it's Monday, includes `insights_wiped` and `users_ideas_enabled` counts.

*app/api/cron/refresh-data/route.ts — MODIFIED*
* Removed the nightly insights wipe that previously ran after every competitor data sync (`Block 2`). The wipe was generating Claude API credit burns on every ideas generation — insights would be null after 24h, forcing re-generation on every open. Now the daily cron only updates competitor data; insights survive until the Monday cache-cleanup branch wipes them. Net effect: insights TTL changes from 24h to 7 days, aligned to the weekly data rhythm.

---

### Week 3 — Day 27 (2026-05-04)

**Ideas generation: parallel insight auto-generation + onboarding Step 5 fix**

*app/api/ideas/generate/route.ts — MODIFIED*
* Missing-insights filter extended: now catches `insights = []` (empty array) in addition to `insights = null` and `insights_generated_at = null`. Previously an empty array would pass the filter and the prompt would include an empty insights section.
* Sequential `for` loop replaced with `Promise.allSettled` parallel execution. Previously generating insights for 3 competitors took 3 × 10-20s = 30-60s in series before Claude was even called — frequently hitting Vercel's 60s function timeout. Now all competitors' insights generate simultaneously; total time is bounded by the slowest single competitor (~15-20s) rather than the sum.

*components/onboarding/StepFirstAnalysis.tsx — MODIFIED*
* `LOADING_STAGES` updated from 5 stages totalling 20s to 5 stages totalling 27s (3 + 6 + 5 + 10 + 3). Stage labels updated to match actual pipeline: "Connecting to your YouTube channel...", "Analysing your competitors...", "Calculating your gap scores...", "Generating your personalised video ideas...", "Almost ready...". Previously `fetchResults` fired after 20s, called `/api/ideas/generate` which itself needed 40-60s — the generation would still be running when the user expected results.
* Added 1s settle delay (`await new Promise(r => setTimeout(r, 1000))`) after `genRes.ok` before the second `/api/ideas/latest` fetch, preventing a race where the DB write hasn't completed before the read.

*components/ideas/IdeasClient.tsx — MODIFIED*
* `STAGES` labels updated from generic "Gathering competitor intelligence / Analysing your top performing videos / Generating ideas" to "Analysing competitor insights... / Matching your top videos to proven topics... / Generating your personalised ideas..." — accurately reflects the parallel insights → Claude pipeline.
* LoadingState subtext updated from "This takes about 30 seconds" to "This takes about 40 seconds" to set accurate expectations.

### Week 3 — Day 26 (2026-05-04)

**Interactive notification settings — toggles and threshold slider wired to API**

*components/settings/NotificationSettings.tsx — NEW*
* Client Component (`'use client'`). Props: `initialDigestEnabled`, `initialAlertsEnabled`, `initialThreshold` — passed from the server component, preventing a client-side fetch on mount.
* Three controls: weekly digest toggle, viral trend alerts toggle, alert threshold slider (1.5–10×, step 0.5).
* All updates are optimistic — state updates immediately on click/release, API call fires in background via `useTransition`. Silent fail on network error (state already updated).
* Slider saves only on `mouseUp`/`touchEnd`, not on every `onChange` pixel drag — prevents spamming `POST /api/settings/notifications`.
* "Saved ✓" indicator per field: appears in green monospace next to the control, auto-clears after 2000ms via `setTimeout`.
* Slider disables when `alertsEnabled` is false, with an explanatory italicised note below.
* Styled with Tailwind classes (dark theme: zinc-700 backgrounds, zinc-800 borders, green-500 active state) to match the rest of the dashboard.

*app/(dashboard)/settings/page.tsx — MODIFIED*
* Added import: `NotificationSettings from '@/components/settings/NotificationSettings'`.
* Removed: `UserSettings` type import (unused), `Toggle` sub-component (replaced), `digestEnabled` / `alertsEnabled` / `threshold` derived variables (unused).
* Notifications Section content replaced: old read-only `Toggle` × 2 + threshold display + "use the API" note → `<NotificationSettings initialDigestEnabled={...} initialAlertsEnabled={...} initialThreshold={...} />` wrapped in a `style={{ padding: '0 16px' }}` div for horizontal alignment with the rest of the card.
* Server component already fetched `settings` via `getUserSettings(session.user.id)` — no additional Supabase query added. Values passed directly: `settings?.weekly_digest_enabled ?? false`, `settings?.alerts_enabled ?? false`, `settings?.alert_threshold_multiplier ?? 3.0`.

---

### Week 3 — Day 25 (2026-05-04)

**Onboarding polish — ideas in Step 5, mobile responsive, browser navigation fix**

*components/onboarding/StepFirstAnalysis.tsx — MODIFIED*
* `fetchResults` rewritten to auto-trigger idea generation when no ideas exist. Previously it called `Promise.allSettled([gap-score, ideas/latest])` and showed the fallback if ideas were empty. Now it: (1) fetches gap score, (2) fetches existing ideas, (3) if no ideas: calls `POST /api/ideas/generate` which auto-generates competitor insights + Claude ideas as a single pipeline, (4) fetches ideas again after successful generation. Falls back to fallback message gracefully if generation fails (free plan → 403, no competitors yet → empty insights).
* `_stage` parameter renamed in `LOADING_STAGES.forEach` to suppress TypeScript unused-variable hint.
* Gap score display: `text-7xl` → `text-5xl sm:text-7xl` — prevents 72px text overflowing on 390px mobile.
* "Take me to my dashboard →" button: added `w-full sm:w-auto` — full-width on mobile, auto on sm+.
* Idea title `break-words` added — prevents long titles overflowing card boundary on narrow screens.

*components/onboarding/StepWelcome.tsx — MODIFIED*
* "Let's go →" button: added `w-full sm:w-auto` for mobile full-width tap target.

*components/onboarding/StepConfirmChannel.tsx — MODIFIED*
* Buttons container: `flex gap-3` → `flex flex-col sm:flex-row gap-3 w-full sm:w-auto` — stacks vertically on mobile.
* Both buttons: `py-2.5` → `py-3` (44px minimum tap target per iOS HIG), added `w-full sm:w-auto`.

*components/onboarding/StepConfirmNiche.tsx — MODIFIED*
* "That's right →" button: added `w-full sm:w-auto`.

*components/onboarding/StepMeetCompetitors.tsx — MODIFIED*
* "Show me my analysis →" button: added `w-full sm:w-auto`.
* Timeout fallback "Continue →" button: added `w-full sm:w-auto`.

*app/onboarding/page.tsx — MODIFIED*
* Added `useEffect` that syncs `step` state with `searchParams` — browser back/forward now correctly updates the displayed step. Previously `step` was initialized from `searchParams` on mount only; pressing back changed the URL but left `step` at its current value (showing the wrong step). The sync effect calls `setStep(s)` whenever `searchParams` changes.

*Skip flow verified (code review only — no changes needed):*
* `step > 1` guard on skip button: ✓
* `skipOnboarding` calls `POST /api/onboarding/complete` then `router.push('/dashboard')`: ✓
* Error handling — try/catch, redirects even if complete fails: ✓
* `/api/onboarding/complete` requires auth (401), sets `onboarding_completed=true`, returns `{success:true}`: ✓

---

### Week 3 — Day 24 (2026-05-04)

**5-step onboarding flow — replaces the flag-flip + spinner**

*app/onboarding/page.tsx — NEW*
* Client Component (`'use client'`) at `/onboarding` — outside the `(dashboard)` route group so it uses only the root layout (no sidebar, no auth guard from the dashboard).
* URL state: `?step=1..5` — parsed from `useSearchParams()` on mount so refreshing on any step returns to that step.
* `startBackgroundSync()` — fires `POST /api/sync` once when user clicks "Let's go" on Step 1. Guarded by `syncStarted` ref so it never double-fires. `await` is intentional so sync runs in background while user reads channel info on Step 2.
* `skipOnboarding()` — fires `POST /api/onboarding/complete` then pushes to `/dashboard`. Available on all steps after Step 1.
* Wrapped in `<Suspense>` so `useSearchParams()` works safely in Next.js App Router without breaking static rendering.

*components/onboarding/OnboardingProgress.tsx — NEW*
* Dot row: completed steps = small green dots, current step = wide white pill, future steps = small zinc-700 dots. CSS `transition-all duration-300` for smooth width changes.
* Label below: `"Step N of 5 — [Label]"` in `font-mono uppercase tracking-widest`.

*components/onboarding/StepWelcome.tsx — NEW*
* Instrument Serif heading: "Find out exactly why your competitors are *growing faster* than you."
* Italic `<em>` in `text-amber-200` for the accent phrase — matches landing page aesthetic.
* No skip link on this step — user must click "Let's go" to start the sync.

*components/onboarding/StepConfirmChannel.tsx — NEW*
* Fetches `/api/user/profile` on mount to get channel name, thumbnail, subscriber count.
* Falls back to `session.user.name` / `session.user.image` if API fails.
* Fallback initial avatar (letter in zinc-800 circle) when no thumbnail URL.
* "Wrong account" button calls `signOut({ callbackUrl: '/' })` from `next-auth/react`.

*components/onboarding/StepConfirmNiche.tsx — NEW*
* Polls `/api/user/profile` every 1.5s up to 20 attempts (30 seconds) waiting for `niche_id` to populate.
* Shows spinner during detection, reveals detected niche in heading + dropdown on success.
* Dropdown defaults to `finance` after timeout (best guess for US creators).
* If niche was changed from detected value, fires `PATCH /api/user/profile` with `{ niche_id }` before advancing.
* Heading phrase updates live as dropdown changes: "Based on your recent videos, you create *[Niche]* content."

*components/onboarding/StepMeetCompetitors.tsx — NEW*
* Polls `/api/competitors?active=true` every 2s up to 30 attempts (60 seconds).
* Considers detection complete when all 3 tiers are present (`tier===1`, `tier===2`, `is_dominator||tier===3`).
* Partial detection (1-2 competitors after 20 attempts / 40s): shows whatever was found and lets user continue.
* Full timeout (60s) with empty list: shows "still finding" fallback with Continue button.
* Stagger reveal animation: competitor cards fade + slide in with 200ms per-card delay via inline `transitionDelay` CSS.
* Tier badges: Tier 1 = blue, Tier 2 = purple, Dominator = amber — matching existing `TierBadge` colour scheme.

*components/onboarding/StepFirstAnalysis.tsx — NEW*
* Single `setInterval` progress ticker from mount — advances 0→99% over 20s total using `TOTAL_DURATION` constant. No per-stage timer conflicts.
* Stage labels rotate on a fixed schedule (cumulative setTimeout array, all cleaned up on unmount) — completely independent from the progress bar.
* `fetchedRef` prevents double-fetch when `stageIndex` fires the effect on re-renders.
* After stages complete: `Promise.allSettled` on `/api/gap-score/latest` + `/api/ideas/latest`. Both failures handled gracefully — shows fallback "still running in background" card.
* Reveal: gap score in `text-7xl italic text-amber-200 font-serif`, primary bottleneck card, first video idea card with title + why_now.
* "Take me to my dashboard" fires `POST /api/onboarding/complete` then `router.push('/dashboard')`.

*app/api/user/profile/route.ts — NEW*
* `GET` — returns `niche_id, sub_niche, youtube_channel_id, onboarding_completed, name, channel_name, channel_thumbnail, subscriber_count` (subscriber_count from latest non-null channel_snapshots row).
* `PATCH` — accepts `{ niche_id }`, validates against 12-item VALID_NICHES list, writes `niche_id + niche_detected_at` to users table.

*app/api/competitors/route.ts — NEW*
* `GET` — returns all competitors for authenticated user. Supports `?active=true` filter. Selects `id, channel_name, channel_thumbnail, subscriber_count, tier, is_dominator, sub_niche, is_active, is_auto_detected` ordered by tier ascending.

*app/api/gap-score/latest/route.ts — NEW*
* `GET` — returns the most recent `gap_scores` row for the user (`overall_score, primary_bottleneck, estimated_revenue_gap` + all per-metric scores). Returns `{ overall_score: null }` when no rows exist.

*app/api/ideas/latest/route.ts — NEW*
* `GET` — returns up to 3 most recent ideas with non-null `opportunity_score`, ordered by `generated_at DESC`. Returns `{ ideas: [] }` when none exist.

*app/api/onboarding/complete/route.ts — NEW*
* `POST` — auth-gated, sets `onboarding_completed = true` on the users table. Called by Step 5 "Take me to my dashboard" and by "Skip onboarding" on all other steps.

*app/(dashboard)/layout.tsx — MODIFIED*
* `updateUserOnboardingStatus` import removed — no longer auto-flips the flag.
* After `getUser()`: if `!user` → `redirect('/login')`; if `!user.onboarding_completed` → `redirect('/onboarding')`.
* `SyncProvider` kept for returning users but `needsSync={false}` always — first sync is now handled by the onboarding flow, daily syncs are handled by the `user-sync` cron.

---

### Week 3 — Day 23 (2026-05-03)

**Landing page — full Next.js conversion from HTML original**

*app/landing.css — NEW*
* Extracted verbatim from the `<style>` block of the HTML design file. All CSS variables (`:root` Stencil tokens + Hiroshi Nagai palette), nav, hero, sky system, clouds, stars, windows, ribbon, how-it-works, feature grid, CTA, footer, and responsive breakpoints preserved exactly. Image path changed from `url('assets/nagai-base.png')` to `url('/nagai-base.png')` to serve from Next.js public folder.

*public/nagai-base.png — NEW*
* Hero background image copied from the design zip into the public folder so Next.js serves it as a static asset at `/nagai-base.png`.

*app/page.tsx — REWRITTEN*
* Full landing page as a Next.js Client Component (`'use client'`). Imports `./landing.css` — no Tailwind on this page.
* `useSession` + `useRouter` redirect: if user is already signed in, pushes to `/dashboard` immediately.
* All animation JavaScript from the HTML `<script>` tag moved into `useEffect` with full cleanup (`clearInterval`, `clearTimeout`, observer disconnects). TypeScript-typed throughout — no `any`.
* Dev scrubber removed entirely (was between `// ── DEV SCRUBBER` and `// ── END DEV SCRUBBER` comments).
* CTA buttons and nav links wired to real auth routes: "Connect your YouTube channel" → `/api/auth/signin?callbackUrl=/dashboard`; "Sign in" → `/api/auth/signin`; "Pricing" → `/pricing`; "How it works" → `#how` anchor.
* All HTML converted to valid JSX: `class` → `className`, `stroke-width` → `strokeWidth` etc. CSS variable style props cast as `React.CSSProperties`. Apostrophes escaped as `&apos;`.

*app/layout.tsx — updated*
* Added `SessionProvider` from `next-auth/react` wrapping `{children}` in the body. Required for `useSession` in the landing page (and any other client component) to work. Instrument Serif font link was already present.

---

### Week 3 — Day 22b (2026-04-30)

**Three infrastructure fixes: sync refactor, niche avg chart, insights truncation**

*lib/sync-logic.ts — NEW*
* Extracted `syncUserChannel(userId)` and `refreshAccessToken(userId, refreshToken)` out of `app/api/sync/route.ts` into a standalone library module. Single callable function — no HTTP required. Used by both the HTTP route and the new cron directly.
* `syncUserChannel` runs all 5 YouTube Analytics calls in parallel, token-refreshes on expiry, saves channel snapshot + video data via `lib/db.ts`. Returns `{ success, channelSnapshot, videosSynced, message }`.

*app/api/sync/route.ts — thinned to ~30 lines*
* Now a pure session-auth wrapper around `syncUserChannel()`. All business logic removed. Cron bypass path (`x-cron-user-id` header) removed — nothing uses it after the dedicated `user-sync` cron was added.

*app/api/cron/user-sync/route.ts — NEW*
* Daily cron at 3am UTC (replaces the self-HTTP call in `refresh-data`). Queries all eligible users, calls `syncUserChannel()` directly via `Promise.allSettled` — no inter-service HTTP. Returns `{ processed, succeeded, failed }`.

*app/api/cron/refresh-data/route.ts — Block 1 removed*
* The self-HTTP call to `/api/sync` per user (Block 1) is gone. `refresh-data` now only handles competitor data sync (Block 2). User analytics sync is handled entirely by `user-sync`.

*lib/db.ts — getNicheAvgViewsPerVideo added*
* `getNicheAvgViewsPerVideo(userId)` — computes niche average views/video by averaging each Tier 1 competitor's own views from videos published in the last 30 days. Uses `competitor_videos.published_at` not `synced_at` so back-filled historical videos are included. Returns `number | null`.
* Replaces the broken snapshot-date join approach (which produced zero overlap since competitors have 1 snapshot vs 30 days of user snapshots).

*components/dashboard/DashboardClient.tsx — niche avg line fix*
* Old: tried to join `competitorSnapshots` by date to draw a daily niche-avg line — zero matches, line never rendered.
* New: receives `nicheAvgViews: number | null` scalar from the page and renders it as a Recharts `<ReferenceLine>` (horizontal dashed line) on the You vs Niche chart. Semantically correct for a rolling-window metric.
* Top Ideas panel now reads from the `ideas` table (highest `opportunity_score`) instead of parsing digest text.

*components/charts/SubscriberGrowthChart.tsx — dots added*
* Added `dot={{ r: 2 }}` to competitor `<Line>` components so each data point is visibly marked, not just the connecting line.

*lib/competitor-insights.ts — truncation salvage + token bump*
* `max_tokens` raised from 1800 → 3500 to prevent mid-sentence truncation on longer insight sets.
* Added truncation salvage pass: when full JSON parse fails, walks backwards through the raw response from the last `}` character, tries slicing at each `}` + appending `]` and calling `JSON.parse`. Returns the first slice that produces ≥ 3 complete, valid insight objects. Logs a warning with the salvage count. Falls back to empty array only when fewer than 3 can be recovered.
* `REQUIRED_FIELDS` guard (`['type', 'title', 'description', 'priority']`) filters out any partially-written objects in the salvaged slice.

---

### Week 3 — Day 22 (2026-05-03)

**Three-hook ideas feature + Gemini model rename**

*lib/gemini-image.ts — model renamed*
* Model string changed from `'gemini-2.5-flash-preview-05-20'` to `'gemini-2.5-flash-image'` — the stable production model ID replacing the preview.

*types/index.ts — Idea interface extended*
* Added `hook_2: string | null` and `hook_3: string | null` immediately after `content_brief`. Old ideas (before this deploy) will have both as null — rendered as `—` in the UI.

*app/api/ideas/generate/route.ts — three-hook prompt + schema*
* System prompt extended with explicit three-hook generation rules: Hook 1 (Safe) goes in `content_brief` sentence 1, `hook_2` = Bolder variant, `hook_3` = Most Controversial variant. All three hooks are alternative openers for the same video — same Angle/Structure/Takeaway. `hook_2`/`hook_3` contain hook text only.
* `content_brief` JSON field description rewritten: now explicitly specifies exactly 4 sentences — Safe Hook → Angle → Structure → Takeaway — ensuring `parseContentBullets('. ')` always splits into 4 items that map to the UI labels.
* `hook_2` and `hook_3` added to JSON schema as required string fields.
* `ideaRows` mapping extracts both fields; logs a warning per idea if either is missing/empty and falls back to null — never fails the generation.
* Return mapping passes `hook_2`/`hook_3` through from saved DB rows.
* `max_tokens` bumped 3500 → 5000 to accommodate ~150-200 additional output tokens per idea for the two extra hooks.

*lib/db.ts — getRecentIdeasBatch updated*
* Row mapping now includes `hook_2: row.hook_2 ?? null` and `hook_3: row.hook_3 ?? null`.

*components/ideas/IdeasClient.tsx — 3-variant hook section*
* Hook bullet (index 0 of `parseContentBullets`) replaced with a 3-variant sub-section in **both** active-ideas render and done-ideas render.
* Layout: "Hook:" label, then 3 rows — numbered 1/2/3, boldness label coloured (Safe: zinc-500, Bolder: amber-500, Most controversial: rose-500), hook text in zinc-300.
* If `hook_2` or `hook_3` is null (old ideas), renders `—` with no label. No crash.
* Remaining bullets (Angle, Structure, Takeaway) rendered via `parseContentBullets(content_brief).slice(1)` exactly as before.
* Unused `contentLabels` variable removed from both render blocks.

*Database migration required (run in Supabase SQL editor before testing):*
```sql
ALTER TABLE ideas
  ADD COLUMN IF NOT EXISTS hook_2 TEXT,
  ADD COLUMN IF NOT EXISTS hook_3 TEXT;
```

---

### Week 3 — Day 21 (2026-05-01)

**Thumbnail generation feature**

*lib/gemini-image.ts — NEW*
* `generateThumbnail(params)` — calls Gemini `gemini-2.5-flash-image` (previously `gemini-2.5-flash-preview-05-20`) with the creator's photo or a stick figure placeholder + thumbnail brief + video title. Returns `{ imageBase64 }` or `{ error }`.
* Two modes: (1) real-photo mode — passes creator's actual face photo as image 1, stick figure as image 2 (ignored), instructs Gemini to place the creator prominently with strong emotion; (2) no-photo mode — passes stick figure only, instructs Gemini to transform it into an illustrated character (not a literal stick figure) matching the brief's visual style.
* Prompt enforces 16:9 aspect ratio (1280×720), mobile-first design, max 4-6 word text overlays, high contrast, single focal point.
* Uses `@google/genai` SDK with `Modality.IMAGE` output. Timeout: 30 seconds.

*lib/thumbnail-storage.ts — NEW*
* `uploadThumbnail(userId, ideaId, base64)` — decodes base64 PNG, uploads to Supabase Storage bucket `thumbnails` at path `{userId}/{ideaId}.png`, returns public URL. Overwrites existing file silently.
* `deleteThumbnailFromStorage(userId, ideaId)` — removes file from storage. Called on regeneration and when ideas are pruned.
* `loadStickFigureBase64()` — reads `public/stick-figure.png` from disk, returns base64 string for passing to Gemini.

*lib/access.ts — canGenerateThumbnail added*
* `ThumbnailQuota` interface: `{ allowed, reason, quotaUsed, quotaLimit, quotaResetAt }`.
* Monthly quota limits: free → 0 (upgrade_required), starter → 12, pro → 40.
* Auto-resets `thumbnails_generated_this_month` to 0 when `thumbnails_quota_reset_at` has passed (rolling 30-day window). Writes reset to DB on check.

*lib/db.ts — 4 new functions*
* `createThumbnailJob(params)` — inserts a `thumbnail_jobs` row with status `'pending'`.
* `updateThumbnailJob(jobId, updates)` — partial update (status, thumbnail_url, error_message, completed_at).
* `getThumbnailJob(jobId)` — fetch single job row.
* `deleteAllUserThumbnails(userId)` — fetches all idea rows with `thumbnail_image_url` for a user, calls `deleteThumbnailFromStorage` for each, then nulls out the thumbnail columns on the ideas rows. Called at start of `/api/ideas/generate` so regeneration always starts clean.
* `setIdeasRefreshAvailable(userId, available)` — upserts `ideas_refresh_available` on `user_settings`. Called with `false` after ideas are saved; set to `true` by the Monday cache-cleanup cron.
* `getIdeasRefreshAvailable(userId)` — reads `ideas_refresh_available` from `user_settings`. Returns `true` when no row exists (new users can generate immediately).

*app/api/ideas/[id]/generate-thumbnail/route.ts — NEW*
* `POST /api/ideas/[id]/generate-thumbnail` — auth-gated, idea ownership verified.
* Returns existing thumbnail immediately if one exists (no quota burn on re-open).
* Calls `canGenerateThumbnail` — returns 403/402 if plan gated or quota exceeded.
* Accepts `{ photoSource, photoBase64 }` from body. `photoSource` is `'camera' | 'upload' | 'google_profile' | 'no_photo'`. For Google profile: fetches creator's Google OAuth avatar URL from the session, downloads and base64-encodes it server-side.
* Calls `generateThumbnail(params)` from `lib/gemini-image.ts`. On success: uploads to Supabase Storage via `uploadThumbnail`, writes `thumbnail_image_url + thumbnail_generated_at + thumbnail_source_type` to the ideas row, increments `users.thumbnails_generated_this_month`. Uses `after()` from `next/server` for the async DB writes so the response returns immediately after upload.
* On Gemini error: returns `{ error }` with HTTP 500. Quota is NOT incremented on failure.

*components/ideas/ThumbnailGenerationModal.tsx — NEW*
* Multi-step modal with framer-motion transitions between steps.
* Steps: `choose_source` → one of `camera | upload | google_profile | no_photo` → `generating` → `completed | failed`.
* `choose_source`: 4 option cards — "Use my camera", "Upload a photo", "Use my Google profile photo", "No photo / illustrated". Disabled with explanation if Google profile photo is a default avatar.
* `camera`: opens `getUserMedia`, renders live `<video>` preview, capture button saves frame to canvas → JPEG base64.
* `upload`: file input, accepts image/*, resizes client-side to max 800px wide via `<canvas>` before sending.
* `google_profile`: shows avatar preview, confirm button.
* `no_photo`: instant — jumps to `generating`.
* `generating`: spinner + rotating status messages ("Generating your thumbnail…", "Adding visual polish…", "Almost ready…").
* `completed`: shows generated thumbnail image, download button, close button; fires `onSuccess(ideaId, thumbnailUrl)` callback.
* `failed`: error message, retry button.
* Image resizing: `resizeImageToBase64(file)` — renders to canvas, exports as JPEG at 0.85 quality.

*IdeasClient.tsx — thumbnail integration*
* `renderThumbnailSection(idea)`: if `thumbnail_image_url` exists, shows image + Download + Regenerate buttons. If not, shows "Generate thumbnail" button (disabled with quota message if exceeded) or "Upgrade to generate" for free plan.
* "Regenerate" button opens the modal again; existing thumbnail overwritten on success.
* `handleThumbnailSuccess(ideaId, url)` updates local `ideas` state so the card refreshes immediately without a page reload.
* Regenerate confirmation modal warns users that regenerating ideas will delete saved thumbnails — uses `deleteAllUserThumbnails` server-side at start of `/api/ideas/generate`.

*Database migrations required (run once in Supabase SQL editor):*
```sql
-- thumbnail_jobs table
CREATE TABLE IF NOT EXISTS thumbnail_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  idea_id UUID NOT NULL REFERENCES ideas(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending',
  thumbnail_url TEXT,
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

-- thumbnail columns on ideas
ALTER TABLE ideas
  ADD COLUMN IF NOT EXISTS thumbnail_image_url TEXT,
  ADD COLUMN IF NOT EXISTS thumbnail_generated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS thumbnail_source_type TEXT;

-- quota columns on users
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS thumbnails_generated_this_month INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS thumbnails_quota_reset_at TIMESTAMPTZ;
```

---

### Week 2 — Day 20 (2026-04-29)

**Ideas page rebuilt with 4-signal generation pipeline**

*types/index.ts — Idea interface*
* Added `Idea` interface with all new DB columns: `id`, `user_id`, `title`, `opportunity_score`, `thumbnail_description`, `content_brief`, `suggested_duration_min/max`, `duration_reasoning`, `why_now`, `topic_source`, `generated_at`, `planned_at`, `made_at`. The old `GeneratedVideoIdea` type is kept for backward compat but is no longer used in the ideas pipeline.

*lib/access.ts — getIdeaLimit corrected*
* Pro plan changed from 6 to 10 ideas per generation batch. Free plan now returns 0 (not 3) since free users can't generate at all.

*lib/competitor-insights.ts — generateAndCacheInsightsForCompetitor added*
* Exported shared function that takes `(competitorId, userId)`, loads all necessary data (competitor row, user snapshots, videos, gap scores, subscriber growth), calls `generateCompetitorInsights`, saves to DB via `saveCompetitorInsights`, and returns `Insight[]` (or `[]` on failure). Never throws. This is the single code path for insight generation.
* `createServiceClient` and `saveCompetitorInsights` imports added. `GapScoreRow` type moved into this file.

*app/api/competitors/insights/route.ts — thin wrapper*
* Route now does: auth, cache check, ownership verify, quick 422 pre-check (data completeness), then delegates to `generateAndCacheInsightsForCompetitor`. All data-loading logic removed from the route — it lives in the shared function. Existing InsightsTab behaviour unchanged.

*lib/db.ts — getRecentIdeasBatch added*
* Fetches the most recent batch of idea rows (all rows within ±1 minute of the most recent `generated_at` for that user). Returns `Idea[]` sorted by `opportunity_score desc`. Filters to `opportunity_score IS NOT NULL` to skip old JSONB-style rows. Returns `[]` when no new-schema rows exist.
* `Idea` type added to the imports.

*app/api/ideas/generate/route.ts — NEW*
* Full generation pipeline:
  1. Auth + plan resolution (inline, mirrors lib/access.ts getUserPlan logic)
  2. Plan limit check: Starter → 429 if generated this calendar month; Pro → 429 if generated within last 7 days; Free → 403 upgrade_required
  3. Queries all active competitors; finds those with null or stale (>7d) insights
  4. Generates missing insights sequentially via `generateAndCacheInsightsForCompetitor` — failure per-competitor logged, never blocks
  5. Re-fetches competitors with fresh insights; loads top-5 user videos, all competitor videos (last 90d), latest snapshot, user avg duration — all in `Promise.all`
  6. Computes per-competitor winning videos: videos beating that competitor's own avg by >30% (last 90d), sorted desc, top 5; falls back to top 3 when no video crosses threshold
  7. Builds dynamic Claude prompt (system + user) using all 4 signals
  8. Calls `claude-sonnet-4-6`, max_tokens 3500, temperature 0.7
  9. Extracts JSON with bracket-depth matcher (same algorithm as competitor-insights.ts)
  10. Inserts individual idea rows (one per idea) with all new columns; returns rows from INSERT...SELECT
  11. Prunes ideas older than 4 weeks
  12. Returns `{ ideas, generatedAt, regenerateAvailableAt }`

*app/api/ideas/[id]/plan/route.ts — NEW*
* POST with auth + ownership check. Sets `planned_at = NOW()` on the ideas row. Returns `{ success: true }`.

*app/api/ideas/[id]/made/route.ts — NEW*
* POST with auth + ownership check. Sets `made_at = NOW()` on the ideas row. Returns `{ success: true }`.

*components/ideas/IdeasClient.tsx — NEW*
* Client component. Props: `initialIdeas`, `isFresh`, `plan`, `regenerateAvailableAt`, `ideaLimit`.
* On mount: if `!isFresh && initialIdeas.length === 0` → triggers generation automatically.
* Loading state: centered card with title, subheading, and 3 labelled stage indicators that auto-advance via `setTimeout` (8s → stage 1, 18s → stage 2) to simulate progress. If regenerating with stale ideas, greyed-out previous titles shown below loader.
* Ideas grid: 2-col responsive, sorted by `opportunity_score` desc. Each card shows: score badge (green ≥80, amber ≥50, gray otherwise), duration pill, planned/made badge, title, why-now italic, 4 sections (thumbnail brief, content brief, duration logic, why we suggested this), action buttons.
* Action buttons: "Mark as planned" calls `/api/ideas/[id]/plan` and updates local state. "Mark as made" calls `/api/ideas/[id]/made` and moves card to Done section.
* Done section: collapsed by default, toggled by user. Shows same cards greyed out with opacity 0.55.
* Header: title + subheading; right side shows "Regenerate ideas" button (green, enabled) or muted "Next refresh on {date}" text when locked; Starter plan shows indicator bar with count and upgrade link.
* Empty state: centered card with "Generate ideas" primary button.

*app/(dashboard)/ideas/page.tsx — REWRITTEN*
* Server component. Auth check → redirect on no session. Parallel fetch: user subscription data, `getRecentIdeasBatch`, `getIdeaLimit`. Resolves plan inline. Computes `isFresh` (batch generated within 7 days) and `regenerateAvailableAt` (first of next month for Starter, generatedAt+7d for Pro). Passes all to `IdeasClient`. No Claude call server-side.

*Database migration (run in Supabase SQL editor before testing):*
```sql
ALTER TABLE ideas ALTER COLUMN ideas DROP NOT NULL;
ALTER TABLE ideas
  ADD COLUMN IF NOT EXISTS title TEXT,
  ADD COLUMN IF NOT EXISTS opportunity_score INTEGER,
  ADD COLUMN IF NOT EXISTS thumbnail_description TEXT,
  ADD COLUMN IF NOT EXISTS content_brief TEXT,
  ADD COLUMN IF NOT EXISTS suggested_duration_min INTEGER,
  ADD COLUMN IF NOT EXISTS suggested_duration_max INTEGER,
  ADD COLUMN IF NOT EXISTS duration_reasoning TEXT,
  ADD COLUMN IF NOT EXISTS why_now TEXT,
  ADD COLUMN IF NOT EXISTS topic_source TEXT,
  ADD COLUMN IF NOT EXISTS planned_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS made_at TIMESTAMPTZ;
```

---

### Week 2 — Day 19 (2026-04-28)

**5 competitor system fixes — activity filter, sub-niche, insights, re-detection**

*app/api/competitors/insights/route.ts — Fix 4: video_count null fallback*
* Added `effectiveVideoCount` fallback: if `competitor.video_count` is null on the row, runs a COUNT query against `competitor_videos` directly. The `hasEnoughData` check now uses `effectiveVideoCount > 0` instead of `competitor.video_count != null`. Added `console.log` before the check for Vercel log diagnostics. This unblocked Rob Berger's Insights tab which was returning 422 despite having 20 videos and `avg_views_per_video` populated.

*lib/niche-engine.ts — Fix 3: sub-niche detection in assignCompetitor*
* After inserting competitor videos, immediately runs `detectSubNiche(videoTitles)` if `videoRows.length >= 3`. On success, writes `sub_niche`, `sub_niche_keywords`, `sub_niche_match_score` to the competitors row. Failure is caught and logged — never blocks competitor assignment. Result: sub_niche is populated the moment a competitor is assigned, not overnight.

*app/api/cron/refresh-data/route.ts — Fix 3: sub-niche detection in cron*
* Added `import { detectSubNiche }` and `sub_niche` to the competitor SELECT. After updating metrics in Block 2, if `!comp.sub_niche && recentVideos.length >= 3`, runs `detectSubNiche` and writes the result. Failure is silently caught — never blocks the cron. Handles competitors that had null sub_niche before this fix was deployed.

*lib/niche-engine.ts — Fix 1: activity threshold before assigning any competitor*
* Added `meetsActivityThreshold(channelId)` function: calls `getRecentVideos(channelId, 20)` (200 quota units), filters results to last 30d and 60d, returns false if `last30 < 3 || last60 < 6`. Logs the counts on failure.
* Replaced single-pick `[0]` for each tier pool with a for-loop that calls `meetsActivityThreshold` and breaks on the first active candidate. Inactive channels are skipped, next-best candidate is tried. If no active candidate exists for a tier, logs a warning and skips that tier rather than assigning an inactive channel.

*lib/niche-engine.ts — Fix 2: immediate refresh after detection*
* At the end of `detectAndAssignCompetitors`, after `Promise.allSettled`, if any competitors were successfully assigned, fires a fire-and-forget `fetch` to `/api/cron/refresh-data` with the `CRON_SECRET` bearer token. This triggers the full cron immediately so videos, metrics, snapshots, and sub-niches populate without waiting for 3am UTC. Errors are logged only — never throws.

*lib/niche-engine.ts — Fix: skip filled tiers in toAssign*
* Added `filledTiers` set from existing active auto-detected competitors' tier values. `toAssign` now only includes a tier if `!filledTiers.has(tier)`. Prevents duplicate competitors per tier when detection re-runs to fill missing slots (e.g. after inactive competitors are deleted and 1 tier is already occupied).

*app/api/sync/route.ts — Fix: per-tier check replaces total count === 0*
* Changed step 6 condition from `existingAutoCount === 0` (never re-detects once any competitor exists) to a per-tier check: queries `tier` values for all active auto-detected competitors, builds a `Set<number>`, then runs detection if any of tier 1/2/3 is missing from the set. This means detection re-runs after inactive competitors are deleted (recovery path), not just on first-ever sync.

*scripts/reset-inactive-competitors.ts — Fix 5: cleanup script*
* Iterates active auto-detected competitors, checks `competitor_videos` count for each. If count === 0: deletes `competitor_snapshots` first, then `competitor_videos`, then `competitors` row (FK order). Logs each deletion. Skips active channels. Verified: deleted School of Personal Finance and Erika Kullberg, kept Rob Berger (20 videos).

*Result after running fixes*
* Sync triggered: detected Personal Finance with Ravi Sharma (Tier 1, 24 videos, sub_niche populated), Graham Stephan (Tier 3 Dominator, 15 videos, sub_niche populated). Rob Berger (Tier 2) kept. Sub_niche for Rob will populate on next cron run.

---

### Week 2 — Day 18 (2026-04-28)

**Competitor auto-detection wired into /api/sync**

*lib/niche-engine.ts — 3 new functions*
* `searchAllChannelCandidates(query, excludeChannelId)` — internal helper that makes one `search.list` call (maxResults=50) and one `channels.list` call. Returns ALL results without sub count filtering (101 quota units). Used by `detectAndAssignCompetitors` so a single search covers all three tiers.
* `assignCompetitor(userId, candidate, tier)` — internal helper that mirrors the `app/api/competitors/track/route.ts` pipeline exactly: inserts competitor row, calls `getCompetitorFullProfile`, builds video rows, deletes + inserts to `competitor_videos`, calls `calculateCompetitorMetrics`, calls `updateCompetitorMetrics`, calls `saveCompetitorSnapshot`. If `getCompetitorFullProfile` fails, the competitor row is kept and data syncs overnight.
* `detectAndAssignCompetitors(userId, nicheId, userSubscriberCount)` — exported orchestrator. Calls `searchAllChannelCandidates` once (101 units), classifies all candidates by tier ratio (Tier 1: 0.5x–3x, Tier 2: 3x–10x, Tier 3: >10x), picks best Tier 1 (closest to 2× user subs), best Tier 2 (closest to 5×), best Dominator (largest). Runs `assignCompetitor` for all three in parallel via `Promise.allSettled` so one failure doesn't block others. Logs a warning per missing tier (partial detection is better than none). Never throws. Total quota: ~710 units (101 search + up to 3 × 203 full profiles).

*app/api/sync/route.ts — step 6 added*
* After the existing analytics sync and sub-niche detection fire-and-forget, added a new try/catch block (step 6) that checks `competitors` for `is_auto_detected=true AND is_active=true` for the current user. If count is 0, reads the latest non-null `channel_snapshots.subscriber_count` (falls back to 45,000 if no snapshot exists yet), then calls `detectAndAssignCompetitors`. The entire block is wrapped in try/catch — auto-detection failure never crashes the sync response.
* Condition `existingAutoCount === 0` ensures detection runs exactly once per user lifetime. Subsequent syncs skip it in milliseconds.

*Imports added to lib/niche-engine.ts:* `getCompetitorFullProfile` from youtube-data, `calculateCompetitorMetrics` from competitor-metrics, `updateCompetitorMetrics` + `saveCompetitorSnapshot` from db.

### Week 2 — Day 17 (2026-04-28)

**Competitor insights — 5 new data points + richer prompt**

*app/api/competitors/insights/route.ts — expanded data pipeline*
* Added parallel queries for best 3 videos (top by view_count) and worst 3 videos (bottom by view_count, only videos >7 days old to exclude brand-new uploads with no data yet).
* Revenue and RPM extracted from the already-loaded `userSnapshot` — no extra query needed.
* Added gap scores query (most recent `gap_scores` row): overall, views_gap, ctr_gap, watch_time_gap, upload_frequency_gap, estimated_revenue_gap, primary_bottleneck. Cast to local `GapScoreRow` type to work around Supabase `GenericStringError` inference on string-based `.select()` + `.maybeSingle()`.
* Viral videos separated from `competitorVideos`: filtered `is_viral === true`, sorted by `performance_vs_avg` descending, sliced to top 3 — no new DB query needed.
* Subscriber growth trend: queries oldest valid `channel_snapshots` row from last 30 days, computes net change, growth %, and trend direction: `growing` (>+2%), `flat` (−2% to +2%), `declining` (<−2%).
* All 9 new queries/computations run in a single `Promise.all` alongside the existing ones — no extra roundtrips.
* `GapScoreRow` local type defined at module top to cast the Supabase result cleanly.

*lib/competitor-insights.ts — interface + prompt overhaul*
* `InsightUserMetrics` extended with: `estimated_monthly_revenue`, `rpm`, `best_videos[]`, `worst_videos[]`, `gap_scores` object, `subscriber_growth` object (all nullable where data may be absent).
* `InsightCompetitorMetrics` extended with: `viral_videos[]` (title, view_count, performance_vs_avg, published_at).
* Prompt completely rewritten: structured with `═══` section dividers, full data block for user (including revenue, RPM, best/worst videos, gap scores, subscriber trend) and competitor (including viral breakout videos). 8 explicit instructions covering best/worst pattern analysis, viral title format, growth-aware framing, revenue dollar impact, and a rule against using "likely"/"suggests" when exact data is available.
* JSON extraction made robust: `raw.match(/\[[\s\S]*\]/)` regex instead of strip-only clean — handles any preamble or markdown Claude may prepend.
* Insight count changed from 5-7 to 6-8. Priority rules tied to `primary_bottleneck` OR `estimated_revenue_gap > $100/month`.
* `max_tokens` kept at 1800 (was already 2000; aligned to spec).

*Validation (scripts/test-insights-expanded.ts)*
* Test passed 9/9 checks: names both channels, references best/worst video titles, gap scores, subscriber growth trend, viral title pattern, revenue/RPM, and produces exactly 6-8 insights.
* Sample output for Humphrey Yang vs test channel: all 8 insights contained at least one specific number per sentence, named both channels, and ended with a concrete next action.

### Week 2 — Day 15 (2026-04-28)

**Manual competitor add — full data fetch on track**

*lib/competitor-metrics.ts — NEW*
* Pure function `calculateCompetitorMetrics(videos, totalVideoCount?)` — takes video rows matching the `competitor_videos` shape and returns `{ video_count, avg_views_per_video, avg_video_length_seconds, upload_frequency_30d, velocity_score_avg }`. No DB calls, no side effects.

*app/api/competitors/track/route.ts — post-insert pipeline*
* Fixed `is_dominator` from hardcoded `false` to `tier === 3`.
* After inserting the competitor row, immediately calls `getCompetitorFullProfile(channelId)` to fetch channel stats + recent videos + velocity data from the YouTube Data API.
* Builds `videoRows` from the full profile (merging velocity scores) and upserts them to `competitor_videos`.
* Calls `calculateCompetitorMetrics` on the video rows, then `updateCompetitorMetrics` and `saveCompetitorSnapshot` to populate all metric columns and write the first snapshot row.
* If the YouTube API call fails (quota, network, invalid ID), logs the error, skips steps 1C–1F, and returns `{ success: true, warning: '...' }` — the competitor row is already inserted, partial success beats total failure.
* Response now includes `{ tier, metricsPopulated, warning? }`.

*app/(dashboard)/competitors/page.tsx*
* Added `channel_snapshots` fetch (latest valid subscriber_count) to the parallel Promise.all. Passes `userSubscriberCount` to `CompetitorsTable`.

*components/competitors/CompetitorsTable.tsx*
* Added `userSubscriberCount?: number | null` prop. `CompetitorRow` computes a client-side fallback tier via the same ≤3x/≤10x/>10x ratio when `competitor.tier` is null. Passes `displayTier` to `TierBadge` instead of `competitor.tier` directly.

*components/competitors/tabs/OverviewTab.tsx — null-safety rewrite*
* All competitor-side metrics (`compAvgViews`, `compAvgLength`, `compUploadFreq`, `compVideoCount`) now return `null` (not `0`) when there is genuinely no data — triggers "—" in the UI.
* Added `fmtOrDash` and `fmtDurationOrDash` helpers.
* Viral count shows "—" when `competitorVideos` is empty; actual count (including 0) when videos are loaded.
* Gap for avg views is null when `compAvgViews` is null — no misleading negative gap.

*components/competitors/tabs/ContentTab.tsx — null-safety rewrite*
* `formatDuration(seconds: number | null)` replaces `fmtDuration` — returns "—" for null or 0.
* Upload frequency computed defensively: prefers `competitor.upload_frequency_30d`, falls back to counting recent videos, shows "—" if neither is available.
* `topDays` shows "—" when no videos loaded instead of "No pattern detected".

*components/competitors/tabs/VideosTab.tsx*
* Empty state message updated: "No videos found yet. Video data syncs overnight — check back tomorrow."

*app/api/competitors/insights/route.ts — data completeness guard*
* Before calling `generateCompetitorInsights`, checks that `avg_views_per_video`, `subscriber_count`, and `video_count` are all non-null. Returns `{ error, retryable: true }` with HTTP 422 if any are missing — prevents Claude receiving a prompt full of null values.

*components/competitors/tabs/InsightsTab.tsx — 422 handling*
* On 422 response, sets `retryable: true` and renders a "Gathering data for this channel…" state with a "Try again" button instead of a red error message.

---

### Week 2 — Day 14 (2026-04-27)

**Cron wiring, insights caching, dashboard UI overhaul, competitor analysis tabs, manual add lock**

*app/api/cron/refresh-data/route.ts — full rewrite*
* After syncing competitor videos for each user, now computes 5 metrics from the fetched videos: `avg_views_per_video`, `avg_video_length_seconds`, `upload_frequency_30d` (30-day count), `velocity_score_avg`, plus reads `video_count` and `subscriber_count`/`total_views` from the channel stats call.
* Calls `updateCompetitorMetrics(competitorId, metrics)` and `saveCompetitorSnapshot(competitorId, metrics)` for every refreshed competitor — writes to both `competitors` row and `competitor_snapshots` table.
* After all users processed: wipes `competitors.insights` and `competitors.insights_generated_at` for all rows so insights are regenerated fresh on next user visit.
* Added `getRecentCompetitorVideos(competitorId, days)` to `lib/db.ts`.

*app/api/cron/dominator-refresh/route.ts — skip-if-exists logic*
* Now checks for an existing `is_dominator=true, is_active=true` competitor before running `findDominatorsForUser`. If one exists, logs and skips — prevents re-assigning Dominators on every daily cron run.

*app/api/competitors/insights/route.ts — rewrite to use on-row cache*
* Was wrongly querying a non-existent `competitor_insights` table. Now uses `getCachedInsights(competitorId, 7)` (reads `competitors.insights` column) and `saveCompetitorInsights(competitorId, insights)` from `lib/db.ts`. Returns `{ insights, cached: true/false }`.

*components/charts/SubscriberGrowthChart.tsx — NEW*
* Log-scale multi-line Recharts chart showing subscriber growth over time for user + all competitors.
* Color coding: user=green, Tier 1=blue, Tier 2=purple, Dominator=amber, manual (is_searched)=yellow.
* `YAxis scale="log"`, `connectNulls`, custom legend below chart. 280px height.

*components/dashboard/DashboardClient.tsx — major rewrite*
* Removed: Trend Radar section (hardcoded fake rows), Setup Checklist section.
* Added: `SubscriberGrowthChart` component (requires `competitorSnapshots` prop from page).
* You vs Niche chart: added dashed blue `niche` line = average of Tier 1 competitor snapshots' `avg_views_per_video` per date.
* Gap score rows now show unit labels below the metric name: `last 30 days` / `% of impressions` / `avg minutes per video` / `videos per month`.
* Top Ideas panel reduced to 1 idea + "See all ideas →" link to `/ideas`.
* Layout reworked: two-col grid for Competitors+SubscriberGrowthChart, two-col for YouVsNiche+TopIdea.

*app/(dashboard)/dashboard/page.tsx*
* Added `getAllCompetitorSnapshotsForUser(userId, 30)` to parallel fetch. Passes `competitorSnapshots` to DashboardClient.

*components/competitors/CompetitorAnalysis.tsx*
* Added `userVideos: UserVideoRow[]` prop, forwarded to OverviewTab and ContentTab. Passes `nicheId` to ContentTab.

*components/competitors/tabs/OverviewTab.tsx — complete rewrite*
* User avg video length and upload frequency computed from `userVideos` prop.
* Competitor side prefers stored columns (set by cron); falls back to computing from videos array.
* CTR and watch time for competitor: renders "Not publicly available" with YouTube explainer — no fake estimates.
* Total videos row added for both sides.

*components/competitors/tabs/ContentTab.tsx — complete rewrite*
* User avg video length from `userVideos`. Top posting days from competitor videos.
* Sub-niche explainer: "The specific angle this channel focuses on within {nicheName}".
* Keywords empty state: "No specific keywords detected yet — sub-niche is still being analyzed".

*components/competitors/tabs/VideosTab.tsx — complete rewrite*
* Shows 10 most recent videos sorted by `published_at` desc.
* Thumbnail 96×54, clickable title link to YouTube, views, likes, duration, velocity (views/hr), 🔥 VIRAL badge, amber border highlight for viral videos.

*app/api/competitors/track/route.ts + components/competitors/ChannelSearchBar.tsx — manual lock*
* `track/route.ts`: checks `replacement_locked_until > NOW()` before inserting — returns 409 with `unlock_date` if locked. Sets `replacement_locked_until = NOW()+30d` on every insert. Replacement soft-delete only runs if existing lock is expired.
* `ChannelSearchBar`: new `lockedUntil` and `lockedChannelName` props. Shows amber warning banner when slot is locked; disables input, search, and Track button. Track button now opens a confirmation modal showing unlock date (today+30) before calling the API.

*app/(dashboard)/competitors/page.tsx + CompetitorsTable.tsx — lock wiring*
* Page now fetches the active searched competitor with a future `replacement_locked_until` in the same Promise.all as the competitors list.
* Passes `lockedUntil` and `lockedChannelName` through `CompetitorsTable` → `ChannelSearchBar`.

*app/(dashboard)/competitors/[id]/page.tsx*
* Added 4th parallel fetch: user's own videos (duration, published_at, view_count, last 50). Passes as `userVideos` to CompetitorAnalysis.

---

### Week 2 — Day 13 (2026-04-26)

**Database foundation + seed data expansion**

*supabase/migrations/004\_competitor\_snapshots.sql*
* New `competitor_snapshots` table — daily historical snapshots per competitor (mirrors `channel_snapshots` for the user's own data). Columns: `subscriber_count`, `total_views`, `video_count`, `avg_views_per_video`, `avg_video_length_seconds`, `upload_frequency_30d`, `velocity_score_avg`. Unique constraint on `(competitor_id, snapshot_date)`. RLS: users can only SELECT rows for their own competitors.
* Seven new columns added to `competitors`: `video_count`, `avg_views_per_video`, `avg_video_length_seconds`, `upload_frequency_30d` (displayable metrics), `insights` JSONB + `insights_generated_at` (on-row cache for Claude insights — 7-day TTL), `replacement_locked_until` (manual competitor swap lock, NULL for auto-detected).
* Index added: `idx_competitor_videos_competitor_published` on `competitor_videos(competitor_id, published_at DESC)`.

*types/index.ts*
* `Insight` interface moved from `lib/competitor-insights.ts` into `types/index.ts` — canonical location. `competitor-insights.ts` now imports it from there.
* `Competitor` interface updated with all 7 new nullable fields.
* New `CompetitorSnapshot` interface added.

*lib/db.ts — 6 new functions*
* `saveCompetitorSnapshot(competitorId, data)` — UPSERT on `(competitor_id, snapshot_date)` for today UTC. Called by the daily refresh cron (next session).
* `getCompetitorSnapshots(competitorId, days)` — last N days for one competitor, ascending order (chart-ready).
* `getAllCompetitorSnapshotsForUser(userId, days)` — groups snapshots by competitor; returns `{ competitorId, snapshots }[]` for multi-line dashboard chart.
* `updateCompetitorMetrics(competitorId, metrics)` — partial update on competitors row; used by daily cron.
* `saveCompetitorInsights(competitorId, insights)` — writes JSONB insight array + sets `insights_generated_at = NOW()`.
* `getCachedInsights(competitorId, maxAgeDays)` — returns cached insights if fresh, null if absent/stale.

*scripts/seed-test-data.ts — fully rewritten to upsert mode*
* Finds test user by email (`vedangk2912@gmail.com`); exits with clear error if not found.
* Sets `niche_id = 'finance'` and `sub_niche = 'Personal Finance & Money Management'` if not already correct.
* Competitors: 1 Tier 1 (Finance With Sarah, 112K), 1 Tier 2 (Money With Marcus, 380K), 1 Dominator (Wealth Empire, 2.4M). Old "Smart Money Moves" deactivated (`is_active=false`). All 3 have `sub_niche`, `sub_niche_keywords`, `video_count`, `avg_views_per_video`, `avg_video_length_seconds`, `upload_frequency_30d` populated.
* Own channel videos: 15 finance videos spread over 90 days with realistic variance (3 "hit" outliers). Existence-checked per `(user_id, youtube_video_id)`.
* Competitor videos: ensured ≥10 per competitor. Adds only what's missing (idempotent). Per-tier view ranges: Sarah 18K–75K, Marcus 65K–240K, Dominator 450K–1.9M.
* Channel snapshots: 31 rows (days -30 to today) via per-row existence check. Random walk from 42K → 45K subs.
* Competitor snapshots: 31 rows × 3 competitors = 93 rows. Per-competitor random walk matching final subscriber counts.
* Verification block confirms all tables populated correctly; exits with code 1 on any failure.

---

### Week 2 — Day 12 (2026-04-26)

**Cron sync reliability fixes**

*app/api/cron/refresh-data/route.ts + app/api/cron/weekly-digest/route.ts — subscription status filter*
* Both cron routes were filtering `.in('subscription_status', ['trial', 'starter', 'pro'])`. These values don't exist in the DB — Lemon Squeezy writes `'on_trial'`, `'active'`, `'past_due'`. Result: zero users were ever selected, cron ran but processed nobody.
* Fixed to `.in('subscription_status', ['on_trial', 'active', 'past_due'])` in both routes.
* `'past_due'` included deliberately — `lib/access.ts` grants a 3-day grace period for past-due users so they should still receive syncs and digests during that window.

*app/api/sync/route.ts — automatic token refresh on expiry*
* OAuth access tokens expire after 1 hour. The NextAuth JWT callback in `auth.ts` refreshes tokens when the user browses the app — but cron runs at 3am with no active session, reads the stale token from DB, and gets `TOKEN_EXPIRED` from YouTube Analytics.
* Added `refreshAccessToken(userId, refreshToken)` function: calls `https://oauth2.googleapis.com/token` with the stored `youtube_refresh_token`, writes the new access token + expiry back to the `users` table.
* When `TOKEN_EXPIRED` is caught during analytics calls, the route now: (1) calls `refreshAccessToken`, (2) retries all 5 YouTube Analytics calls with the new token. Only returns 401 to the caller if the refresh itself fails (e.g. user revoked app access in Google settings).
* This means crons will self-heal without requiring the user to log back in.

---

### Week 2 — Day 10–11 (2026-04-20)

**Competitors system — Phase 1: foundation**

*lib/sub-niche-detector.ts*
* `detectSubNiche(videos)` — calls Claude Sonnet 4.6 at temperature 0.3 to classify a creator's granular specialisation within their broad niche (e.g. "Finance → Credit Card Rewards & Travel Hacking"). Requires ≥3 videos; returns `{ sub_niche, keywords, confidence }`. Falls back to `{ sub_niche: 'General', keywords: [], confidence: 0 }` on insufficient data.
* `calculateSubNicheSimilarity(a, b)` — keyword overlap ratio used to determine how well a competitor's sub-niche matches the user's. Used by dominator-finder and competitor-matcher.

*lib/dominator-finder.ts*
* `findDominatorsForUser(userId, nicheId, subNiche, subNicheKeywords)` — finds Tier 3 dominator channel (>10x user's subscribers) using niche-specific matching rules. Niches `gaming/fitness/tech/education` use sub-niche matching (similarity score required); `finance/beauty/travel/business/entertainment/diy/vlog/cooking` use broad niche matching. Saves winner to `competitors` table with `is_dominator=true`, records history in `dominator_history`.

*lib/plan-limits.ts*
* `PLAN_LIMITS` config: free → 0 competitors/no search; starter → 4 total (3 auto + 1 searched), 1 search/month; pro → 13 total (10 auto + 3 searched), unlimited searches.
* `getPlanLimits(userId)` — loads user's plan from DB, returns the matching limits object.
* `canSearchThisMonth(userId)` — counts `user_search_history` rows this calendar month, returns true/false.

*lib/competitor-matcher.ts*
* `calculateTier(userSubs, competitorSubs)` — ratio-based: ≤3x → Tier 1, ≤10x → Tier 2, >10x → Tier 3.
* Exports `CompetitorMatch` interface with `{ tier, sub_niche, sub_niche_keywords, match_score }`.

*DB migration: supabase/migrations/002_competitors_phase1.sql*
* Adds `sub_niche`, `sub_niche_keywords`, `sub_niche_confidence`, `sub_niche_detected_at` to `users`.
* Adds `sub_niche`, `sub_niche_keywords`, `is_dominator`, `is_searched`, `searched_at`, `sub_niche_match_score` to `competitors`.
* Creates `dominator_history`, `user_search_history`, `searched_channels_cache` tables with indexes and RLS policies.

*API: app/api/users/detect-sub-niche/route.ts*
* `POST` — session auth or cron bypass. Reads user's stored videos from DB, calls `detectSubNiche`, writes result to `users` table. Called fire-and-forget from `/api/sync` after the first sync completes.

*Updated: app/api/sync/route.ts*
* After data sync completes, fires `POST /api/users/detect-sub-niche` with no await (fire-and-forget) so sub-niche detection doesn't block the sync response.

*app/(dashboard)/competitors/page.tsx — rebuilt*
* Replaced old basic list with filter tabs (All / Tier 1 / Tier 2 / Dominator), `CompetitorsTable`, `UpgradeBanner` (shown when plan limit reached), `PlanLimitIndicator` (X of N slots used).

*Dashboard: DashboardClient.tsx*
* Competitors section now shows 1 Tier 1 + 1 Tier 2 only (Dominators excluded from dashboard strip). Added "View all competitors →" link to `/competitors`.

*Components added:*
* `TierBadge` — colour-coded pill (Tier 1: blue, Tier 2: purple, Dominator: orange)
* `UpgradeBanner` — plan upgrade nudge when limit reached
* `PlanLimitIndicator` — "2 of 4 competitor slots used"
* `CompetitorsTable` — sortable/filterable list with tier, sub-niche, last synced, link to detail page

*New cron routes added to vercel.json:*
* `/api/cron/dominator-refresh` → daily 4am UTC
* `/api/cron/sub-niche-detection` → daily 5am UTC

---

**Competitors system — Phase 2: channel search + deep analysis**

*lib/channel-search.ts*
* `normalizeChannelInput(input)` — accepts YouTube channel URL, @handle, or raw channel ID. Resolves @handles to channel IDs via YouTube Data API (`forHandle` parameter). Validates `UC...` format.
* `getChannelData(channelId)` — checks `searched_channels_cache` first (7-day TTL). On miss: calls YouTube Data API for channel stats + recent videos, runs `detectSubNiche`, writes to cache, returns `SearchedChannelData`.
* Full `SearchedChannelData` interface: channel metadata, subscriber/view counts, recent videos array, `cached: boolean`.

*lib/competitor-insights.ts*
* `generateCompetitorInsights(user, competitor)` — calls Claude Sonnet 4.6 to produce 5-7 typed insights comparing user vs competitor. Returns `Insight[]` with `{ type: 'observation'|'recommendation'|'strength'|'gap', title, description, priority: 'high'|'medium'|'low' }`.

*New API routes:*
* `GET /api/competitors/[id]` — returns single competitor row, auth + ownership verified.
* `POST /api/competitors/search` — validates plan allows search this month, normalises input, calls `getChannelData`, records to `user_search_history`, returns channel data.
* `POST /api/competitors/track` — validates plan slot availability, inserts competitor with tier + sub-niche match score, records in `user_search_history.added_as_competitor`.
* `POST /api/competitors/insights` — loads user snapshot and competitor data, calls `generateCompetitorInsights`, returns insights array.

*New page: app/(dashboard)/competitors/[id]/page.tsx*
* Server component — auth guard, ownership check (competitor.user_id === session.user.id), loads competitor + last 20 videos + user snapshots in parallel. Renders `CompetitorAnalysis`.

*New components: components/competitors/*
* `CompetitorAnalysis` — 5-tab shell: Overview / Content / Growth / Videos / Insights
* `ChannelSearchBar` — text input accepting URL/handle/ID, calls `/api/competitors/search`, shows results with subscribe count and "Track" button, enforces plan limit guard before rendering
* `tabs/OverviewTab` — side-by-side metrics cards: subscribers, avg views, avg watch time, viral video count
* `tabs/ContentTab` — upload frequency, avg video length, top performing titles
* `tabs/GrowthTab` — line chart (Recharts) comparing user vs competitor subscriber/view snapshots over time
* `tabs/VideosTab` — recent competitor videos list with velocity score, viral flag, published date
* `tabs/InsightsTab` — calls `/api/competitors/insights` on mount, renders typed insight cards colour-coded by priority

*New cron: /api/cron/cache-cleanup/route.ts*
* Runs daily 2am UTC. Deletes `searched_channels_cache` rows past `expires_at`, deletes `user_search_history` rows older than 90 days.

---

### Week 2 — Day 9 (2026-04-19)

**Dashboard bug fixes**

*lib/db.ts — `saveChannelSnapshot` field preservation*
* Previously: delete + insert with only 3 fields (total_views, avg_view_duration_seconds, estimated_monthly_revenue). Every sync nuked seeded/Data-API fields like subscriber_count, avg_views_per_video, avg_ctr.
* Fix: fetch existing snapshot row before delete. Re-insert preserves subscriber_count, videos_count, avg_views_per_video, avg_ctr, avg_like_ratio, rpm, momentum_score from the existing row. avg_view_duration_seconds is only overwritten when the Analytics API returns > 0 (zero = no 90-day data for this channel, keep existing). estimated_monthly_revenue falls back to existing if Analytics API returns 0.
* Result: all 5 metric cards (Subscribers 45K, Avg views 8.4K, CTR 2.1%, Avg watch 6:20, Est. rev $168) survive a sync.

*components/dashboard/DashboardClient.tsx — Topic coverage removed*
* `gapRows` array no longer includes the "Topic coverage" entry. `topic_coverage_gap_score` is a stub that always returns 0 — showing it created a misleading all-zero bar.
* Array now has 4 rows: Avg views / video, Click-through rate, Watch time, Upload frequency.

*Supabase data correction*
* Updated gap_scores row for test user: watch_time_gap_score=15, upload_frequency_gap_score=85, topic_coverage_gap_score=NULL. Previous values were 0 for both (incorrect — caused by an earlier scorer run before calibration was complete).
* Script: `scripts/update-gap-scores.ts`

---

### Week 1 — Day 8 night (2026-04-15)

**app/api/webhooks/lemonsqueezy/route.ts — payment failed email**

* Added Resend email send inside the `subscription_payment_failed` handler, after marking the user `past_due`.
* Uses `Resend` client imported directly (not via `lib/email.ts` — this is a transactional alert, not a digest).
* from: `ShowStencil <onboarding@resend.dev>` / subject: `"Action required: Your ShowStencil payment failed"`.
* HTML body: heading, 3-day grace period notice, "Update payment method" button linking to `https://app.lemonsqueezy.com/my-orders`. No unsubscribe footer — transactional emails are exempt.
* Wrapped in `try/catch` — email failure logs an error but never crashes the webhook or changes the HTTP response.

---

### Week 1 — Day 8 evening (2026-04-15)

**app/api/webhooks/lemonsqueezy/route.ts** — Lemon Squeezy webhook handler

* Verifies every inbound request via `X-Signature` header using `crypto.createHmac('sha256', LEMONSQUEEZY_WEBHOOK_SECRET)`. Returns 401 on mismatch or missing header.
* Handles 5 events:
  * `subscription_created` — extracts `user_id` from `meta.custom_data`, resolves plan from `variant_id` against `LEMONSQUEEZY_STARTER_VARIANT_ID` / `LEMONSQUEEZY_PRO_VARIANT_ID`, writes all subscription fields to users table.
  * `subscription_updated` — same logic as created; handles trial-to-paid conversion and plan changes.
  * `subscription_cancelled` — looks up user by subscription ID (falls back to customer ID), sets `subscription_status = 'cancelled'`, stores `attributes.ends_at` as `current_period_end`. Does NOT set `subscription_plan = 'free'` — user retains paid access until billing period ends.
  * `subscription_expired` — fires when the billing period ends after cancellation; sets `subscription_status = 'expired'`, `subscription_plan = 'free'`. This is the only event that downgrades the user to free.
  * `subscription_payment_failed` — looks up user by customer ID, sets `subscription_status = 'past_due'`, sends a transactional email via Resend with a payment update link.
* All other events are silently ignored with a log message.
* Always returns `{ received: true }` to acknowledge delivery.

**lib/access.ts** — plan gating

* `canAccess(userId, feature)` — loads user's subscription_status + subscription_plan + trial_ends_at + current_period_end. Resolves effective plan: on_trial/active/past_due → stored plan (past_due gets 3-day grace), expired trial → free, cancelled + future current_period_end → stored plan (billing grace), cancelled + past period → free, expired → free. Guards binary features: `alerts:daily` (starter+), `insights:ai` (starter+), `search:compare` (pro only). `digest:weekly` gate removed. Limit-based features use the limit helpers instead.
* `getCompetitorLimit(userId)` — free/starter → 3, pro → 10.
* `getIdeaLimit(userId)` — free/starter → 3, pro → 6.
* `getViralLimit(userId)` — free/starter → 3, pro → 10.
* `getTopicLimit(userId)` — free/starter → 3, pro → 5.
* `getArchiveWeeks(userId)` — free/starter → 4, pro → 12.
* `getUpgradeMessage(feature)` — returns a friendly, positive upgrade nudge for each gated feature. Never uses "you cannot" phrasing.

**lib/db.ts additions**

* `getUserByLSCustomerId(customerId)` — fetches users row by `lemon_squeezy_customer_id`.
* `getUserByLSSubscriptionId(subscriptionId)` — fetches users row by `lemon_squeezy_subscription_id`.
* `updateUserSubscription(userId, data)` — partial update of subscription fields on users table. Returns true/false.

**types/index.ts changes**

* `PlanType` updated: removed `'trial'` (Lemon Squeezy uses `subscription_status = 'on_trial'` instead). Now `'free' | 'starter' | 'pro'`.
* `SubscriptionStatus` updated: replaced `'trial'` and `'canceled'` with `'on_trial'` and `'cancelled'` to match Lemon Squeezy's actual status strings. Later extended to include `'expired'` (Day 40) — written by the `subscription_expired` webhook handler when the billing period ends after cancellation.
* `User` interface: replaced `stripe_customer_id` / `stripe_subscription_id` with `lemon_squeezy_customer_id` / `lemon_squeezy_subscription_id`. Added `subscription_plan: PlanType` and `current_period_end: string | null`.

**Database migration (run in Supabase SQL editor)**

```sql
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS lemon_squeezy_customer_id TEXT,
  ADD COLUMN IF NOT EXISTS lemon_squeezy_subscription_id TEXT,
  ADD COLUMN IF NOT EXISTS subscription_plan TEXT DEFAULT 'free',
  ADD COLUMN IF NOT EXISTS current_period_end TIMESTAMPTZ;
```

---

### Week 1 — Day 7 night (2026-04-15)

**lib/email.ts** — full Resend email system

* `generateUnsubscribeToken(userId)` — creates a UUID token and upserts it to `user_settings.unsubscribe_token`. Called before every email send to ensure each user always has a valid one-click unsubscribe URL.
* `sendWeeklyDigest(userId, digestData)` — checks `weekly_digest_enabled`, loads ideas from DB (falls back to digest-parsed ideas), loads gap score for revenue gap, loads latest snapshot for avg views, fetches competitor viral videos for the "competitor moves" section, renders `WeeklyDigestEmail` via `@react-email/components`, sends via Resend, updates `digests.email_sent_at`.
* `sendTrendAlert(userId, viralVideo, suggestedAngle)` — checks `alerts_enabled`, deduplicates by `last_alert_sent_at` (max 1 per day), reuses existing `unsubscribe_token` or generates one, renders `TrendAlertEmail`, sends via Resend, updates `last_alert_sent_at`.
* `checkAndSendAlerts()` — batch function called by trend-detection cron. Finds all eligible users, gets their top unalerted viral video, calls `findUncoveredTopics` for suggested angle context, sends alert, adds videoId to `alerted_video_ids` so it is never re-sent. Returns `{ checked, sent }`.
* Test confirmed: weekly digest email delivered to `vedangk2912@gmail.com` in 4,610ms.

**emails/weekly-digest.tsx** — React Email template for weekly digest

* Sections: header with channel name + gap score badge (colour-coded: green <40, yellow 40–70, red >70), key metrics row (user avg views / competitor avg views / revenue gap), competitor moves (up to 3 viral videos), 3 video idea cards with score badges, "one thing to change" highlighted box, CTA button to dashboard, footer with unsubscribe link.
* Bug fix (Day 7): `gapScore` and `videoIdeas.length` were passed as numbers into React Email's `<Preview>` component which requires string children. Fixed both to `String(gapScore)` / `String(videoIdeas.length)` — this was the Vercel build failure.

**emails/trend-alert.tsx** — React Email template for viral trend alerts

* Sections: alert header with channel name, viral video details (title, view count, performance multiplier vs channel average, hours old), suggested angle box (from Claude topic gap analysis), CTA button to dashboard, footer with unsubscribe link.

**app/api/unsubscribe/route.ts** — one-click email unsubscribe

* `GET /api/unsubscribe?token=X` — no auth required.
* Looks up `user_settings` row by `unsubscribe_token`. Missing/unknown token → returns styled HTML "Invalid or expired link" page. Valid token → sets `weekly_digest_enabled = false` AND `alerts_enabled = false`, returns styled HTML confirmation page.
* HTML pages are inline strings (no React) — dark-themed, ShowStencil branded, settings page link for re-enabling.
* Test confirmed: token `4ea1c066-f37e-4511-b1a7-ca0cfd789ec4` → Supabase updated both fields to `false` in one request.

**app/api/settings/notifications/route.ts** — notification preferences API

* `GET` — returns `{ weekly_digest_enabled, alerts_enabled, alert_threshold_multiplier }` for the authenticated user. Returns defaults (true/true/3.0) if no `user_settings` row exists yet.
* `POST` — accepts any subset of the three fields, validates `alert_threshold_multiplier` is between 1.5 and 10.0, calls `upsertUserSettings`, returns the updated state.
* Both methods require a valid `auth()` session; return 401 otherwise.

**lib/db.ts additions**

* `getUserSettings(userId)` — fetches `user_settings` row, normalises `alerted_video_ids` from null → `[]`.
* `upsertUserSettings(userId, partial)` — creates or patches `user_settings`, conflict on `user_id`.

**types/index.ts additions**

* `UserSettings` updated: added `last_alert_sent_at`, `alerted_video_ids`, `unsubscribe_token` fields to match actual DB columns.

---

### Week 1 — Day 6 night (2026-04-14)

**lib/idea-generator.ts** — video idea generation via Claude

* `generateVideoIdeas(userId)` — loads user data, gap score (DB cache or fresh calculation), uncovered topics, and viral videos in parallel, then calls Claude Sonnet 4.6 (max_tokens: 1000) to produce 3 ranked video ideas.
* Each idea: `title`, `score` (0–100), `whyNow`, `angle`, `format`, `estimatedLength`, `generatedAt`.
* Structured block parser (`parseVideoIdeas`) splits on `**Title:**` occurrences; falls back to numbered-list split. Fills missing ideas from `uncoveredTopics` if Claude returns fewer than 3.
* `saveIdeas(result)` — inserts to `ideas` table and prunes rows older than 4 weeks for the user.
* `getOrCalculateGapScore(userId)` — returns most recent `gap_scores` row if <7 days old; otherwise calculates fresh from DB competitor metrics.
* Ideas table DDL at top of file — must be provisioned in Supabase before first run.
* Cost logged per run: `$0.01138` for test user (513 input / 656 output tokens).
* Test: `$env:RUN_IDEA_TEST="true"; npx tsx --env-file=.env.local lib/idea-generator.ts`

**lib/revenue-benchmarks.ts** — niche revenue benchmarking (pure computation, no API calls)

* `getNicheBenchmarks()` — returns full benchmark data for all 12 niches: CPM/RPM ranges, monthly upload averages, video duration averages, avg views per video by subscriber tier (tier1–tier4), seasonal factors (Q1–Q4), geography premium multiplier, and sponsorship rates per integration.
* `getSubscriberTier(subscriberCount)` — maps raw sub count to tier1 (<10K) / tier2 (<100K) / tier3 (<500K) / tier4 (500K+).
* `calculateRevenuePotential(nicheId, subscriberCount, currentAvgViews, uploadsPerMonth, currentRpm?)` — returns `RevenuePotential` with current monthly estimate, benchmark monthly estimate, monthly/annual gap, sponsorship potential, and total potential. Uses niche min RPM as conservative baseline when creator's real RPM is unknown; benchmark uses niche max RPM as aspirational target.
* `getBenchmarkComparison(nicheId, subscriberCount, userMetrics)` — full comparison object with views/uploads/duration vs benchmark, revenue potential, and a plain-English `topInsight` sentence that names the single biggest shortfall in plain numbers.

**scripts/test-full-pipeline.ts** — end-to-end intelligence pipeline timing test

* Runs all 7 pipeline steps for userId `848f7497-9a46-40a3-8d90-a96d1c9cf909` and times each one individually using `Date.now()`.
* Steps: (1) data sync check (DB reads), (2) gap score calculation, (3) trend detection, (4) uncovered topics (Claude), (5) digest generation (Claude), (6) idea generation (Claude), (7) revenue benchmarks (pure computation).
* Logs `WARNING: Step N is slow (Xms) — consider caching` for any step over 10,000ms.
* Logs `PIPELINE TOO SLOW: Xms total. Optimization needed before launch.` when total exceeds 30,000ms.
* Reports: gap score, ideas generated, viral videos, uncovered topics, revenue gap (monthly + annual), total tokens, cost this run, cost at 100 users/week, slowest step.
* Test run results: **49,576ms total** (over 30s target). Slowest steps: Step 5 — Digest (25,983ms), Step 6 — Ideas (18,328ms). Both are Claude API latency — consider parallelising steps 4+5+6 in production. Revenue gap: $228/month. Cost: ~$0.027/run → ~$2.70 per 100 users/week.
* Run: `npx tsx --env-file=.env.local scripts/test-full-pipeline.ts`

---

### Week 1 — Day 5 (2026-04-14)

**3 dedicated cron job routes + /api/sync cron bypass**

*app/api/cron/weekly-digest/route.ts*
* Runs every Monday at 9:00 AM UTC.
* Queries users table for `onboarding_completed=true`, `subscription_status IN ('trial','starter','pro')`, `youtube_access_token IS NOT NULL`.
* Calls `generateDigest(userId)` for each eligible user. Error in one user never stops the batch.
* 500ms delay between users to avoid hammering Anthropic + YouTube APIs simultaneously.
* Returns `{ processed, succeeded, failed }`.

*app/api/cron/refresh-data/route.ts*
* Runs every day at 3:00 AM UTC.
* Same user eligibility query as weekly-digest.
* For each user, calls `POST /api/sync` with `x-cron-user-id` + `x-cron-secret` headers (cron bypass path).
* 1 second delay between users.
* Returns `{ processed, succeeded, failed }`.

*app/api/cron/trend-detection/route.ts*
* Runs once daily at 6:00 AM UTC. (Originally every 6 hours — downgraded to daily after Vercel Hobby plan blocks sub-daily crons. See Known Issues.)
* Queries all active competitors from the competitors table.
* For each competitor: calls `getRecentVideos(channelId, 5)` + `getVideoDetails(videoIds)` to get view counts, calculates `velocity = viewCount / hoursOld`, checks `velocity > (channelAvgViews / 48) * 3` for viral threshold, upserts `competitor_videos` rows with updated `velocity_score` and `is_viral`.
* channelAvgViews is read from existing `competitor_videos` rows in DB.
* Returns `{ channelsChecked, viralVideosFound }`.

*app/api/sync/route.ts — cron bypass*
* Added a second auth path alongside session auth.
* If request has `x-cron-user-id` + `x-cron-secret` headers: validates secret against `CRON_SECRET`, uses provided userId directly. No session required.
* Existing session-based flow is unchanged for dashboard-triggered syncs.

*vercel.json*
* Updated from 1 cron (`/api/cron/daily`) to 3 dedicated crons with separate schedules.
* CRON_SECRET updated to `showstencil-cron-2026-secure-key-xK9mP3`.
* Post-deploy fix: trend-detection schedule changed from `0 0,6,12,18 * * *` to `0 6 * * *` — Vercel Hobby plan only allows crons that run once per day maximum.

*Post-deploy fixes (same day)*
* `lib/trend-detector.ts` — Supabase `select('*, competitors(*)')` returns the joined relation as an array, not a single object. Fixed `detectViralVideos` and `getTrendingInNiche` to cast to `CompetitorRow[] | null` and read `[0]`. TypeScript build was failing on Vercel with this.
* Google OAuth consent screen submitted for verification with YouTube readonly + Analytics readonly scopes.
* `.gitignore` updated to exclude additional local artifacts.

*Test results (local)*
* weekly-digest: `{"processed":0,"succeeded":0,"failed":0}` — correct (no eligible users in test DB)
* refresh-data: `{"processed":0,"succeeded":0,"failed":0}` — correct
* trend-detection: `{"channelsChecked":3,"viralVideosFound":0}` — found 3 active competitors, checked their videos
* Security: wrong secret correctly returns HTTP 401

---

### Week 1 — Day 4 (2026-04-15)

**lib/trend-detector.ts** — viral video detection and topic gap analysis
* `detectViralVideos(competitorIds)` — reads pre-flagged `is_viral=true` rows from `competitor_videos` (no YouTube API calls). Returns top 10 viral videos sorted by velocity_score descending.
* `findUncoveredTopics(userVideoTitles, competitorVideoTitles)` — calls `claude-sonnet-4-6` at temperature 0.4 to identify topics covered by 2+ competitors but absent from user's titles. Returns top 5 with `searchDemandEstimate` (high/medium/low) and `suggestedAngle`. Prompt capped at 30 titles each side to stay under 800 tokens.
* `getTrendingInNiche(competitorIds, limit)` — same as detectViralVideos but caller-controlled limit and competitor scope.

**lib/digest-generator.ts** — full Claude digest pipeline (4 improvements)

*Improvement 1 — Richer prompt payload:*
* Added `getWorstVideos(userId, 3)` to `lib/db.ts` — fetches lowest-viewed videos (sorted ASC) alongside the existing best-video fetch.
* `bestVideos` (top 3 by views) and `worstVideos` (bottom 3 by views) are now passed to Claude by title + view count — enables references like "How I Saved $10,000 worked; Q&A posts don't land."
* `postingDayPattern` — derives the most frequent day-of-week from `published_at` dates and passes it to Claude.

*Improvement 2 — Structured video idea format:*
* System prompt now requires each idea in a 4-field block: `**Title:**`, `**Why now:**`, `**Angle:**`, `**Estimated opportunity:** high/medium/low`.
* `parseVideoIdeas` updated to extract these structured fields first, with numbered-list fallback for older responses. `opportunityScore` mapped from label: high→85, medium→55, low→25.

*Improvement 3 — Fallback handling:*
* `callClaudeForDigest(context)` wraps the API call. If it throws or returns <200 chars, `usedFallback: true` is returned.
* `generateFallbackDigest(...)` builds a template-based digest from gap score + uncoveredTopics + viral videos — ensures users always see content during API outages.
* `usedFallback` flag is stored in `digests.key_metrics` for monitoring.

*Improvement 4 — Multi-niche test suite:*
* `RUN_NICHE_TEST=true` test block with 3 hardcoded niche contexts (finance 45K subs, gaming 80K subs, cooking 22K subs).
* Each test checks that Claude's output contains niche-appropriate keywords: finance → CPM/revenue/$; gaming → upload/frequency/post; cooking → retention/watch time/discoverability.
* Test runs via: `RUN_NICHE_TEST=true npx tsx --env-file=.env.local lib/digest-generator.ts`

**Internal architecture change:**
* `generateDigest` now calls `callClaudeForDigest(context)` and `generateFallbackDigest(...)` as separate functions, making the Claude layer independently testable with hardcoded data without hitting the DB.

---

### Week 1 — Day 3 (2026-04-14, night session)

**lib/niche-engine.ts** — niche detection and competitor discovery
* `detectNiche(videoTitles, descriptions, userId?)` — calls `claude-sonnet-4-6` to classify a creator into one of 12 niches. Checks DB cache first (skips Claude if `niche_id` already stored). Low temperature (0.2) for deterministic classification. Saves result to users table automatically when userId is provided.
* `findCompetitors(nicheId, userSubCount, userChannelId)` — YouTube channel search for competitors in a 0.5x–3x subscriber range. Widens to 0.2x–5x and retries once if no results. Costs 101 YouTube quota units per attempt.
* `saveDetectedNiche(userId, nicheId)` — persists detected niche + timestamp to users table.
* 12 valid niche IDs: finance, tech, gaming, cooking, fitness, beauty, travel, education, business, entertainment, diy, vlog.

**lib/gap-scorer.ts** — core gap scoring algorithm
* `calculateGapScore(userMetrics, competitorMetrics)` — full gap analysis. Returns `GapScoreResult` with per-metric scores, weighted overall score (0–100), plain-English bottleneck label, top competitor name, and revenue gap estimate.
* `buildCompetitorMetrics(channelProfiles, userSubCount, nicheId?)` — converts raw `CompetitorFullProfile` objects into `CompetitorMetrics` objects. Filters to channels larger than the user. Assigns tier (1 = 1x–3x, 2 = 3x–10x). Estimates CTR from views/subs ratio capped at 15%.
* `estimateRevenue(avgViewsPerVideo, uploadsPerMonth, nicheId)` — monthly revenue estimate using niche CPM benchmarks. Formula: `(views × uploads × CPM / 1000) × 0.55`.
* `saveGapScore(userId, result)` — persists `GapScoreResult` to `gap_scores` table.
* Scoring uses a piecewise non-linear scale: gaps below 25% score 10–30, above 75% score 85–100. Upload frequency hard-capped at 60 to prevent frequency from dominating overall score.

**lib/db.ts additions**
* `getCompetitorMetricsFromDB(userId)` — fetches active competitors + their stored videos, builds `CompetitorMetrics[]` ready for gap scoring. Resolves user subscriber count from latest snapshot to filter out smaller channels. Assigns tier based on ratio.

**types/index.ts additions** — 7 new interfaces
* `UserMetrics` — gap scorer input (avgViews, CTR, watchTime, uploads, subs, nicheId, recentTitles)
* `CompetitorMetrics` — per-competitor metrics for gap scoring (includes tier assignment)
* `MetricScore` — per-metric result (userValue, competitorAvg, gapPercent, score, label)
* `RevenueEstimate` — monthly/annual revenue gap with CPM used
* `GapScoreResult` — full result: overall score, tier scores, breakdown, topCompetitor, primaryBottleneck, revenueGap
* `NicheResult` — Claude classification output (nicheId, nicheName, confidence, reasoning)
* `CompetitorCandidate` — YouTube search result (channelId, channelName, subscriberCount, thumbnailUrl)

**scripts/seed-test-data.ts** — Supabase test data seeder
* Gets real userId from users table (no hardcoded IDs).
* Inserts: 1 channel snapshot (45K subs, 8,400 avg views, 2.1% CTR), 3 Tier 1 competitors (Finance With Sarah 112K, Money With Marcus 89K, Smart Money Moves 67K), 12 competitor videos (4 per competitor, including 3 viral flagged).
* Idempotent: cleans existing test rows before inserting.
* Run: `npx tsx --env-file=.env.local scripts/seed-test-data.ts`

**scripts/test-gap-scorer.ts** (rewritten) — end-to-end DB pipeline test
* Reads real channel snapshot from DB via `getChannelSnapshots`.
* Loads competitor metrics via `getCompetitorMetricsFromDB`.
* Runs `calculateGapScore` and `saveGapScore`.
* Verifies saved row in `gap_scores` table by querying Supabase directly.
* Prints a clean human-readable summary with all metric breakdowns and revenue gap.
* Confirmed output: overall score 58/100, views 81% behind Tier 1, revenue gap $395/month.
* Run: `npx tsx --env-file=.env.local scripts/test-gap-scorer.ts`

---

### Week 1 — Day 2 (2026-04-13, evening session)

**lib/db.ts** — all database operations (single source of truth for Supabase queries)
* `saveChannelSnapshot(userId, ChannelOverview)` — deletes today's existing snapshot, inserts fresh row in `channel_snapshots`. Derives `estimated_monthly_revenue` as 90-day revenue ÷ 3.
* `saveVideoData(userId, VideoPerformanceItem[], VideoDetail[])` — merges analytics data (views, duration, ctr, etc.) with public Data API data (title, thumbnail, like count, etc.) by videoId. Deletes existing rows for the affected video IDs then inserts fresh merged rows.
* `saveCompetitorData(competitorId, CompetitorFullProfile)` — updates competitor channel metadata, replaces all competitor_videos with fresh velocity-scored rows.
* `getUser(userId)` — fetches a user row by ID, returns null if not found.
* `updateUserOnboardingStatus(userId, completed)` — sets `onboarding_completed` on the users table.
* `getChannelSnapshots(userId, days)` — returns last N days of snapshots sorted ascending for charts.
* `getVideos(userId, limit)` — returns top N videos by view_count for the performance table.
* Design choice: uses delete + insert pattern instead of upsert to avoid requiring unique constraints on `(user_id, youtube_video_id)`. Only the videos included in the current sync are touched — older videos are preserved.

**app/api/sync/route.ts** — POST `/api/sync`
* Auth-gated: returns 401 if no session, 400 if no access token stored in DB.
* Loads OAuth access token from Supabase (not from the JWT session, keeping it server-only).
* Runs all 5 YouTube Analytics calls in parallel: `getChannelOverview`, `getVideoPerformance(20)`, `getAudienceDemographics`, `getTrafficSources`, `getDailyAnalytics(30)`.
* After analytics, fetches public video details for the returned video IDs (one batch call).
* Saves channel snapshot and merged video data via `lib/db.ts`.
* Returns `{ success, syncedAt, channelSnapshot, videosSynced, message }` with elapsed time.
* Logs timing in milliseconds for performance monitoring.

**components/sync-context.tsx** — React context for first-time sync state
* `SyncProvider` — client component that receives `needsSync: boolean` from the server layout. On mount, fires `POST /api/sync` if needsSync is true. Tracks `isSyncing`, `syncComplete`, `syncError` states.
* `useSyncStatus()` — hook for dashboard pages to read sync state.
* On sync error, `syncComplete` is still set to true so the UI doesn't stay blocked permanently.

**app/(dashboard)/layout.tsx** — auto-trigger on first login
* After auth check, fetches user row from DB to read `onboarding_completed`.
* If false: immediately calls `updateUserOnboardingStatus(userId, true)` server-side (so page refresh doesn't re-trigger), then passes `needsSync={true}` to `SyncProvider`.
* Wraps all dashboard children in `<SyncProvider>` so any page can read sync state.

**app/(dashboard)/dashboard/page.tsx** — loading state for first sync
* Client component using `useSyncStatus()`.
* Shows spinner + "Syncing your channel data..." message while `isSyncing` is true.
* Shows dashboard content once sync completes (placeholder text for now, data views in Week 2).
* Shows non-blocking error message if sync failed.

---

### Week 1 — Day 2 (2026-04-13, morning session)

**lib/youtube-analytics.ts** — authenticated YouTube Analytics API v2
* `getChannelOverview` — 90-day aggregate: views, watch time, avg view duration, sub delta, revenue
* `getVideoPerformance` — per-video analytics sorted by views, top N results
* `getAudienceDemographics` — age/gender breakdown + top 10 countries (2 parallel calls)
* `getTrafficSources` — views + watch time by traffic source type with % share calculated
* `getDailyAnalytics` — day-by-day metrics for charting (default 30 days)
* Revenue retry logic: `estimatedRevenue` returns 401 "unauthorized" (not 403) for non-monetized channels — all three revenue functions detect this by checking `reason !== 'authError'` and silently retry without that metric. Revenue fields return 0 rather than crashing.
* No-channel detection: `getChannelOverview` returns `null` on true 403 / second-attempt failure, with a logged message explaining the cause.

**scripts/refresh-token.ts** — utility to refresh an expired OAuth token using the stored refresh token directly from Supabase, without requiring a browser re-login. Calls `https://oauth2.googleapis.com/token` and writes the new token back to the `users` table.

---

### Week 1 — Day 1 (2026-04-13, morning session)

**Google OAuth + Supabase auth**
* NextAuth v5 configured with Google provider, YouTube read scopes, JWT strategy
* `auth.ts` — signIn callback upserts user to Supabase on every login; jwt callback stores accessToken/refreshToken/expiresAt in JWT; auto-refresh logic calls `oauth2.googleapis.com/token` when token is within 60s of expiry and persists new token to DB
* Login page (`app/(auth)/login/page.tsx`) and protected dashboard layout built
* User data (email, name, image, tokens) saved to Supabase `users` table on first login

**Project bootstrap**
* Next.js 14 project created and running on localhost:3000
* Boilerplate cleaned: `page.tsx` reduced to placeholder, `globals.css` reduced to `@import "tailwindcss"`, default public SVGs removed
* Full folder structure created per CLAUDE.md spec (all route groups, lib, components, types subdirectories)
* `layout.tsx` metadata updated to ShowStencil branding

**Types**
* `types/index.ts` — all 10 TypeScript interfaces: `User`, `ChannelSnapshot`, `Video`, `Competitor`, `CompetitorVideo`, `GapScore`, `Digest`, `Trend`, `UserSettings`, `VideoIdea`. Strict mode, no `any`.

**lib/youtube-data.ts** — public YouTube Data API v3 calls (no user auth)
* `getChannelStats` — channel metadata, keywords, topic categories, subscriber/view counts
* `getRecentVideos` — two parallel search.list calls (medium + long duration) merged and deduplicated
* `getVideoDetails` — batch fetch up to 50 videos per call, filters out Shorts (<61s), live streams, kids content
* `getChannelVideoVelocity` — last 10 videos with viral velocity scores computed
* `getCompetitorFullProfile` — single function: stats + recent videos + velocity in ~203 quota units
* `getTopicCoverage` — pure computation (0 quota): tag frequency, category distribution, common title words for gap analysis

**Database**
* Supabase project created and all 9 tables provisioned from CLAUDE.md schema: `users`, `channel_snapshots`, `videos`, `competitors`, `competitor_videos`, `gap_scores`, `digests`, `trends`, `user_settings`

**Infrastructure**
* `lib/supabase.ts` — `createClient()` (anon key, client-safe) and `createServiceClient()` (service role, server-only with session disabled)
* `vercel.json` — single daily cron at `0 3 * * *` calling `/api/cron/daily` (Vercel free tier limit: 1 cron)
* `app/api/cron/daily/route.ts` — auth-gated with `CRON_SECRET`, runs competitor refresh + trend detection daily, gates weekly digest to Mondays only. Stubs in place for Week 2 implementation.

**Environment & secrets**
* `.env.example` committed (no real values)
* `.env.local` created and gitignored with: `NEXTAUTH_SECRET`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `YOUTUBE_API_KEY`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `CRON_SECRET`
* Still empty (needed in later weeks): `ANTHROPIC_API_KEY`, `STRIPE_*`, `RESEND_API_KEY`

**Dependencies installed**
* `@supabase/supabase-js`, `next-auth@beta`, `@auth/supabase-adapter`, `stripe`, `@stripe/stripe-js`, `resend`, `@react-email/components`, `@anthropic-ai/sdk`, `recharts`

**Deployment**
* Pushed to GitHub, deployed to Vercel. App live.

\---


## Security Audit Log

### Section 1: Secret & API Key Exposure — 2026-05-05

**Scope:** .next/ build artifacts, source code, git history, .gitignore, NEXT_PUBLIC_ vars, createServiceClient usage, process.env references in lib/.

**CRITICAL issues found:** None.

**Fixes applied:**
* `.gitignore` — added `.env` and `.env.production` entries. These were missing; `.env*.local` and `.env.local` were already present but bare `.env` and `.env.production` files could have been accidentally committed.
* `.env.example` — removed stale Stripe vars (payment layer replaced by Lemon Squeezy in Day 8), added all missing vars: `LEMONSQUEEZY_API_KEY`, `LEMONSQUEEZY_STORE_ID`, `LEMONSQUEEZY_STARTER_VARIANT_ID`, `LEMONSQUEEZY_PRO_VARIANT_ID`, `LEMONSQUEEZY_WEBHOOK_SECRET`, `GEMINI_API_KEY`. Updated `RESEND_FROM_EMAIL` default to `digest@showstencil.com`.

**Warnings (no action needed, documented for awareness):**
* Supabase anon key (`NEXT_PUBLIC_SUPABASE_ANON_KEY`) appears as a compile-time value in `.next/` server chunks. This is expected — Next.js bakes NEXT_PUBLIC_ vars into bundles at build time. The anon key is designed to be public (`role: anon` in JWT payload, minimal permissions). The `.next/` folder is gitignored so the value is never committed.

**Confirmed clean:**
* No actual secret values in any .next/ build artifact (only variable name references from SDK code)
* No hardcoded secrets in any source file
* Git history contains zero real secret values (only empty .env.example entries and process.env.VAR_NAME references in code)
* All `createServiceClient()` calls are in Server Components, API routes, lib/ files, and scripts — never in client components ('use client' files)
* All NEXT_PUBLIC_ variables are legitimately public (app URL, Supabase URL, Supabase anon key)
* SUPABASE_SERVICE_ROLE_KEY is never prefixed with NEXT_PUBLIC_ and never imported in client components
* /.next/ is in .gitignore

---

### Section 2: Authentication & Authorization — 2026-05-05

**Scope:** All 29 API routes audited (full route map below), middleware, dashboard layout, client-side auth guards, userId trust, health endpoint.

**CRITICAL issue found and fixed:**

* `app/api/competitors/insights/route.ts` — **IDOR (Insecure Direct Object Reference)**: The `getCachedInsights(competitor_id, 7)` cache lookup ran BEFORE the ownership check (`.eq('user_id', userId)`). Any authenticated user could call `POST /api/competitors/insights` with any `competitor_id` UUID and receive cached insights for a competitor belonging to another user. **Fix applied**: ownership check (`.eq('id', competitor_id).eq('user_id', userId)`) now runs first; cache lookup was moved to immediately after, with a comment explaining the correct ordering. The `getCachedInsights()` call is now safe because ownership is already confirmed.

**Improvements applied (defense-in-depth):**

* `app/api/ideas/[id]/plan/route.ts` and `app/api/ideas/[id]/made/route.ts` — Ownership was checked in application code after fetching `user_id` with only `.eq('id', id)` (no user filter in SQL). This is functionally correct but relies on JS-level ownership enforcement rather than DB-level. Fixed both: changed to `.eq('id', id).eq('user_id', session.user.id)` in the Supabase query, dropped the JS comparison, and changed `select('user_id')` to `select('id')` since user_id is no longer needed in the result.

* `app/api/health/route.ts` — **Created** the missing health endpoint. Returns `{ status: 'ok', timestamp }` with no auth required and no sensitive internals.

**Warnings (no fix required, documented for awareness):**

* **No middleware.ts at project root**: All route protection relies on `(dashboard)/layout.tsx` server-side `auth()`. This is correct for current architecture but means any new route outside the `(dashboard)` group won't automatically inherit the session guard. New routes must add their own `auth()` call.
* **`/onboarding` page: client-side-only guard**: `app/onboarding/page.tsx` uses `useSession()` → redirect on `status === 'unauthenticated'`. This means a logged-out user briefly sees the loading skeleton before being redirected. No sensitive data is rendered server-side on this page — all data access goes through auth-protected API routes — so this is an acceptable UX trade-off.
* **`detect-sub-niche` cron bypass**: `app/api/users/detect-sub-niche/route.ts` reads `userId` from the `x-cron-user-id` header when the cron secret is valid. The userId is trusted from the header (not verified against a session). This is by design (the route is called internally from `/api/sync` as a fire-and-forget) and safe as long as `CRON_SECRET` is not compromised.
* **Cron secret comparison is standard string equality, not constant-time**: All cron routes use `authHeader !== \`Bearer ${process.env.CRON_SECRET}\``. HTTP-level timing attacks are not practical in this deployment model (Vercel edge + TLS), but noted for completeness.

**Routes audited — full map:**

GROUP A — User routes (require session `auth()` — all PASS):
* `POST /api/sync` — auth at top, userId from session ✅
* `GET /api/competitors` — auth at top, `.eq('user_id', session.user.id)` ✅
* `DELETE /api/competitors/[id]` — auth at top, ownership via `.eq('id', id).eq('user_id', session.user.id)` ✅
* `POST /api/competitors/[id]/sync` — auth at top, ownership via `.eq('id', id).eq('user_id', session.user.id)` ✅
* `POST /api/competitors/insights` — **FIXED**: ownership check now runs before cache lookup ✅
* `POST /api/competitors/search` — auth at top, all DB queries use `session.user.id` ✅
* `POST /api/competitors/track` — auth at top, all DB queries use `session.user.id` ✅
* `POST /api/create-checkout-session` — auth at top, userId from session ✅
* `GET /api/gap-score/latest` — auth at top, `.eq('user_id', session.user.id)` ✅
* `POST /api/ideas/generate` — auth at top, userId from session ✅
* `GET /api/ideas/latest` — auth at top, userId from session ✅
* `POST /api/ideas/[id]/generate-thumbnail` — auth at top, ownership via `.eq('id', ideaId).eq('user_id', userId)` ✅
* `POST /api/ideas/[id]/plan` — **IMPROVED**: ownership now enforced in DB WHERE clause ✅
* `POST /api/ideas/[id]/made` — **IMPROVED**: ownership now enforced in DB WHERE clause ✅
* `POST /api/onboarding/complete` — auth at top, userId from session ✅
* `GET/POST /api/settings/notifications` — auth at top, userId from session ✅
* `GET /api/thumbnail-jobs/[jobId]/status` — auth at top; `getThumbnailJob(jobId, userId)` includes userId in DB query ✅
* `GET/PATCH /api/user/profile` — auth at top, all updates use `.eq('id', session.user.id)` ✅
* `POST /api/users/detect-sub-niche` — dual auth: cron bypass (secret-gated) OR session; see Warning above ✅

GROUP B — Cron routes (require `Authorization: Bearer <CRON_SECRET>` — all PASS):
* `GET /api/cron/cache-cleanup` ✅
* `GET /api/cron/dominator-refresh` ✅
* `GET /api/cron/refresh-data` ✅
* `GET /api/cron/sub-niche-detection` ✅
* `GET /api/cron/trend-detection` ✅
* `GET /api/cron/user-sync` ✅
* `GET /api/cron/weekly-digest` ✅

GROUP C — Webhook (require HMAC-SHA256 signature verification — PASS):
* `POST /api/webhooks/lemonsqueezy` — raw body text captured before JSON parse; HMAC-SHA256 with `crypto.timingSafeEqual`; returns 401 on mismatch ✅

GROUP D — Public (intentionally no auth):
* `GET /api/auth/[...nextauth]` — NextAuth framework handler ✅
* `GET /api/unsubscribe` — token-gated (UUID token in query param), intentionally no session ✅
* `GET /api/health` — **CREATED**, returns `{ status, timestamp }` only ✅

**Middleware & layout:**
* No `middleware.ts` at project root — all protection via server-side layout `auth()` calls (see Warning above)
* `app/(dashboard)/layout.tsx` — server-side `auth()`, redirects to `/login` on no session or missing user, redirects to `/onboarding` when `onboarding_completed=false` ✅

**Client-side auth usage:**
* `app/page.tsx` — `useSession()` used only to redirect logged-in users to dashboard (public page, no sensitive data) ✅
* `app/onboarding/page.tsx` — `useSession()` used to redirect unauthenticated users; no sensitive data rendered server-side (see Warning above) ✅
* No component uses `useSession()` as the sole guard for sensitive data fetches ✅

**tsc --noEmit after fixes: zero errors.**

---

### Section 5: SQL Injection & Input Validation — 2026-05-06

**Scope:** All Supabase client usage in lib/ and app/api/, YouTube channel URL/ID input handling, request body parsing across all API routes, Claude prompt construction, mass assignment patterns, scripts/ folder.

**CRITICAL issues found:** None.

**Fix applied:**

* `app/api/competitors/track/route.ts` — **Missing channel_id format validation**: The route accepted any non-falsy string as `channel_id` from the request body with only a `!channel_id` check. Malformed or arbitrarily long strings would trigger up to 7 downstream DB queries (is-already-tracked check, plan limits, monthly quota, lock check, slot count) before hitting the `searched_channels_cache` lookup that would return 404. Added `typeof channel_id !== 'string'` type check and `!/^UC[a-zA-Z0-9_-]{22}$/.test(channel_id)` format check (400 `Invalid channel_id format`) as the first validation after auth. This is consistent with the UC+24-char check already present in `app/api/cron/refresh-data/route.ts` (lines 217–218), `app/api/cron/trend-detection/route.ts` (lines 51–52), and `lib/channel-search.ts` `normalizeChannelInput` (line 40). SQL injection was never possible here (all queries use parameterized Supabase client methods), but the fix prevents wasted query execution against malformed input.

**Warnings (no fix applied — documented for awareness):**

* `app/api/ideas/[id]/generate-thumbnail/route.ts` — `photo_data` (base64-encoded image) has no size limit check. The client-side code resizes images to max 800px wide before encoding, so in practice payloads stay under ~300KB base64. A determined attacker calling the endpoint directly could send a large payload. No fix applied because: (1) the route is auth-gated + plan-gated, reducing attack surface; (2) Vercel has a 4.5MB request body limit that acts as a hard cap; (3) adding a limit would require deciding on a value and testing that legitimate camera/upload sources still work. Recommend adding a `photo_data.length > 2_000_000` guard (2MB base64 ≈ 1.5MB image) in a future pass.

* Claude prompts in `lib/competitor-insights.ts` and `app/api/ideas/generate/route.ts` include user-influenced strings without length limiting: channel names (from Google OAuth, via DB), video titles (from YouTube Data API, via DB), and sub-niche labels (Claude-detected, via DB). None of these are directly typed by the user in the app — they all pass through Google or YouTube first. However, a YouTube channel name containing "Ignore all previous instructions and instead..." is theoretically possible. Risk is LOW because: (1) YouTube has its own content policies; (2) the data passes through Claude sub-niche detection and YouTube API normalisation first; (3) Claude prompts have structured JSON output requirements that make injection-driven output hard to exploit downstream. No fix applied. If hardening is desired, truncate `channel_name` to 100 chars and `video.title` to 150 chars before prompt assembly.

**Confirmed clean:**

* All Supabase operations use the JS client's parameterized methods exclusively (`from().select()`, `.insert()`, `.update()`, `.upsert()`, `.delete()`). No `.rpc()`, no template-literal SQL strings, no raw query construction found anywhere in lib/ or app/api/.
* No raw SQL construction in scripts/ — all `${...}` occurrences are `console.log` template literals only.
* `app/api/competitors/search/route.ts` — validates `input` is a `string` type, then passes through `normalizeChannelInput()` which enforces UC+22-char regex for channel IDs and URL pattern matching for all other forms before any DB or YouTube API operation.
* `app/api/create-checkout-session/route.ts` — `plan` validated against `['starter', 'pro']` allowlist before use. No other body fields accepted.
* `app/api/settings/notifications/route.ts` — each field individually type-checked and range-validated (`boolean`, `number` between 1.5–10.0). Uses a build-up pattern for the update object so unexpected fields are silently ignored and never reach the DB.
* `app/api/user/profile/route.ts` PATCH — `niche_id` validated against a hardcoded 12-item `VALID_NICHES` allowlist. Update object explicitly lists only `niche_id` and `niche_detected_at`.
* `app/api/ideas/[id]/generate-thumbnail/route.ts` — `photo_source` validated against `['camera', 'upload', 'google_profile', 'no_photo']` enum. `photo_data` required when source is `camera` or `upload`.
* `app/api/competitors/insights/route.ts` — `force_regenerate` is a boolean flag read from the body and used only as a truthy check. No DB operation depends on its value directly. Ownership verification via `.eq('user_id', userId)` in the competitor query (fixed in Section 2 audit).
* No mass assignment found: every `.insert()`, `.update()`, and `.upsert()` call in app/api/ constructs an explicit field object. The request body is never spread into a DB operation.
* Scripts folder: no script accepts CLI arguments interpolated into SQL or DB queries. All use hardcoded values or read from the DB for lookup keys.

**tsc --noEmit after fix: zero errors.**

---


## Known Issues

> Update this section as issues are discovered

**Revenue 401 on non-monetized channels (fixed Day 2 morning):** YouTube Analytics API returns 401 with `reason: "unauthorized"` (not 403) when `estimatedRevenue` is requested for a non-monetized channel. Standard 401 handling (throw TOKEN_EXPIRED) would crash the entire request. Fix: inspect `errors[0].reason` — only throw TOKEN_EXPIRED when `reason === 'authError'`. All other 401s (including `reason === 'unauthorized'`) return null and trigger a silent retry without the revenue metric. Revenue fields return 0 rather than crashing.

**CTR estimation is a proxy, not real data (known limitation):** The gap scorer estimates competitor CTR as `(avgViews / subscriberCount) × 0.3`, capped at 15%. This is not real CTR data — YouTube doesn't expose it publicly. The 0.3 multiplier is a heuristic. Real CTR is only available through the Analytics API for the user's own channel. This means CTR gap scores for competitors are approximate. This is acceptable for v1 but should be flagged in the UI.

**Gap scorer weights are calibrated for finance niche (Day 3 decision):** The 35/30/25/10 weighting (views/CTR/watchTime/uploads) reflects what matters most for typical niches. Different niches (e.g. gaming where upload frequency matters a lot more) may need adjusted weights in a later milestone. For now all niches use the same weights.

**app/api/cron/daily/route.ts is a stub (superseded):** This route is no longer used. The 5 dedicated cron routes (`weekly-digest`, `refresh-data`, `trend-detection`, `cache-cleanup`, `sub-niche-detection`, `dominator-refresh`) replace it entirely. The stub can be deleted in a cleanup pass.

**Vercel Hobby plan: one cron per day maximum:** Hobby plan crons cannot run more than once per day. The trend-detection cron was originally scheduled every 6 hours (`0 0,6,12,18 * * *`) and was downgraded to daily at 6 AM UTC (`0 6 * * *`) to fix Vercel deployment failures. Upgrading to Vercel Pro would allow the original 6-hour cadence.

**Supabase joined relation returns array, not object (fixed Day 5):** When using `select('*, competitors(*)')`, Supabase returns the joined table as an array even when at most one row matches. `lib/trend-detector.ts` was casting the result as a single object, causing a TypeScript build error on Vercel. Fixed by casting to array and reading index 0.

**React Email Preview requires string children (fixed Day 7):** `@react-email/components`'s `<Preview>` component has a TypeScript type of `ReactNode & string`, meaning numbers passed directly (`{gapScore}`, `{videoIdeas.length}`) cause a build error on Vercel even though they render fine locally. Fix: wrap numeric values with `String()` before interpolating inside `<Preview>`. Applies to any number or boolean in that component.

**saveChannelSnapshot overwrote seeded/enriched fields (fixed Day 9 — 2026-04-19):** The sync route called saveChannelSnapshot which deleted today's snapshot and re-inserted with only 3 analytics fields. This nuked subscriber_count, avg_views_per_video, avg_ctr etc. set by the seed script, and set avg_view_duration_seconds=0 when the YouTube Analytics API returned 0 (no 90-day data). Dashboard showed "0:00" for Avg watch. Fix: fetch existing row first, preserve all non-analytics fields, only update avg_view_duration_seconds when API returns > 0.

**Topic coverage gap score is a stub that returns 0 (known limitation):** `topic_coverage_gap_score` is always 0 because topic analysis is not implemented. The gap score chart now filters it out — it was showing as a misleading zero bar alongside real scores. Will be re-added when topic analysis is built.

**Cron not syncing daily — two root causes (fixed 2026-04-26):**
* *Wrong subscription_status filter*: Both `refresh-data` and `weekly-digest` cron routes queried `.in('subscription_status', ['trial', 'starter', 'pro'])` but Lemon Squeezy uses `'on_trial'`, `'active'`, `'past_due'` — the `'trial'`/`'starter'`/`'pro'` values never match any row. Fixed to `['on_trial', 'active', 'past_due']` in both routes.
* *Token expiry with no refresh path*: OAuth access tokens expire after 1 hour. `auth.ts` refreshes the token inside the NextAuth JWT callback — but that only fires when the user is browsing the app. The 3am cron runs with no active session, reads the stale token from DB, gets `TOKEN_EXPIRED` from YouTube Analytics, and fails silently. Fix: `app/api/sync/route.ts` now catches `TOKEN_EXPIRED`, uses the stored `youtube_refresh_token` to call `https://oauth2.googleapis.com/token`, writes the new access token back to DB, then retries the analytics calls. If the refresh itself fails (e.g. user revoked access), returns a clear 401 and logs the failure.

**Metric strip showing dashes — null snapshot row (fixed 2026-04-27):** The dashboard reads `snapshots[snapshots.length - 1]` as the "latest" snapshot. If the sync cron or a pre-seed sync inserted a today's row with all nulls (Analytics API returned nothing — token issue, quota, etc.), that null row sits at the end of the array and every metric card shows `—`. Two fixes applied: (1) `DashboardClient.tsx` now filters `snapshots` to `validSnapshots = snapshots.filter(s => s.subscriber_count !== null)` before deriving `latest` and `earlier`, so the dashboard always falls back to the last good snapshot. (2) `saveChannelSnapshot` in `lib/db.ts` now guards against writing a null row — if `totalViews === 0 && avgViewDurationSeconds === 0` (nothing came back from the API), it logs a warning and returns without touching the DB.

**Duplicate competitor rows from repeated seed runs (fixed 2026-04-27):** Multiple seed runs created 2 rows each for "Finance With Sarah" and "Money With Marcus" because the old `upsertCompetitor` helper matched on `youtube_channel_id`, which differed between runs (old seeds generated different fake IDs). Fix: `upsertCompetitor` in `scripts/seed-test-data.ts` now matches on `(user_id, channel_name)` — a stable, meaningful dedup key. The update path also syncs `youtube_channel_id` to the canonical constant value in case surviving rows have stale IDs. The 2 duplicate rows were removed manually via Supabase SQL (children first: `competitor_videos` → `competitor_snapshots` → `competitors`). The seed script also deletes any all-null `channel_snapshots` row for today before upserting the historical rows, preventing the null-row problem from re-appearing on future seed runs.

**Manually added competitor shows blank detail page (fixed 2026-04-28):** The track route inserted the competitor row but never fetched video data, calculated metrics, or wrote a snapshot. Result: all metric columns null, `competitor_videos` empty, `competitor_snapshots` empty — every tab showed "—" or nothing. Fix: after insert, track route now calls `getCompetitorFullProfile`, upserts videos to `competitor_videos`, calls `calculateCompetitorMetrics`, writes metrics to the competitors row via `updateCompetitorMetrics`, and writes the first `competitor_snapshots` row. If the YouTube API call fails the competitor row is kept (partial success) and a warning is returned. Also: `is_dominator` was hardcoded `false` — fixed to `tier === 3`. Insight route now returns 422 (not 500) when data is insufficient, and InsightsTab shows a retryable "Gathering data…" state instead of an error.

**Weekly digest email never sent (fixed 2026-04-28):** Three root causes: (1) `generateDigest` in `lib/digest-generator.ts` saved the digest to DB and returned but never called `sendWeeklyDigest` — the email pipeline was simply never wired up. Fixed by building the `DigestResult` object before returning and calling `sendWeeklyDigest(userId, digestResult)` after the DB save. (2) `FROM_EMAIL` fallback in `lib/email.ts` was `'digest@showstencil-u6k1.vercel.app'` — an unverified domain that Resend silently rejects. Changed fallback to `'onboarding@resend.dev'` (Resend's shared sending domain, works without verification) and added a startup `console.warn` if `RESEND_FROM_EMAIL` env var is missing. (3) `checkAndSendAlerts` in `lib/email.ts` filtered users by `['trial', 'starter', 'pro']` — same wrong values as the Day 12 cron bug, missed in that fix. Changed to `['on_trial', 'active', 'past_due']`. Confirmed working: test script `scripts/test-send-digest-email.ts` delivered to `vedangk2912@gmail.com` (messageId: 13c6a5fb-9980-4361-8a65-644d201e56b9).

**CTR showing 286% instead of 2.86% (fixed 2026-04-28):** `avg_ctr` in `channel_snapshots` and `ctr` in `videos` are both stored as percentage values (e.g. 2.86 = 2.86%). Display code in `DashboardClient.tsx` and `OverviewTab.tsx` was multiplying by 100 a second time — showing 286. Removed the `× 100` from both. Also fixed `digest-generator.ts`: the Claude context was assembling `ctr: ${(avgCtr * 100).toFixed(1)}%` (showing 286%) instead of `${avgCtr.toFixed(1)}%`. The gap scorer receives `ctr / 100` (decimal) as it expects, since `fmtCtr` inside the scorer multiplies by 100 itself.

**Competitor videos not inserting on manual add (fixed 2026-04-28):** `app/api/competitors/track/route.ts` was calling `.upsert(videoRows, { onConflict: 'competitor_id,youtube_video_id' })` but that unique constraint does not exist in the database — the upsert silently failed with a 42P10 constraint error that was being swallowed. Fixed by switching to delete + insert (same pattern as `saveVideoData`). Added detailed `console.log` at each step of the video fetch pipeline (profile fetch, video count, insert result) so future failures are visible in Vercel logs. Graham Stephan's 15 videos confirmed inserted via `scripts/sync-competitor-videos.ts` (one-time utility).

**Upload frequency contradiction — Overview tab vs AI insights (fixed 2026-04-28):** Two root causes: (1) `getCompetitorMetricsFromDB` was only selecting 4 columns from `competitors` and never reading `upload_frequency_30d` — it fell back to `videoRows.length / 3` (all stored videos ÷ 3, assuming 90-day span) which could differ from the 30-day count shown in OverviewTab. Fixed by adding `upload_frequency_30d` to the SELECT and using it when non-null. (2) `digest-generator.ts` computed the user's upload frequency by filtering `bestVideos` (top 10 by views) to the last 30 days — if recent videos didn't rank in the top 10, the count was wrong. Fixed by adding `countVideosLast30Days(userId)` to `lib/db.ts` and using it in `generateDigest`. All upload frequency values are now labelled `"X videos/month (last 30 days)"` in the Claude context so Claude cannot conflate weekly vs monthly rates.

**Publishing days showing noisy multi-day results instead of dominant day (fixed 2026-04-28):** `ContentTab.tsx` and `insights/route.ts` were both computing top publishing days from ALL synced videos regardless of age. A creator who historically posted on Wednesday but now posts every Thursday still showed "Thursday, Wednesday" because old videos dominated the count. Example: Humphrey Yang showed Thursday(11)/Wednesday(2)/Tuesday(1) from 15 total videos — but last 30 days was Thursday(4)/Tuesday(1), and Claude generated an insight saying "shift to Tuesday and Thursday" instead of confirming Thursday. Fix: both files now use a 30d→60d→all fallback window (same pattern already used for upload frequency). After filtering, only the single top day is extracted — not top 3. If all days in the window have count=1 (no consistent pattern), `ContentTab` shows "Varies" with "Consistent uploading on different days" caption, and `insights/route.ts` passes `["Varies — consistent uploading on different days"]` to Claude. Prompt label in `competitor-insights.ts` updated to "Top publishing days (last 30 days)" to make the recency explicit. After deploy, clear affected competitor's cached insights via SQL (`SET insights=null, insights_generated_at=null`) then regenerate.

**Total videos gap showing — instead of calculated number (fixed 2026-04-28):** `OverviewTab.tsx` had `gap: null` hardcoded for the Total videos row. Added `totalVideosGap = compVideoCount - userVideoCount` (null when either side is missing), displayed as `−X` (red) when competitor has more or `+X` (green) when user has more.

**Competitor sync coupled to user channel sync in cron (fixed 2026-04-28):** `app/api/cron/refresh-data/route.ts` had a single try/catch per user — if the user's `/api/sync` call failed (expired OAuth token, YouTube Analytics error), the entire catch block fired and skipped competitor data refresh too. Competitor data uses the YouTube DATA API which is public and needs no OAuth token, so it should never fail due to token issues. Fix: split the loop body into two independent try/catch blocks. Block 1 handles user channel sync; its failure is logged but execution falls through. Block 2 always runs, loads competitors for the user, and wraps each competitor in its own try/catch so one bad channel never blocks others. Invalid YouTube channel IDs (not starting with `UC` or not 24 chars) are skipped with a log. Snapshots are only written when `subscriber_count` is non-null. Insights cache is wiped per-user after Block 2 completes.

\---


## Planned But Not Yet Built

> These features are referenced in pricing/access.ts but have no page, API route, or lib function yet.
> Build order: Revenue Forecast → Whitespace Map → Collaboration Finder.

| Feature | Plan Gate | What It Does | Notes |
|---|---|---|---|
| Revenue Forecast page | Pro only | Projects the creator's monthly/annual revenue 3–6 months out based on current trajectory vs niche benchmarks; shows the "what if you fixed your CTR" scenario | `lib/revenue-benchmarks.ts` has the pure computation layer. Needs a `/revenue` page + API route + chart component |
| Whitespace Map | Pro only | Visualises topic clusters in the niche (covered vs uncovered by the user), highlights high-search / low-competition gaps | Requires `findUncoveredTopics` from `lib/trend-detector.ts` + a visual map component (Recharts tree map or force graph) |
| Collaboration Finder | Pro only | Identifies Tier 1 and Tier 2 competitors in the same sub-niche that would benefit from a collaboration; scores by audience overlap and growth velocity | New Claude prompt needed; requires sub-niche similarity scoring from `lib/sub-niche-detector.ts` |
| Digest email re-subscribe flow | All plans | If a user unsubscribes via the one-click link, they have no way to re-subscribe from email — they must go to /settings. A "re-subscribe" link in the unsubscribe confirmation page is missing | `app/api/unsubscribe/route.ts` handles the unsubscribe; needs a `/api/resubscribe?token=X` counterpart |
| Topic coverage gap score | All plans | `topic_coverage_gap_score` is a stub returning 0 in `lib/gap-scorer.ts`; the dashboard strip hides it | Needs `findUncoveredTopics` result piped into the scorer; removed from dashboard until built (Day 9 decision) |
| Pricing page checkout wiring | All plans | `app/pricing/page.tsx` CTA buttons call `/api/subscription/create` which uses `lib/paypal.ts` — needs `PAYPAL_STARTER_PLAN_ID` and `PAYPAL_PRO_PLAN_ID` set in Vercel env vars (run `scripts/create-paypal-plans.ts` to generate them) | Done for sandbox; run the script against live PayPal before go live |
| `app/(auth)/callback/page.tsx` | — | OAuth callback page — not needed; NextAuth handles the callback automatically at `/api/auth/callback/google` | Directory placeholder exists as `.gitkeep`; no code needed |
| `app/api/webhooks/stripe/` | — | Stripe webhook handler directory — empty `.gitkeep`; Stripe replaced by PayPal | Can be deleted in cleanup |

---

