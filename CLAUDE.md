# SHOWSTENCIL — Project Context for Claude Code

> Read this entire file before writing a single line of code.
> This file is the single source of truth for every decision in this project.
> Update this file every Friday with what was built and any decisions made.

\---

## What We Are Building

ShowStencil is a YouTube analytics SaaS for US-based content creators (10K–500K subscribers).
It shows creators exactly why their competitors are growing faster than them — and tells them
specifically what to do about it in plain English.

The core value proposition:

* Connect your YouTube channel
* We find your niche competitors automatically
* We compare your metrics to theirs across 35 data points
* Claude generates a personalised weekly digest telling you what to change
* You make more money from your YouTube channel

Target customer: English-speaking YouTube creators, primarily in the US market,
who take their channel seriously but cannot afford a full analytics team.

Pricing:

* Free tier: 1 competitor, 1 digest per month, basic metrics
* Starter ($29/month): 5 competitors, weekly digest, daily alerts
* Pro ($79/month): unlimited competitors, real-time alerts, all 35 features, revenue forecast

\---

## Tech Stack — Do Not Deviate From This

|Layer|Tool|Why|
|-|-|-|
|Framework|Next.js 14 with App Router|SSR, API routes, Vercel native|
|Language|TypeScript|Strict mode on|
|Styling|Tailwind CSS only|No custom CSS files ever|
|Database|Supabase (PostgreSQL)|Auth + DB in one, free tier generous|
|Auth|NextAuth.js v5|Google OAuth with YouTube scopes|
|Charts|Recharts|Lightweight, React native|
|Email|Resend + React Email|Clean API, generous free tier|
|Payments|Stripe|Hosted checkout, webhook handling|
|AI Digest|Anthropic Claude Sonnet 4.6 API|NOT Opus — cost control|
|Hosting|Vercel|Auto-deploy from GitHub|
|Monitoring|Sentry (errors) + UptimeRobot (uptime)|Free tiers|
|Domain|showstencil.com|Namecheap|

\---

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
│   │   ├── competitors/page.tsx      ← competitor management
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
│   │   └── cron/
│   │       ├── daily/route.ts
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
│   ├── idea-generator.ts             ← video idea generation
│   ├── email.ts                      ← Resend email functions
│   ├── stripe.ts                     ← Stripe client + helpers
│   ├── access.ts                     ← plan gating (canAccess function)
│   ├── db.ts                         ← all Supabase database operations
│   └── utils.ts                      ← shared utilities
├── emails/
│   ├── weekly-digest.tsx             ← React Email: weekly digest template
│   └── trend-alert.tsx               ← React Email: viral trend alert template
├── components/
│   ├── ui/                           ← reusable UI components
│   ├── charts/                       ← Recharts wrappers
│   ├── dashboard/                    ← dashboard-specific components
│   └── emails/                       ← (legacy path — templates now in /emails)
├── types/
│   └── index.ts                      ← all TypeScript interfaces
├── CLAUDE.md                         ← this file
├── .env.local                        ← never commit this
├── .env.example                      ← commit this (no real values)
└── vercel.json                       ← cron job configuration
```

\---

## Database Schema (Supabase / PostgreSQL)

```sql
-- Users table (extends NextAuth)
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen\_random\_uuid(),
  email TEXT UNIQUE NOT NULL,
  name TEXT,
  image TEXT,
  youtube\_channel\_id TEXT,
  youtube\_access\_token TEXT,
  youtube\_refresh\_token TEXT,
  token\_expires\_at TIMESTAMPTZ,
  niche\_id TEXT,
  niche\_detected\_at TIMESTAMPTZ,
  subscription\_status TEXT DEFAULT 'free',
  stripe\_customer\_id TEXT,
  stripe\_subscription\_id TEXT,
  trial\_ends\_at TIMESTAMPTZ,
  onboarding\_completed BOOLEAN DEFAULT false,
  created\_at TIMESTAMPTZ DEFAULT NOW(),
  updated\_at TIMESTAMPTZ DEFAULT NOW()
);

-- Channel snapshots (user's own data, stored daily)
CREATE TABLE channel\_snapshots (
  id UUID PRIMARY KEY DEFAULT gen\_random\_uuid(),
  user\_id UUID REFERENCES users(id) ON DELETE CASCADE,
  snapshot\_date DATE NOT NULL,
  subscriber\_count INTEGER,
  total\_views BIGINT,
  videos\_count INTEGER,
  avg\_views\_per\_video FLOAT,
  avg\_ctr FLOAT,
  avg\_view\_duration\_seconds INTEGER,
  avg\_like\_ratio FLOAT,
  estimated\_monthly\_revenue FLOAT,
  rpm FLOAT,
  momentum\_score INTEGER,
  created\_at TIMESTAMPTZ DEFAULT NOW()
);

-- Videos (user's own videos with full analytics)
CREATE TABLE videos (
  id UUID PRIMARY KEY DEFAULT gen\_random\_uuid(),
  user\_id UUID REFERENCES users(id) ON DELETE CASCADE,
  youtube\_video\_id TEXT NOT NULL,
  title TEXT,
  published\_at TIMESTAMPTZ,
  duration\_seconds INTEGER,
  view\_count INTEGER,
  like\_count INTEGER,
  comment\_count INTEGER,
  share\_count INTEGER,
  save\_count INTEGER,
  ctr FLOAT,
  avg\_view\_duration\_seconds INTEGER,
  retention\_percentage FLOAT,
  impressions INTEGER,
  traffic\_source\_search FLOAT,
  traffic\_source\_suggested FLOAT,
  traffic\_source\_browse FLOAT,
  traffic\_source\_external FLOAT,
  subscriber\_gain INTEGER,
  revenue\_estimate FLOAT,
  rpm FLOAT,
  thumbnail\_url TEXT,
  performance\_score INTEGER,
  synced\_at TIMESTAMPTZ DEFAULT NOW()
);

-- Competitors (channels we track for each user)
CREATE TABLE competitors (
  id UUID PRIMARY KEY DEFAULT gen\_random\_uuid(),
  user\_id UUID REFERENCES users(id) ON DELETE CASCADE,
  youtube\_channel\_id TEXT NOT NULL,
  channel\_name TEXT,
  channel\_thumbnail TEXT,
  subscriber\_count INTEGER,
  total\_views BIGINT,
  tier INTEGER,           -- 1 = similar, 2 = aspirational, 3 = dominator
  is\_auto\_detected BOOLEAN DEFAULT true,
  is\_active BOOLEAN DEFAULT true,
  last\_synced\_at TIMESTAMPTZ,
  created\_at TIMESTAMPTZ DEFAULT NOW()
);

-- Competitor videos (public data only)
CREATE TABLE competitor\_videos (
  id UUID PRIMARY KEY DEFAULT gen\_random\_uuid(),
  competitor\_id UUID REFERENCES competitors(id) ON DELETE CASCADE,
  youtube\_video\_id TEXT NOT NULL,
  title TEXT,
  published\_at TIMESTAMPTZ,
  view\_count INTEGER,
  like\_count INTEGER,
  comment\_count INTEGER,
  duration\_seconds INTEGER,
  thumbnail\_url TEXT,
  velocity\_score FLOAT,    -- views per hour in first 48hrs
  performance\_vs\_avg FLOAT, -- ratio vs that channel's average
  is\_viral BOOLEAN DEFAULT false,
  synced\_at TIMESTAMPTZ DEFAULT NOW()
);

-- Gap scores (calculated weekly)
CREATE TABLE gap\_scores (
  id UUID PRIMARY KEY DEFAULT gen\_random\_uuid(),
  user\_id UUID REFERENCES users(id) ON DELETE CASCADE,
  calculated\_at TIMESTAMPTZ DEFAULT NOW(),
  overall\_score INTEGER,           -- 0-100, higher = bigger gap = more opportunity
  views\_gap\_score INTEGER,
  ctr\_gap\_score INTEGER,
  upload\_frequency\_gap\_score INTEGER,
  watch\_time\_gap\_score INTEGER,
  topic\_coverage\_gap\_score INTEGER,
  estimated\_revenue\_gap FLOAT,     -- monthly dollars left on table
  primary\_bottleneck TEXT          -- which gap costs the most money
);

-- Digests (Claude-generated weekly reports)
CREATE TABLE digests (
  id UUID PRIMARY KEY DEFAULT gen\_random\_uuid(),
  user\_id UUID REFERENCES users(id) ON DELETE CASCADE,
  week\_start\_date DATE NOT NULL,
  content TEXT NOT NULL,           -- full Claude-generated text
  video\_ideas JSONB,               -- array of 3 idea objects
  key\_metrics JSONB,               -- snapshot of metrics at time of generation
  email\_sent\_at TIMESTAMPTZ,
  opened\_at TIMESTAMPTZ,
  created\_at TIMESTAMPTZ DEFAULT NOW()
);

-- Trends (viral videos detected in niche)
CREATE TABLE trends (
  id UUID PRIMARY KEY DEFAULT gen\_random\_uuid(),
  user\_id UUID REFERENCES users(id) ON DELETE CASCADE,
  competitor\_id UUID REFERENCES competitors(id),
  youtube\_video\_id TEXT,
  title TEXT,
  channel\_name TEXT,
  view\_count INTEGER,
  velocity\_score FLOAT,
  detected\_at TIMESTAMPTZ DEFAULT NOW(),
  alert\_sent BOOLEAN DEFAULT false
);

-- User settings
CREATE TABLE user\_settings (
  user\_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  weekly\_digest\_enabled BOOLEAN DEFAULT true,
  alerts\_enabled BOOLEAN DEFAULT true,
  alert\_threshold\_multiplier FLOAT DEFAULT 3.0,
  last\_alert\_sent\_at TIMESTAMPTZ,
  alerted\_video\_ids TEXT[] DEFAULT '{}',
  unsubscribe\_token TEXT,              -- UUID token for one-click email unsubscribe
  digest\_day TEXT DEFAULT 'monday',
  timezone TEXT DEFAULT 'America/New\_York',
  updated\_at TIMESTAMPTZ DEFAULT NOW()
);

-- Required migration (run once in Supabase SQL editor):
-- ALTER TABLE user\_settings ADD COLUMN IF NOT EXISTS last\_alert\_sent\_at TIMESTAMPTZ;
-- ALTER TABLE user\_settings ADD COLUMN IF NOT EXISTS alerted\_video\_ids TEXT[] DEFAULT '{}';
-- ALTER TABLE user\_settings ADD COLUMN IF NOT EXISTS unsubscribe\_token TEXT;
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

const planLimits = {
  free:    { competitors: 1, digestFrequency: 'monthly', alerts: false },
  trial:   { competitors: 5, digestFrequency: 'weekly',  alerts: true  }, // same as starter
  starter: { competitors: 5, digestFrequency: 'weekly',  alerts: true  },
  pro:     { competitors: Infinity, digestFrequency: 'weekly', alerts: true },
}
```

\---

## Coding Conventions — Follow These Exactly

1. All database calls go in lib/db.ts — never query Supabase directly from components
2. All YouTube API calls go in lib/youtube-analytics.ts or lib/youtube-data.ts
3. All Stripe operations go in lib/stripe.ts
4. Never expose SUPABASE\_SERVICE\_ROLE\_KEY or ANTHROPIC\_API\_KEY to the client
5. Every API route must check authentication before doing anything else
6. Every API route that modifies data must validate the user owns that data (RLS + code check)
7. All monetary values stored as FLOAT in USD — display conversion happens at render time
8. Use TypeScript interfaces from types/index.ts — never use `any`
9. Loading states required for every async operation — never show blank screens
10. Error states required for every async operation — never show broken UI silently
11. All dates stored as UTC in database — convert to user timezone only at display time
12. Git commit message format: "feat: \[what]" or "fix: \[what]" or "refactor: \[what]"

\---

## Feature Build Status

> Legend: ✅ Done | 🔲 Not started | 🚧 Stub/partial

### Backend / Library layer

| File | Status | Notes |
|---|---|---|
| `lib/supabase.ts` | ✅ | createClient (anon) + createServiceClient (service role) |
| `lib/youtube-analytics.ts` | ✅ | 5 authenticated functions, revenue 401 fix |
| `lib/youtube-data.ts` | ✅ | 6 public Data API functions, velocity scoring |
| `lib/niche-engine.ts` | ✅ | detectNiche (Claude), findCompetitors, saveDetectedNiche |
| `lib/gap-scorer.ts` | ✅ | calculateGapScore, buildCompetitorMetrics, estimateRevenue, saveGapScore |
| `lib/db.ts` | ✅ | All snapshot/video/competitor CRUD + getCompetitorMetricsFromDB |
| `lib/trend-detector.ts` | ✅ | detectViralVideos, findUncoveredTopics (Claude), getTrendingInNiche |
| `lib/digest-generator.ts` | ✅ | Full Claude digest pipeline — best/worst videos, posting day, structured ideas, fallback mode, multi-niche test |
| `lib/idea-generator.ts` | ✅ | generateVideoIdeas — Claude Sonnet 4.6, 3 ranked ideas with score/why/angle/format/length, DB save + prune |
| `lib/revenue-benchmarks.ts` | ✅ | getNicheBenchmarks (12 niches), calculateRevenuePotential, getBenchmarkComparison, getSubscriberTier |
| `lib/email.ts` | ✅ | sendWeeklyDigest, sendTrendAlert, checkAndSendAlerts, generateUnsubscribeToken |
| `lib/stripe.ts` | 🔲 | Replaced by Lemon Squeezy — see webhook route |
| `lib/access.ts` | ✅ | canAccess, getCompetitorLimit, getIdeaLimit, getViralLimit, getTopicLimit, getArchiveWeeks, getUpgradeMessage |
| `lib/utils.ts` | 🔲 | Shared formatting/date utilities — added as needed |

### API routes

| Route | Status | Notes |
|---|---|---|
| `app/api/auth/[...nextauth]/route.ts` | ✅ | NextAuth v5 with Google + YouTube scopes |
| `app/api/sync/route.ts` | ✅ | Auth-gated + cron bypass (x-cron-user-id + x-cron-secret headers) |
| `app/api/cron/weekly-digest/route.ts` | ✅ | Runs every Monday 9am UTC; generateDigest for all active users |
| `app/api/cron/refresh-data/route.ts` | ✅ | Runs daily 3am UTC; calls /api/sync for every active user via cron bypass |
| `app/api/cron/trend-detection/route.ts` | ✅ | Runs every 6h; fetches competitor videos, calculates velocity + is_viral |
| `app/api/cron/daily/route.ts` | 🚧 | Old stub — superseded by the 3 dedicated cron routes above |
| `app/api/create-checkout-session/route.ts` | ✅ | Lemon Squeezy checkout redirect — Day 8 morning |
| `app/api/webhooks/lemonsqueezy/route.ts` | ✅ | LS webhook: subscription_created/updated/cancelled/payment_failed |
| `app/api/unsubscribe/route.ts` | ✅ | Token-based one-click unsubscribe, no auth required, returns styled HTML |
| `app/api/settings/notifications/route.ts` | ✅ | GET + POST notification prefs, auth required, validates multiplier range |

### App pages

| Page | Status | Notes |
|---|---|---|
| `app/(auth)/login/page.tsx` | ✅ | Google sign-in button |
| `app/(auth)/callback/page.tsx` | 🔲 | OAuth callback — not yet needed (NextAuth handles it) |
| `app/(dashboard)/layout.tsx` | ✅ | Auth guard + first-sync trigger |
| `app/(dashboard)/dashboard/page.tsx` | 🚧 | Sync loading state only; charts/data in Week 2 |
| `app/(dashboard)/competitors/page.tsx` | 🔲 | Competitor management UI — Week 2 |
| `app/(dashboard)/digest/page.tsx` | 🔲 | Weekly digest view — Week 2 |
| `app/(dashboard)/ideas/page.tsx` | 🔲 | Video idea suggestions — Week 2 |
| `app/(dashboard)/settings/page.tsx` | 🔲 | Settings page — Week 2 |
| `app/(dashboard)/settings/notifications/page.tsx` | 🔲 | Notification preferences — Week 2 |
| `app/page.tsx` | 🚧 | Placeholder only; full landing page — Week 3 |
| `app/pricing/page.tsx` | 🔲 | Pricing table — Week 3 |
| `app/privacy/page.tsx` | 🔲 | Legal — Week 3 |
| `app/terms/page.tsx` | 🔲 | Legal — Week 3 |

### Components

| Directory | Status | Notes |
|---|---|---|
| `components/sync-context.tsx` | ✅ | SyncProvider + useSyncStatus hook |
| `components/ui/` | 🔲 | Reusable UI primitives — Week 2 |
| `components/charts/` | 🔲 | Recharts wrappers — Week 2 |
| `components/dashboard/` | 🔲 | Dashboard-specific components — Week 2 |
| `emails/weekly-digest.tsx` | ✅ | React Email template: gap score badge, metrics, ideas, competitor moves, CTA |
| `emails/trend-alert.tsx` | ✅ | React Email template: viral video alert with suggested angle |

### Types

| File | Status | Notes |
|---|---|---|
| `types/index.ts` | ✅ | All 17 interfaces: User, ChannelSnapshot, Video, Competitor, CompetitorVideo, GapScore, Digest, Trend, UserSettings, VideoIdea, NicheResult, CompetitorCandidate, UserMetrics, CompetitorMetrics, MetricScore, RevenueEstimate, GapScoreResult |
| `types/next-auth.d.ts` | ✅ | NextAuth session type extensions |

### Scripts / Dev tooling

| Script | Status | Notes |
|---|---|---|
| `scripts/refresh-token.ts` | ✅ | Refresh expired OAuth token without browser re-login |
| `scripts/test-youtube-analytics.ts` | ✅ | Manual test for all 5 Analytics API functions |
| `scripts/test-youtube-data.ts` | ✅ | Manual test for all 6 Data API functions |
| `scripts/seed-test-data.ts` | ✅ | Inserts realistic finance creator test data into Supabase |
| `scripts/test-gap-scorer.ts` | ✅ | End-to-end DB → gap scorer → save pipeline test |
| `scripts/test-full-pipeline.ts` | ✅ | All 7 pipeline steps timed end-to-end with cost tracking |
| `scripts/create-ideas-table.ts` | ✅ | Provisions the ideas table in Supabase (run once) |
| `scripts/test-email.ts` | ✅ | Sends real weekly digest email to test user inbox |
| `scripts/test-trend-alert.ts` | ✅ | Sends real trend alert email + tests checkAndSendAlerts |
| `scripts/get-unsubscribe-token.ts` | ✅ | Prints unsubscribe token + test URL for the test user |
| `scripts/re-enable-notifications.ts` | ✅ | Re-enables digest + alerts for test user after unsubscribe testing |

---

## What Is Built So Far

> Update this section every Friday

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
* Handles 4 events:
  * `subscription_created` — extracts `user_id` from `meta.custom_data`, resolves plan from `variant_id` against `LEMONSQUEEZY_STARTER_VARIANT_ID` / `LEMONSQUEEZY_PRO_VARIANT_ID`, writes all subscription fields to users table.
  * `subscription_updated` — same logic as created; handles trial-to-paid conversion and plan changes.
  * `subscription_cancelled` — looks up user by subscription ID (falls back to customer ID), sets `subscription_status = 'cancelled'`, `subscription_plan = 'free'`.
  * `subscription_payment_failed` — looks up user by customer ID, sets `subscription_status = 'past_due'`.
* All other events are silently ignored with a log message.
* Always returns `{ received: true }` to acknowledge delivery.

**lib/access.ts** — plan gating

* `canAccess(userId, feature)` — loads user's subscription_status + subscription_plan + trial_ends_at. Resolves effective plan: on_trial/active/past_due → stored plan (past_due gets 3-day grace), expired trial → free, cancelled/free → free. Guards binary features: `digest:weekly` (starter+), `alerts:daily` (starter+), `search:compare` (pro only). Limit-based features are not blocked here — use the limit helpers instead.
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
* `SubscriptionStatus` updated: replaced `'trial'` and `'canceled'` with `'on_trial'` and `'cancelled'` to match Lemon Squeezy's actual status strings.
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

## Known Issues

> Update this section as issues are discovered

**Revenue 401 on non-monetized channels (fixed Day 2 morning):** YouTube Analytics API returns 401 with `reason: "unauthorized"` (not 403) when `estimatedRevenue` is requested for a non-monetized channel. Standard 401 handling (throw TOKEN_EXPIRED) would crash the entire request. Fix: inspect `errors[0].reason` — only throw TOKEN_EXPIRED when `reason === 'authError'`. All other 401s (including `reason === 'unauthorized'`) return null and trigger a silent retry without the revenue metric. Revenue fields return 0 rather than crashing.

**CTR estimation is a proxy, not real data (known limitation):** The gap scorer estimates competitor CTR as `(avgViews / subscriberCount) × 0.3`, capped at 15%. This is not real CTR data — YouTube doesn't expose it publicly. The 0.3 multiplier is a heuristic. Real CTR is only available through the Analytics API for the user's own channel. This means CTR gap scores for competitors are approximate. This is acceptable for v1 but should be flagged in the UI.

**Gap scorer weights are calibrated for finance niche (Day 3 decision):** The 35/30/25/10 weighting (views/CTR/watchTime/uploads) reflects what matters most for typical niches. Different niches (e.g. gaming where upload frequency matters a lot more) may need adjusted weights in a later milestone. For now all niches use the same weights.

**app/api/cron/daily/route.ts is a stub (superseded):** This route is no longer used. The 3 dedicated cron routes (`weekly-digest`, `refresh-data`, `trend-detection`) replace it entirely. The stub can be deleted in a cleanup pass.

**Vercel Hobby plan: one cron per day maximum:** Hobby plan crons cannot run more than once per day. The trend-detection cron was originally scheduled every 6 hours (`0 0,6,12,18 * * *`) and was downgraded to daily at 6 AM UTC (`0 6 * * *`) to fix Vercel deployment failures. Upgrading to Vercel Pro would allow the original 6-hour cadence.

**Supabase joined relation returns array, not object (fixed Day 5):** When using `select('*, competitors(*)')`, Supabase returns the joined table as an array even when at most one row matches. `lib/trend-detector.ts` was casting the result as a single object, causing a TypeScript build error on Vercel. Fixed by casting to array and reading index 0.

**React Email Preview requires string children (fixed Day 7):** `@react-email/components`'s `<Preview>` component has a TypeScript type of `ReactNode & string`, meaning numbers passed directly (`{gapScore}`, `{videoIdeas.length}`) cause a build error on Vercel even though they render fine locally. Fix: wrap numeric values with `String()` before interpolating inside `<Preview>`. Applies to any number or boolean in that component.

\---

## Key Decisions Made

> Record every major decision here with the reason

* Using Supabase over PlanetScale: better free tier, built-in auth helpers, RLS is powerful
* Using Resend over SendGrid: cleaner API, React Email components, better developer experience
* Using Stripe hosted checkout over custom payment form: saves 2+ weeks of work, PCI compliance handled
* Using Claude Sonnet 4.6 NOT Opus for production digests: 40% cheaper, quality difference negligible for this use case
* Web app not Chrome extension: extensions require store approval, cannot do server-side processing
* Three competitor tiers: Tier 1 (1x-3x user's subs), Tier 2 (3x-10x), beyond 10x excluded as not actionable. findCompetitors searches 0.5x-3x range but gap scorer filters to larger-than-user only.
* Vercel Hobby plan limits crons to once-per-day — trend detection downgraded from every 6 hours to daily at 6 AM UTC. Upgrade to Pro to restore 6-hour cadence.

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

*Last updated: 2026-04-15 — Day 8 night: payment failed email in LS webhook handler (Resend, try/catch, no unsubscribe footer); Day 8 evening: Lemon Squeezy checkout + webhook (4 events) + lib/access.ts plan gating; Day 7 night: lib/email.ts, React Email templates, unsubscribe route, notification settings API
Next update due: End of Week 2*

