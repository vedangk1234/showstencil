# ShowStencil — Reference (folder structure, env, API scopes, business logic, plan gating)

> Extracted from CLAUDE.md (PR-9).

## Folder Structure

```
showstencil/
├── app/
│   ├── (auth)/
│   │   ├── login/page.tsx
│   │   └── callback/page.tsx
│   ├── (dashboard)/
│   │   ├── dashboard/page.tsx        ← main dashboard
│   │   ├── ideas/page.tsx            ← video idea suggestions
│   │   ├── digest/page.tsx           ← weekly digest view
│   │   ├── competitors/page.tsx      ← competitor management (list + filter tabs)
│   │   ├── competitors/[id]/page.tsx ← per-competitor deep analysis (5-tab view)
│   │   └── settings/
│   │       ├── page.tsx
│   │       └── notifications/page.tsx
│   ├── api/
│   │   ├── auth/\[...nextauth]/route.ts
│   │   ├── sync/route.ts             ← trigger data refresh
│   │   ├── create-checkout-session/route.ts
│   │   ├── webhooks/stripe/route.ts
│   │   ├── unsubscribe/route.ts      ← token-based one-click unsubscribe (no auth)
│   │   ├── settings/
│   │   │   └── notifications/route.ts ← GET/POST notification preferences
│   │   ├── competitors/
│   │   │   ├── [id]/route.ts         ← GET single competitor data
│   │   │   ├── search/route.ts       ← POST channel search (URL/handle/ID)
│   │   │   ├── track/route.ts        ← POST add searched channel as competitor
│   │   │   └── insights/route.ts     ← POST generate Claude insights for a competitor
│   │   ├── users/
│   │   │   └── detect-sub-niche/route.ts ← POST trigger sub-niche detection
│   │   └── cron/
│   │       ├── daily/route.ts              ← stub (superseded)
│   │       ├── weekly-digest/route.ts     ← Monday 9am UTC
│   │       ├── refresh-data/route.ts      ← daily 3am UTC
│   │       ├── trend-detection/route.ts   ← daily 6am UTC
│   │       ├── cache-cleanup/route.ts     ← daily 2am UTC (new)
│   │       ├── sub-niche-detection/route.ts ← daily 5am UTC (new)
│   │       └── dominator-refresh/route.ts   ← daily 4am UTC (new)
│   ├── page.tsx                      ← landing page (public)
│   ├── pricing/page.tsx
│   ├── privacy/page.tsx
│   └── terms/page.tsx
├── lib/
│   ├── youtube-analytics.ts          ← authenticated API calls (user's own data)
│   ├── youtube-data.ts               ← public API calls (competitor data)
│   ├── niche-engine.ts               ← niche detection + competitor matching
│   ├── gap-scorer.ts                 ← core gap scoring algorithm
│   ├── trend-detector.ts             ← viral video detection
│   ├── digest-generator.ts           ← Claude API integration
│   ├── email.ts                      ← Resend email functions
│   ├── stripe.ts                     ← replaced by PayPal (stub)
│   ├── access.ts                     ← plan gating (canAccess function)
│   ├── db.ts                         ← all Supabase database operations
│   ├── utils.ts                      ← shared utilities
│   ├── sub-niche-detector.ts         ← Claude sub-niche classification (new)
│   ├── dominator-finder.ts           ← finds Tier 3 dominator channels (new)
│   ├── plan-limits.ts                ← competitor slot limits per plan (new)
│   ├── competitor-matcher.ts         ← tier calculation + sub-niche matching (new)
│   ├── channel-search.ts             ← channel URL/handle/ID resolver + cache (new)
│   ├── competitor-insights.ts        ← Claude per-competitor insights generator (new)
│   └── revenue-benchmarks.ts         ← niche CPM/RPM benchmarks (pure computation)
├── emails/
│   ├── weekly-digest.tsx             ← React Email: weekly digest template
│   └── trend-alert.tsx               ← React Email: viral trend alert template
├── components/
│   ├── ui/                           ← reusable UI components
│   ├── charts/                       ← Recharts wrappers
│   ├── dashboard/                    ← dashboard-specific components
│   ├── competitors/                  ← competitor system components (new)
│   │   ├── CompetitorsTable.tsx      ← filterable table with tier/dominator badges
│   │   ├── CompetitorAnalysis.tsx    ← 5-tab analysis shell for /competitors/[id]
│   │   ├── ChannelSearchBar.tsx      ← URL/handle/ID input + search results list
│   │   ├── TierBadge.tsx             ← Tier 1/2/3 + Dominator label badge
│   │   ├── UpgradeBanner.tsx         ← plan upgrade prompt when limit reached
│   │   ├── PlanLimitIndicator.tsx    ← shows X/N competitors used
│   │   └── tabs/
│   │       ├── OverviewTab.tsx       ← subscriber/view/watch time comparison
│   │       ├── ContentTab.tsx        ← upload patterns, formats, topic clusters
│   │       ├── GrowthTab.tsx         ← growth velocity chart vs user
│   │       ├── VideosTab.tsx         ← recent competitor videos with velocity
│   │       └── InsightsTab.tsx       ← Claude-generated strategic insights
│   └── emails/                       ← (legacy path — templates now in /emails)
├── types/
│   └── index.ts                      ← all TypeScript interfaces
├── CLAUDE.md                         ← this file
├── .env.local                        ← never commit this
├── .env.example                      ← commit this (no real values)
└── vercel.json                       ← cron job configuration
```

\---


## Environment Variables (.env.local)

```bash
# NextAuth
NEXTAUTH\_URL=http://localhost:3000
NEXTAUTH\_SECRET=                    # generate with: openssl rand -base64 32

# Google OAuth (YouTube scopes)
GOOGLE\_CLIENT\_ID=
GOOGLE\_CLIENT\_SECRET=

# YouTube API
YOUTUBE\_API\_KEY=                    # for public Data API calls (no auth needed)

# Supabase
NEXT\_PUBLIC\_SUPABASE\_URL=
NEXT\_PUBLIC\_SUPABASE\_ANON\_KEY=
SUPABASE\_SERVICE\_ROLE\_KEY=          # server-side only, never expose to client

# Anthropic (Claude API for digest generation)
ANTHROPIC\_API\_KEY=

# Stripe
STRIPE\_SECRET\_KEY=
STRIPE\_PUBLISHABLE\_KEY=
STRIPE\_WEBHOOK\_SECRET=
STRIPE\_STARTER\_PRICE\_ID=           # $29/month product price ID
STRIPE\_PRO\_PRICE\_ID=               # $79/month product price ID

# Resend (email)
RESEND\_API\_KEY=
RESEND\_FROM\_EMAIL=digest@showstencil.com

# Vercel cron secret (prevent external calls to cron endpoints)
CRON\_SECRET=                        # generate with: openssl rand -base64 32

# Gemini (thumbnail generation via Google GenAI)
GEMINI\_API\_KEY=

# App
NEXT\_PUBLIC\_APP\_URL=http://localhost:3000
```

\---


## YouTube API Scopes Required

When setting up OAuth consent screen in Google Cloud Console:

```
https://www.googleapis.com/auth/youtube.readonly
https://www.googleapis.com/auth/yt-analytics.readonly
```

YouTube Data API v3 quota: 10,000 units/day (free)

* getChannelStats: 1 unit
* getRecentVideos (search): 100 units
* getVideoDetails (batch of 50): 1 unit

YouTube Analytics API quota: 200 units/day (free)

* Each report query: 1 unit

Budget calls carefully. For 100 users with 10 competitors each:

* Daily competitor refresh: 100 users × 10 competitors × 1 unit = 1,000 units from Data API
* Weekly user analytics sync: 100 users × 4 report types = 400 units from Analytics API

\---


## Core Business Logic

### Gap Score Calculation (lib/gap-scorer.ts)

Weights below reflect the actual implementation (updated after Day 3 calibration):

```
Score 1 — Views gap (weight: 35%)
  Piecewise scale: gap <25% → 10-30, <50% → 30-60, <75% → 60-85, 75%+ → 85-100
  gapPercent = (competitorAvg - userValue) / competitorAvg × 100

Score 2 — CTR gap (weight: 30%)
  Same piecewise scale as views
  Estimated CTR for competitors = (avgViews / subscriberCount) × 0.3, capped at 15%

Score 3 — Watch time gap (weight: 25%)
  Same piecewise scale
  Falls back to niche benchmarks when public data has no duration (finance/education: 720s, gaming: 480s, default: 360s)

Score 4 — Upload frequency gap (weight: 10%)
  Hard-capped at score 60 — frequency alone cannot dominate the overall score

Score 5 — Topic coverage gap (weight: 0% for now, stub)
  Returns 0 until topic analysis is implemented in a future milestone

Overall = weighted sum, rounded to integer 0-100
Higher score = bigger gap = more opportunity
```

### Niche CPM Benchmarks (used for revenue estimation)

```
finance:     $15-25  RPM: $8-14
tech:        $8-15   RPM: $4-8
gaming:      $3-6    RPM: $1.5-3
cooking:     $5-10   RPM: $2.5-5
fitness:     $6-12   RPM: $3-6
beauty:      $8-14   RPM: $4-7
travel:      $4-8    RPM: $2-4
education:   $10-18  RPM: $5-9
business:    $12-22  RPM: $6-11
entertainment: $2-5  RPM: $1-2.5
diy:         $5-9    RPM: $2.5-4.5
vlog:        $3-6    RPM: $1.5-3
```

### Viral Video Threshold

A video is flagged as viral when:

```
velocity = currentViews / hoursSincePublished
threshold = channelAvgViewsPerVideo / 48 × 3
if velocity > threshold AND hoursSincePublished < 48 → flag as viral
```

### Claude Digest Prompt Template

Model: claude-sonnet-4-6
Max tokens: 1200 output
Temperature: 0.7

```
You are a sharp YouTube analytics consultant writing a personalised weekly report for {channelName}.

Channel context:
- Niche: {nicheId}
- Subscribers: {subscriberCount}
- This week's avg views per video: {avgViews}
- Gap score vs Tier 1 competitors: {overallGapScore}/100
- Primary bottleneck: {primaryBottleneck}

Competitor activity this week:
{competitorSummary}

Trending videos in niche:
{trendingSummary}

Gap breakdown:
{gapBreakdown}

Write a 400-500 word weekly digest with these exact sections:
1. YOUR WEEK (2-3 sentences on what happened to their channel this week, use specific numbers)
2. WHAT YOUR COMPETITORS DID (2-3 sentences on what moved in the niche this week)
3. YOUR BIGGEST OPPORTUNITY RIGHT NOW (1 paragraph on the single most impactful thing they can do)
4. THIS WEEK'S 3 VIDEO IDEAS (numbered list, each with: title, one-sentence reason why it will perform)
5. ONE THING TO CHANGE THIS WEEK (one specific, actionable recommendation)

Rules:
- Use {channelName} by name, not "your channel"
- Reference actual video titles and competitor names, never generic placeholders
- Be direct and specific — no corporate language, no vague encouragement
- Write like a smart friend who has studied their data, not a report generator
- Every claim must reference a specific number from the data provided above
```

\---


## Plan Gating Logic (lib/access.ts)

```typescript
type Feature =
  | 'competitors\_count'        // free: 1, starter: 5, pro: unlimited
  | 'weekly\_digest'            // free: monthly only, starter+: weekly
  | 'trend\_alerts'             // free: no, starter+: yes
  | 'real\_time\_alerts'         // free: no, starter: daily, pro: real-time
  | 'revenue\_forecast'         // pro only
  | 'whitespace\_map'           // pro only
  | 'collaboration\_finder'     // pro only
  | 'idea\_briefs\_full'         // free: basic, starter+: full brief

// Actual limits as of Day 40 (lib/access.ts + lib/plan-limits.ts):
// getCompetitorLimit: free=1, starter=6 (5 auto + 1 manual), pro=13 (10 auto + 3 manual)
// getIdeaLimit:       free=1, starter=3, pro=10
// FEATURE_GATES:      'alerts:daily' → starter+, 'insights:ai' → starter+, 'search:compare' → pro only
//                     digest:weekly gate removed — free users can view digests (monthly generation)
// getUserPlan cancelled logic: cancelled + current_period_end in future → stored plan (grace period)
//                              cancelled + past period or null → free
//                              expired → free (set by subscription_expired webhook)

const planLimits = {
  free:    { competitors: 1, ideas: 1,  digestFrequency: 'monthly', alerts: false, insights: false },
  trial:   { competitors: 6, ideas: 3,  digestFrequency: 'weekly',  alerts: true,  insights: true  }, // same as starter
  starter: { competitors: 6, ideas: 3,  digestFrequency: 'weekly',  alerts: true,  insights: true  },
  pro:     { competitors: 13, ideas: 10, digestFrequency: 'weekly',  alerts: true,  insights: true  },
}
```

\---


## Resources

* YouTube Data API docs: https://developers.google.com/youtube/v3
* YouTube Analytics API docs: https://developers.google.com/youtube/analytics
* Supabase docs: https://supabase.com/docs
* NextAuth v5 docs: https://authjs.dev
* Stripe docs: https://stripe.com/docs
* Resend docs: https://resend.com/docs
* React Email: https://react.email
* Recharts: https://recharts.org
* Anthropic API: https://docs.anthropic.com

\---

*Last updated: 2026-06-24 — Day 49: Sub-niche detection production fixes. Four bugs all causing sub_niche to never populate post-Day-48 migration: (1) stale Anthropic model ID claude-sonnet-4-20250514 → claude-sonnet-4-6 in sub-niche-detector + test-api-key (404 was swallowed); (2) self-HTTP POST to localhost detect-sub-niche route — extracted detectAndSaveSubNiche(), sync now awaits it in-process, route is a thin auth wrapper; (3) videos select queried non-existent 'description' column (42703 → null → false insufficient_videos) — changed to 'title' only, captured previously-swallowed fetch + update errors; (4) removed dead fire-and-forget GET to localhost refresh-data from detectAndAssignCompetitors (redundant + mis-scoped — last localhost self-HTTP call in production). Commits 6db2e5f, e33b170, 8a83136, 8612df1. tsc --noEmit: zero errors.*

*Last updated: 2026-05-14 — Day 44: Sync 429 handling fix — api/sync 429 message updated to "Your channel was synced recently. Refreshing your dashboard...". DashboardClient handleManualSync() reloads page on 429 instead of showing error string (429 on empty dashboard = data exists, reload reveals it). tsc --noEmit: zero errors.*

*Last updated: 2026-05-14 — Day 43: lib/logger.ts centralised error logging (logError writes to error_logs Supabase table). Supabase migration 20260513 adds error_logs table, explicit GRANT statements on all 15 tables, RLS on ideas+thumbnail_jobs. app/api/subscription/downgrade added (Pro→Starter via PayPal revise API). Proactive token refresh in sync-logic (refresh within 5min of expiry before any API calls, not just on TOKEN_EXPIRED). api/sync pre-flight validation (user not found + no token = early 400 before burning quota). DashboardClient manualSyncError changed from boolean to string — shows API error message verbatim. logError wired into 20+ files: auth, sync-logic, api/sync, paypal, youtube-analytics, youtube-data, email, gap-scorer, niche-engine, digest-generator, and all API route catch blocks. tsc --noEmit: zero errors.*

*Last updated: 2026-05-12 — Day 42: PayPal error logging (getAccessToken validates credentials, createSubscription logs full request body). Audience demographics + traffic sources now persisted in channel_snapshots (age_gender_breakdown, top_countries, traffic_sources JSONB columns). Subscriber count ?? 45000 fallback removed from sync-logic — auto-detection skipped when no snapshot exists. Niche corruption fix: detectNiche no longer writes niche on confidence===0. Digest niche fallback aligned to 'general'. Email from addresses split: digest@showstencil.com for weekly digest, trend@showstencil.com for alerts; both add replyTo SUPPORT_EMAIL. Dashboard guards against null youtube_channel_id (no-channel error screen). StepConfirmNiche timeout now switches to manual selection instead of silently writing 'finance'. Landing page timezone fallback for broken browsers (try/catch + range check on ET offset). Vercel Analytics added (@vercel/analytics). tsc --noEmit: zero errors.*

*Last updated: 2026-05-12 — Day 41: Payment system migrated from Lemon Squeezy to PayPal Subscriptions API. lib/lemonsqueezy.ts deleted; lib/paypal.ts created (getAccessToken, createSubscription, cancelSubscription, getSubscriptionDetails, verifyWebhookSignature, getPlanFromPayPalPlanId). scripts/create-paypal-plans.ts added. app/api/subscription/create/route.ts created. app/api/webhooks/paypal/route.ts created (ACTIVATED/CANCELLED/EXPIRED/SUSPENDED/PAYMENT.SALE.COMPLETED). webhooks/lemonsqueezy/ and create-checkout-session/ directories deleted. cancel/route.ts rewritten to use PayPal API. account/delete/route.ts rewritten to use paypal_subscription_id. types/index.ts: lemon_squeezy_* → paypal_subscription_id. lib/db.ts: getUserByLSCustomerId/SubscriptionId removed → getUserByPayPalSubscriptionId added. PricingClient.tsx: checkout + downgrade text updated. .env.example: LS vars removed, PayPal vars added. @lemonsqueezy/lemonsqueezy.js uninstalled. SQL migration: paypal_subscription_id column added, lemon_squeezy_* columns dropped. tsc --noEmit: zero errors.*

*Last updated: 2026-05-08 — Day 40: Cancellation grace period fix. cancel/route.ts: parses ends_at from LS response, stores as current_period_end, keeps subscription_plan unchanged. webhooks/lemonsqueezy: subscription_cancelled preserves plan + stores ends_at; new subscription_expired handler sets plan='free' (only place downgrade happens). lib/access.ts: getUserPlan now reads current_period_end; cancelled+future period → stored plan. types/index.ts: 'expired' added to SubscriptionStatus (was missing, causing type mismatch bug). CancelSubscription.tsx: success confirmation state shows "access until [date]" before router.refresh(). settings/page.tsx: "Renews" suppressed for cancelled users; amber "access until" info row added. tsc --noEmit: zero errors.*

*Last updated: 2026-05-08 — Day 39: Sentry monitoring integrated (client/server/edge configs + instrumentation.ts + global-error.tsx). Loading skeleton pages for all 5 dashboard routes. Thumbnail pipeline overhauled: stick figure removed, 16:9 safe-zone prompt, server-side padToSixteenNine via sharp. Regenerate thumbnail button removed — one per idea. Text-only SHOWSTENCIL. logo (Montserrat 700). Cancel subscription flow: CancelSubscription.tsx + POST /api/subscription/cancel. Free tier now gets 1 competitor + 1 idea (was blocked). Insights:ai gated to Starter+ (free shows locked prompt). Bolder/controversial hooks locked for free. Thumbnail button locked for free. Pricing page rebuilt as PricingClient.tsx 3-card layout. Delete account Danger Zone extended: cancel button now shows for on_trial too. Auto-detection upgraded: 2 Tier1 + 2 Tier2 + 1 Dominator (was 1+1+1). plan-limits.ts: free={1 total}, starter={6 total, 2T1+2T2+1Dom}. tsc --noEmit: zero errors.*

*Last updated: 2026-05-08 — Day 38: Cancel subscription button now shows for both 'active' and 'on_trial' users (was active-only). Added Danger Zone section to settings page with DeleteAccount component (modal requires exact "CONFIRM" input). Created POST /api/account/delete route — cancels subscription if active, deletes all user data in FK order (thumbnail_jobs → ideas → digests → trends → gap_scores → competitor_videos → competitor_snapshots → competitors → channel_snapshots → videos → user_settings → user_search_history → dominator_history → users), signs user out. tsc --noEmit: zero errors.*

*Last updated: 2026-05-07 — Day 37: CLAUDE.md full audit. Updated Feature Build Status to match actual codebase: lib/utils.ts, privacy/terms pages, digest/[id] page marked ✅; cron/daily marked 🗑️ deleted. Added 14 undocumented files: lib/competitor-metrics.ts, lib/image-utils.ts, lib/niche-images.ts, lib/env-validation.ts; API routes competitors/[id]/sync, thumbnail-jobs/[jobId]/status, health; 14 new scripts. Added "Planned But Not Yet Built" section with Revenue Forecast, Whitespace Map, Collaboration Finder, and 4 smaller gaps. Tech stack Payments updated from Stripe → Lemon Squeezy (superseded by Day 41 PayPal migration).*

**Deleted:**
* `app/api/cron/daily/route.ts` + `app/api/cron/daily/` folder — old Week 1 stub, fully superseded by the 5 dedicated cron routes. Confirmed zero source references before deletion (only .next/ build artifacts).
* `app/api/cron/daily` stale entry removed from `.next/types/validator.ts` (generated file that tsconfig includes — stale entry caused TS error after source deletion).

**Type cleanup:**
* `topic_coverage_gap_score: 0` removed from `saveGapScore` INSERT in `lib/gap-scorer.ts` — stub always returned 0, never implemented. Option A applied (never displayed in UI — CLAUDE.md Day 9 confirmed it was removed from dashboard; `app/page.tsx` reference is marketing copy, not a rendered value).
* `topic_coverage_gap_score: number` removed from `GapScore` interface in `types/index.ts`. DB column still exists; `scripts/update-gap-scores.ts` one-time script left unchanged (raw Supabase string queries, no type enforcement affected).

**Test script fix:**
* `scripts/test-all-endpoints.ts` — test 10.4 updated: `cronFetchWithUserId(baseUrl, '/api/sync')` → `cronFetch(baseUrl, '/api/cron/user-sync')`. Auth changed from `x-cron-user-id` header to standard bearer token (matching the actual endpoint). Response parsing updated from `{ success, videosSynced, channelSnapshot }` to `{ processed, succeeded, failed }`. Header comment updated to remove stale `/api/sync` reference.

**Task 4 (pricing page back-button bug) — no fix applied:** Pricing page at `app/pricing/page.tsx` was inspected fully. The `useEffect` is benign (clears already-null loading state). No `router.push/replace` on mount. No server-side `redirect()`. No middleware. Root layout has no redirect logic. Cannot identify the back-button bug with confidence — reported to user without guessing.

Previous Day 35 (A7): /settings/notifications now redirects to /settings. Gitkeep replaced with `redirect('/settings')` in app/(dashboard)/settings/notifications/page.tsx. tsc --noEmit: zero errors.

Previous Day 35: Legal links added to 4 surfaces (additive only, no existing content modified).

*app/page.tsx (landing footer)*: Added a centered bar below `foot-bottom` with "© 2026 ShowStencil. All rights reserved. · Privacy Policy · Terms of Use" links pointing to `/privacy` and `/terms`. Inline styles using existing CSS variables (`--mono`, `--ink-2`, `--ink-3`).

*components/onboarding/StepWelcome.tsx*: Added "By continuing, you agree to our Terms of Use and Privacy Policy." below the "Let's go →" button. `text-xs text-zinc-500`, links in `text-zinc-400` with underline and hover transition. Note: `app/(auth)/login/page.tsx` already had the same legal notice (added earlier) — no change needed there.

*app/(dashboard)/settings/page.tsx*: Added Legal `<Section>` at the bottom of the settings page with Privacy Policy and Terms of Use plain-text links (`color: #888888`, `fontSize: 13`). Uses the existing `Section` sub-component.

*emails/weekly-digest.tsx* and *emails/trend-alert.tsx*: Added two additional `<Link>` elements after the existing Unsubscribe link, styled with the same `unsubscribeLinkStyle`. URLs: `https://showstencil.com/privacy` and `https://showstencil.com/terms`. No other email content changed.

*tsc --noEmit: zero errors.*

Previous Day 34: A4 + A5 — empty states and error states across all dashboard pages. 8 fixes: dashboard empty-state CTA now calls POST /api/sync (Fix 1), chart empty copy explains timing (Fix 2), CompetitorsTable empty states per filter tab (Fix 3), OverviewTab/ContentTab/GrowthTab early returns when data missing (Fix 4), dismissable sync error banner in DashboardClient (Fix 5), regenError banner with useRef in IdeasClient (Fix 6), InsightsTab friendly error + Try again button (Fix 7), try/catch error screens on all 5 server pages (Fix 8). tsc --noEmit: zero errors.
Previous Day 33: Infinite reload loop fix in IdeasClient — auto-trigger now guarded by `localRefreshAvailable`, 429 handler replaced `window.location.reload()` with friendly message + flag disable.
Previous Day 32: lib/idea-generator.ts fully deleted. scripts/test-full-pipeline.ts deleted entirely (Day 6 artifact, tested old 7-step pipeline with dead JSONB ideas writer, no current value). scripts/test-everything.ts stripped of idea-generator import — test 3.7 changed to SKIP with note, IdeaResult removed from @/types import, 3.6+3.7 Promise.allSettled restructured to plain await on generateDigest alone. GeneratedVideoIdea and IdeaResult types deleted from types/index.ts (zero external references after deletions confirmed by grep). tsc --noEmit: zero errors. lib/idea-generator.ts is now fully gone from the codebase.
Previous Day 31: Weekly digest cron cleanup. Removed zombie generateVideoIdeas call from weekly-digest cron (was calling old JSONB lib/idea-generator.ts, discarding result, burning Claude credits every Monday).
Previous Day 30: Ideas system diagnostic — 7 of 8 fixes applied. Fix A (idea-generator.ts) not deleted — active import in weekly-digest cron. Fix B: ideas_refresh_available added to UserSettings type. Fix C: "monthly" text replaced with "this week / Refreshes every Monday" in indicator bar. Fix D: empty state canRegenerate={true} → localRefreshAvailable, Generate Ideas button gated by flag, disabled message shown when false. Fix E: 403 handler shows human-readable upgrade message instead of raw error key, upgrade CTA link added to error display in both empty state and main view (429 behavior noted as reload here, later corrected by Day 33). Fix F: regenerateAvailableAt computation and return field removed from generate route. Fix G: getRecentIdeas deleted from lib/db.ts (zero external callers confirmed). Fix H: ideas/latest now uses ±1-minute batch window matching getRecentIdeasBatch. tsc --noEmit: zero errors.
Previous Day 28: Weekly insights cache rhythm + Generate Ideas button flag. (1) page.tsx bug fixed: getIdeasRefreshAvailable(userId) was missing from Promise.all (5 variables, 4 items — ideasRefreshAvailable was undefined). Added as 5th item. (2) ideasRefreshAvailable passed to IdeasClient as a new prop. (3) IdeasClient: added ideasRefreshAvailable prop, localRefreshAvailable useState, setLocalRefreshAvailable(false) on successful generation, canRegenerate simplified to localRefreshAvailable (dropped plan-based date math), Header updated — when enabled shows "Fresh competitor data available — generate new ideas", when disabled shows "New ideas available every Monday when competitor data refreshes". (4) mostRecentGeneratedAt removed as a prop (still computed in page.tsx for imageSeed but no longer passed to client). (5) user_settings.ideas_refresh_available column documented in schema. (6) setIdeasRefreshAvailable + getIdeasRefreshAvailable documented in lib/db.ts section. Already done in prior session: daily cron insights wipe removed, cache-cleanup Monday branch wires insights wipe + flag reset, DB functions added, ideas/generate sets flag false after save. Previous Day 27: Ideas parallel insight generation fix. /api/ideas/generate: sequential for-loop → Promise.allSettled (prevents 60s Vercel timeout on 3+ competitors), empty-array insights check added. StepFirstAnalysis: LOADING_STAGES extended 20s→27s, 1s settle delay after generation. IdeasClient: stage labels updated to match actual pipeline. Previous Day 26: Interactive notification settings. NotificationSettings client component (digest toggle, alerts toggle, threshold slider, optimistic updates, 2s Saved ✓ indicator). settings/page.tsx: Toggle sub-component removed, 3 derived vars removed, section replaced with component call. CLAUDE.md components table updated.
Previous Day 25: Onboarding polish. StepFirstAnalysis auto-triggers /api/ideas/generate when ideas table is empty (full pipeline: insights + ideas in one call). Mobile responsive: all buttons w-full sm:w-auto, StepConfirmChannel buttons flex-col sm:flex-row with py-3 tap targets, gap score text-5xl sm:text-7xl, idea title break-words. page.tsx searchParams sync effect fixes browser back/forward. Skip flow verified correct (no changes). Day 24: 5-step onboarding flow. app/onboarding/page.tsx (URL state, Suspense wrapper, background sync on Step 1, skip on Steps 2-5). 6 new components in components/onboarding/. 5 new API routes (user/profile GET+PATCH, competitors GET, gap-score/latest GET, ideas/latest GET, onboarding/complete POST). Dashboard layout now redirects onboarding_completed=false users to /onboarding instead of auto-flipping the flag.
Previous Day 23: Landing page — full Next.js conversion. app/landing.css extracted, public/nagai-base.png added, app/page.tsx converted to Client Component with time-of-day sky system, dev scrubber removed, CTA buttons wired to auth, SessionProvider added to root layout. Day 22b: Sync refactor — lib/sync-logic.ts extracted, app/api/cron/user-sync added (daily 3am), refresh-data competitor-only, niche avg chart fixed (ReferenceLine from competitor_videos instead of broken snapshot join), insights truncation salvage (max_tokens 3500, backwards-walk JSON recovery). Day 22: Three-hook ideas feature (hook_2/hook_3 — Safe/Bolder/Most controversial), Gemini model rename (gemini-2.5-flash-image). Day 21: Thumbnail generation feature — Gemini gemini-2.5-flash-image, multi-step ThumbnailGenerationModal (camera/upload/Google profile/no-photo), monthly quota (starter 12/pro 40), deleteAllUserThumbnails on regeneration, lib/thumbnail-storage.ts for Supabase Storage, canGenerateThumbnail quota gate in lib/access.ts.
Previous Day 20: Ideas page fully rebuilt. 4-signal generation pipeline: competitor AI insights (auto-regenerated if stale) + user top-5 videos + per-competitor winning videos (>30% above that channel's avg) + user avg duration. Ideas stored as individual DB rows with 11 new columns. Plan gating: Starter→3 ideas/month, Pro→10 ideas/week, Free→403. generateAndCacheInsightsForCompetitor added to lib/competitor-insights.ts as single source of truth; insights route is now a thin wrapper. IdeasClient.tsx handles loading stages, idea cards with 4 sections each, mark-as-planned/made, done section. Database migration required (see Day 20 notes above).
Previous Day 19: 5 competitor system fixes. (1) Insights 422 for Rob Berger fixed — video_count fallback from competitor_videos COUNT when column is null. (2) Sub-niche detected immediately in assignCompetitor after videos inserted + refresh-data cron detects for null-sub_niche competitors. (3) Activity threshold check before assigning any competitor — meetsActivityThreshold requires ≥3 videos/30d + ≥6 videos/60d, iterates pool in preference order. (4) Immediate fire-and-forget refresh-data trigger after auto-detection so data populates without waiting overnight. (5) Per-tier presence check replaces existingAutoCount===0 in sync, filledTiers guard in detectAndAssignCompetitors prevents duplicate tier assignment. reset-inactive-competitors.ts script created and run — deleted School of Personal Finance + Erika Kullberg. Sync re-detected Personal Finance with Ravi Sharma (Tier 1) + Graham Stephan (Tier 3 Dominator). All 3 competitors now have videos and sub_niche (Rob's populates next cron run).
Previous Day 18: Competitor auto-detection wired into /api/sync. detectAndAssignCompetitors added to lib/niche-engine.ts — searches YouTube once (101 quota units) for the user's niche, classifies all 50 results into Tier 1/2/Dominator buckets, picks best per tier, runs assignCompetitor in parallel via Promise.allSettled. assignCompetitor mirrors track/route.ts pipeline: DB insert → getCompetitorFullProfile → video rows → updateCompetitorMetrics → saveCompetitorSnapshot. Sync step 6 checks existingAutoCount===0 and calls detectAndAssignCompetitors wrapped in try/catch — never blocks the sync response.
Previous Day 17 (part 2): Decoupled competitor sync from user channel sync in refresh-data cron. Single try/catch per user split into two independent blocks: Block 1 (user OAuth channel sync) failure no longer skips Block 2 (competitor DATA API sync). Each competitor wrapped in its own try/catch. Invalid channel IDs (not UC-prefixed or not 24 chars) skipped with log. Snapshot guarded on non-null subscriber_count. Insights cache wiped per-user after Block 2. Result: Sarah/Marcus/Humphrey get daily snapshots even when user token is expired.
Previous Day 17 (part 1): Competitor insights expanded with 5 new data points: (1) best/worst 3 videos by view_count — lets Claude identify winning format patterns vs failing formats; (2) user revenue + RPM from latest snapshot — lets Claude quantify the dollar impact of closing specific gaps; (3) full gap scores (overall, per-metric, primary_bottleneck, estimated_revenue_gap) — Claude now prioritizes insights by calculated opportunity score rather than guessing; (4) competitor viral videos separated from top videos — Claude identifies the title/format pattern behind breakout moments and checks if the user has ever used it; (5) 30-day subscriber growth trend (net change, growth %, growing/flat/declining) — Claude frames recommendations differently based on whether the channel is growing (double down) or flat/declining (fix content-audience fit). Prompt rewritten to 6-8 insights with stricter rules: every sentence must contain a specific number, both channel names required, concrete next action at end of each description. JSON extraction made robust with regex array match. max_tokens set to 1800. All 9/9 validation checks passed on test run: Humphrey Yang insights named both channels, referenced specific video titles and views, gap scores, growth trend, viral pattern, and revenue impact.
Previous Day 16 (part 3): Fixed publishing days noise across ContentTab + insights pipeline. Root cause: top publishing days were computed from ALL synced videos regardless of age, pulling in old schedule data. Example: Humphrey Yang showed Thursday(11)/Wednesday(2)/Tuesday(1) from 15 total videos, but last 30 days was 4×Thursday + 1×Tuesday — the correct signal is Thursday only. Three files changed: (1) ContentTab.tsx — publishing days now filter to last 30 days first, fall back to 60 days if <3 videos, then all videos. Only the single top day is shown (highest upload count). If all days have count=1 (no pattern), shows "Varies" + "Consistent uploading on different days" caption. Window label ("Based on last 30 days uploads" vs "60 days" vs "all synced") shown below. (2) insights/route.ts — same 30d→60d→all fallback applied before building dayCounts. publishingDays now passes only the single top day as a 1-element array, or ["Varies — consistent uploading on different days"]. (3) competitor-insights.ts — prompt label updated from "Publishing days:" to "Top publishing days (last 30 days):" so Claude knows the data is recent. After deploy: clear affected competitor's insights cache via `UPDATE competitors SET insights=null, insights_generated_at=null WHERE channel_name ILIKE '%<name>%' AND user_id=(SELECT id FROM users WHERE email='vedangk2912@gmail.com')` then regenerate.
Previous Day 16 (part 2): Fixed two bugs in competitor insights generation: (1) competitor-insights.ts was multiplying avg_ctr by 100 again in the Claude prompt — stored value is already a percentage (2.86 = 2.86%), so Claude was seeing 286%. Removed ×100. (2) insights/route.ts was computing user upload frequency as videos_count/52 (lifetime total ÷ 52 weeks) — completely wrong for any channel. Replaced with a Supabase COUNT query on videos.published_at >= 30 days ago. Competitor upload frequency was also dividing upload_frequency_30d by 4.3 to get per-week — now passes upload_frequency_30d directly as per-month (matching its stored unit). Both prompt labels updated to "videos/month (last 30 days)". Graham Stephan's cached insights cleared via Supabase SQL for regeneration.
Previous Day 16 (part 1): 5 competitor detail page bugs fixed: CTR showing 286% (removed ×100 from display + digest prompt); competitor videos not inserting on manual add (upsert→delete+insert, constraint didn't exist); upload frequency contradiction (getCompetitorMetricsFromDB now reads upload_frequency_30d, digest uses countVideosLast30Days, all labelled "videos/month last 30d"); total videos gap showing — (now computes compVideoCount−userVideoCount); viral video count now shows 0 not — when videos are loaded but none are viral. Graham Stephan's 15 videos synced via scripts/sync-competitor-videos.ts.
Previous: 2026-04-28 — Day 15 (part 2): Weekly digest email fixed — sendWeeklyDigest now called from generateDigest, FROM_EMAIL fallback changed to onboarding@resend.dev, checkAndSendAlerts status filter corrected. Email confirmed delivered. Day 15 (part 1): Manual competitor add now fetches full profile immediately on track (videos, metrics, snapshot). lib/competitor-metrics.ts added. is_dominator fixed to tier===3. OverviewTab/ContentTab null-safe ("—" not "0"). InsightsTab 422 retryable state. Tier badge fallback from userSubscriberCount. CLAUDE.md Known Issues + Key Decisions updated.
Previous: 2026-04-27 — Day 14 (part 2): Dashboard metric strip null-guard (filter to validSnapshots), saveChannelSnapshot null write guard, seed script competitor dedup fix (match by channel_name not youtube_channel_id), null snapshot cleanup step in seed, duplicate competitor rows removed from DB. Day 14 (part 1): Cron wiring (refresh-data writes competitor metrics + snapshots, wipes insights cache; dominator-refresh skip-if-exists), insights route fixed to use on-row cache, dashboard UI overhauled (SubscriberGrowthChart, niche avg line, gap unit labels, 1 top idea), competitor tabs rewritten (OverviewTab, ContentTab, VideosTab), manual add lock wired end-to-end (track route + ChannelSearchBar modal + competitors page lock query).
Previous: 2026-04-26 — Day 13: Database foundation — competitor_snapshots table, 7 new columns on competitors, 6 new lib/db.ts functions, seed script fully rewritten to upsert mode with 31-day history for user + all 3 competitors, correct tier distribution (Tier1/Tier2/Dominator), 15 own videos.
Previous: 2026-04-26 — Day 12: Cron sync fixed — wrong subscription_status filter + token expiry auto-refresh.
Next update due: End of Week 4*


