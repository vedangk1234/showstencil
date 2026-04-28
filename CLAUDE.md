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
│   ├── idea-generator.ts             ← video idea generation
│   ├── email.ts                      ← Resend email functions
│   ├── stripe.ts                     ← replaced by Lemon Squeezy (stub)
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
  sub\_niche TEXT,                          -- granular sub-niche detected by Claude
  sub\_niche\_keywords JSONB,               -- array of keyword strings
  sub\_niche\_confidence FLOAT,
  sub\_niche\_detected\_at TIMESTAMPTZ,
  subscription\_status TEXT DEFAULT 'free',
  subscription\_plan TEXT DEFAULT 'free',   -- 'free' | 'starter' | 'pro'
  lemon\_squeezy\_customer\_id TEXT,         -- replaces stripe_customer_id
  lemon\_squeezy\_subscription\_id TEXT,     -- replaces stripe_subscription_id
  current\_period\_end TIMESTAMPTZ,
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
  tier INTEGER,                    -- 1 = Tier1, 2 = Tier2, 3 = Dominator
  is\_auto\_detected BOOLEAN DEFAULT true,
  is\_active BOOLEAN DEFAULT true,
  is\_dominator BOOLEAN DEFAULT false,   -- true = Tier 3 dominator (>10x user subs)
  is\_searched BOOLEAN DEFAULT false,    -- true = manually searched and added by user
  searched\_at TIMESTAMPTZ,
  sub\_niche TEXT,
  sub\_niche\_keywords JSONB,
  sub\_niche\_match\_score FLOAT,
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

-- Dominator history (tracks which dominators have been assigned per user over time)
CREATE TABLE dominator\_history (
  id UUID PRIMARY KEY DEFAULT gen\_random\_uuid(),
  user\_id UUID REFERENCES users(id) ON DELETE CASCADE,
  channel\_id TEXT NOT NULL,
  channel\_name TEXT,
  detected\_at TIMESTAMPTZ DEFAULT NOW(),
  is\_current BOOLEAN DEFAULT true,
  replaced\_at TIMESTAMPTZ
);

-- User search history (enforces Starter plan monthly search limit)
CREATE TABLE user\_search\_history (
  id UUID PRIMARY KEY DEFAULT gen\_random\_uuid(),
  user\_id UUID REFERENCES users(id) ON DELETE CASCADE,
  channel\_id TEXT NOT NULL,
  searched\_at TIMESTAMPTZ DEFAULT NOW(),
  added\_as\_competitor BOOLEAN DEFAULT false
);

-- Cache for searched channels (avoid repeat YouTube API calls, TTL 7 days)
CREATE TABLE searched\_channels\_cache (
  channel\_id TEXT PRIMARY KEY,
  channel\_name TEXT,
  channel\_data JSONB,
  niche\_id TEXT,
  sub\_niche TEXT,
  sub\_niche\_keywords JSONB,
  cached\_at TIMESTAMPTZ DEFAULT NOW(),
  expires\_at TIMESTAMPTZ DEFAULT NOW() + INTERVAL '7 days',
  search\_count INTEGER DEFAULT 1
);

-- competitor_snapshots — daily historical data per competitor (migration 004)
CREATE TABLE IF NOT EXISTS competitor\_snapshots (
  id UUID PRIMARY KEY DEFAULT gen\_random\_uuid(),
  competitor\_id UUID NOT NULL REFERENCES competitors(id) ON DELETE CASCADE,
  snapshot\_date DATE NOT NULL,
  subscriber\_count INTEGER,
  total\_views BIGINT,
  video\_count INTEGER,
  avg\_views\_per\_video FLOAT,
  avg\_video\_length\_seconds INTEGER,
  upload\_frequency\_30d FLOAT,
  velocity\_score\_avg FLOAT,
  created\_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(competitor\_id, snapshot\_date)
);

-- New columns on competitors table (migration 004)
-- ALTER TABLE competitors ADD COLUMN IF NOT EXISTS video\_count INTEGER;
-- ALTER TABLE competitors ADD COLUMN IF NOT EXISTS avg\_views\_per\_video FLOAT;
-- ALTER TABLE competitors ADD COLUMN IF NOT EXISTS avg\_video\_length\_seconds INTEGER;
-- ALTER TABLE competitors ADD COLUMN IF NOT EXISTS upload\_frequency\_30d FLOAT;
-- ALTER TABLE competitors ADD COLUMN IF NOT EXISTS insights JSONB;
-- ALTER TABLE competitors ADD COLUMN IF NOT EXISTS insights\_generated\_at TIMESTAMPTZ;
-- ALTER TABLE competitors ADD COLUMN IF NOT EXISTS replacement\_locked\_until TIMESTAMPTZ;

-- Required migrations (run once in Supabase SQL editor):
-- File: supabase/migrations/002_competitors_phase1.sql
-- ALTER TABLE users ADD COLUMN IF NOT EXISTS sub_niche TEXT;
-- ALTER TABLE users ADD COLUMN IF NOT EXISTS sub_niche_keywords JSONB;
-- ALTER TABLE users ADD COLUMN IF NOT EXISTS sub_niche_confidence FLOAT;
-- ALTER TABLE users ADD COLUMN IF NOT EXISTS sub_niche_detected_at TIMESTAMPTZ;
-- ALTER TABLE users ADD COLUMN IF NOT EXISTS subscription_plan TEXT DEFAULT 'free';
-- ALTER TABLE users ADD COLUMN IF NOT EXISTS lemon_squeezy_customer_id TEXT;
-- ALTER TABLE users ADD COLUMN IF NOT EXISTS lemon_squeezy_subscription_id TEXT;
-- ALTER TABLE users ADD COLUMN IF NOT EXISTS current_period_end TIMESTAMPTZ;
-- ALTER TABLE competitors ADD COLUMN IF NOT EXISTS sub_niche TEXT;
-- ALTER TABLE competitors ADD COLUMN IF NOT EXISTS sub_niche_keywords JSONB;
-- ALTER TABLE competitors ADD COLUMN IF NOT EXISTS is_dominator BOOLEAN DEFAULT false;
-- ALTER TABLE competitors ADD COLUMN IF NOT EXISTS is_searched BOOLEAN DEFAULT false;
-- ALTER TABLE competitors ADD COLUMN IF NOT EXISTS searched_at TIMESTAMPTZ;
-- ALTER TABLE competitors ADD COLUMN IF NOT EXISTS sub_niche_match_score FLOAT;
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
| `lib/sub-niche-detector.ts` | ✅ | detectSubNiche (Claude), calculateSubNicheSimilarity — granular sub-niche within a broad niche |
| `lib/db.ts` (Day 13 additions) | ✅ | saveCompetitorSnapshot, getCompetitorSnapshots, getAllCompetitorSnapshotsForUser, updateCompetitorMetrics, saveCompetitorInsights, getCachedInsights |
| `lib/dominator-finder.ts` | ✅ | findDominatorsForUser — niche-specific rules (sub_niche match for gaming/fitness/tech/education, broad for others) |
| `lib/plan-limits.ts` | ✅ | PLAN_LIMITS config, getPlanLimits, canSearchThisMonth — Starter: 4 total/1 searched, Pro: 13/3 searched |
| `lib/competitor-matcher.ts` | ✅ | calculateTier, CompetitorMatch — tier from sub ratio, sub-niche enrichment |
| `lib/channel-search.ts` | ✅ | normalizeChannelInput (URL/handle/channelId), getChannelData, cache read/write — 7-day TTL |
| `lib/competitor-insights.ts` | ✅ | generateCompetitorInsights (Claude) — 6-8 typed insights; expanded with best/worst videos, revenue+RPM, gap scores, viral videos, subscriber growth trend; max_tokens 1800 |

### API routes

| Route | Status | Notes |
|---|---|---|
| `app/api/auth/[...nextauth]/route.ts` | ✅ | NextAuth v5 with Google + YouTube scopes |
| `app/api/sync/route.ts` | ✅ | Auth-gated + cron bypass; now also fires sub-niche detection fire-and-forget on first sync |
| `app/api/cron/weekly-digest/route.ts` | ✅ | Runs every Monday 9am UTC; generateDigest for all active users |
| `app/api/cron/refresh-data/route.ts` | ✅ | Runs daily 3am UTC; calls /api/sync for every active user via cron bypass |
| `app/api/cron/trend-detection/route.ts` | ✅ | Runs daily 6am UTC; fetches competitor videos, calculates velocity + is_viral |
| `app/api/cron/cache-cleanup/route.ts` | ✅ | Runs daily 2am UTC; purges expired searched_channels_cache + search_history >90 days |
| `app/api/cron/sub-niche-detection/route.ts` | ✅ | Runs daily 5am UTC; refreshes sub_niche for users missing it or stale >30 days |
| `app/api/cron/dominator-refresh/route.ts` | ✅ | Runs daily 4am UTC; finds + updates Dominator (Tier 3) competitor for all active users |
| `app/api/cron/daily/route.ts` | 🚧 | Old stub — superseded by the 5 dedicated cron routes above |
| `app/api/create-checkout-session/route.ts` | ✅ | Lemon Squeezy checkout redirect |
| `app/api/webhooks/lemonsqueezy/route.ts` | ✅ | LS webhook: subscription_created/updated/cancelled/payment_failed |
| `app/api/unsubscribe/route.ts` | ✅ | Token-based one-click unsubscribe, no auth required, returns styled HTML |
| `app/api/settings/notifications/route.ts` | ✅ | GET + POST notification prefs, auth required, validates multiplier range |
| `app/api/competitors/[id]/route.ts` | ✅ | GET single competitor row (auth + ownership check) |
| `app/api/competitors/search/route.ts` | ✅ | POST channel search — validates plan limit, normalises URL/handle/ID, checks cache, returns channel data |
| `app/api/competitors/track/route.ts` | ✅ | POST add searched channel as competitor — enforces plan slot limit, calculates tier + sub-niche match |
| `app/api/competitors/insights/route.ts` | ✅ | POST generate Claude insights for a specific competitor — loads user/competitor metrics, returns typed insights array |
| `app/api/users/detect-sub-niche/route.ts` | ✅ | POST trigger sub-niche detection — session auth or cron bypass, reads user videos from DB, calls Claude |

### App pages

| Page | Status | Notes |
|---|---|---|
| `app/(auth)/login/page.tsx` | ✅ | Google sign-in button |
| `app/(auth)/callback/page.tsx` | 🔲 | OAuth callback — not yet needed (NextAuth handles it) |
| `app/(dashboard)/layout.tsx` | ✅ | Auth guard + first-sync trigger |
| `app/(dashboard)/dashboard/page.tsx` | ✅ | Full dashboard: gap score panel, 5-metric strip, competitors table (Tier1+Tier2 only), trend radar, views chart, top ideas, "View all competitors →" link |
| `app/(dashboard)/competitors/page.tsx` | ✅ | Rebuilt: filter tabs (All/Tier1/Tier2/Dominator), CompetitorsTable, UpgradeBanner, PlanLimitIndicator |
| `app/(dashboard)/competitors/[id]/page.tsx` | ✅ | Per-competitor deep analysis: loads competitor + videos + user snapshots, renders CompetitorAnalysis (5 tabs) |
| `app/(dashboard)/digest/page.tsx` | ✅ | Weekly digest view: list of past digests with preview, gap score, status |
| `app/(dashboard)/ideas/page.tsx` | ✅ | Video idea suggestions: scored idea cards with why/angle/format/length |
| `app/(dashboard)/settings/page.tsx` | ✅ | Settings page: plan info, notification toggles, account actions |
| `app/(dashboard)/settings/notifications/page.tsx` | 🔲 | Dedicated notifications sub-page — only .gitkeep exists |
| `app/page.tsx` | 🚧 | Placeholder only; full landing page — Week 3 |
| `app/pricing/page.tsx` | ✅ | Pricing table: Free / Starter / Pro feature comparison + Lemon Squeezy checkout CTA |
| `app/privacy/page.tsx` | 🔲 | Legal — Week 3 |
| `app/terms/page.tsx` | 🔲 | Legal — Week 3 |

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
| `components/competitors/tabs/InsightsTab.tsx` | ✅ | Fetches Claude insights via /api/competitors/insights, renders typed insight cards |
| `components/ui/` | 🔲 | Reusable UI primitives — not yet extracted |
| `components/charts/` | 🔲 | Recharts wrappers — not yet extracted |
| `emails/weekly-digest.tsx` | ✅ | React Email template: gap score badge, metrics, ideas, competitor moves, CTA |
| `emails/trend-alert.tsx` | ✅ | React Email template: viral video alert with suggested angle |

### Types

| File | Status | Notes |
|---|---|---|
| `types/index.ts` | ✅ | All interfaces + additions: User (sub_niche fields, LS payment fields), Competitor (is_dominator, is_searched, sub_niche fields), PlanType, SubscriptionStatus updated to Lemon Squeezy strings |
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
| `scripts/update-gap-scores.ts` | ✅ | One-time script: sets watch_time=15, upload_freq=85, topic_coverage=NULL for test user |

---

## What Is Built So Far

> Update this section every Friday

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

## Key Decisions Made

> Record every major decision here with the reason

* Using Supabase over PlanetScale: better free tier, built-in auth helpers, RLS is powerful
* Using Resend over SendGrid: cleaner API, React Email components, better developer experience
* Using Stripe hosted checkout over custom payment form: saves 2+ weeks of work, PCI compliance handled
* Using Claude Sonnet 4.6 NOT Opus for production digests: 40% cheaper, quality difference negligible for this use case
* Web app not Chrome extension: extensions require store approval, cannot do server-side processing
* Three competitor tiers: Tier 1 (1x-3x user's subs), Tier 2 (3x-10x), Tier 3 = Dominator (>10x). findCompetitors searches 0.5x-3x range but gap scorer filters to larger-than-user only. Dominators are excluded from the dashboard strip — they appear only in /competitors with their own badge.
* Vercel Hobby plan limits crons to once-per-day — trend detection downgraded from every 6 hours to daily at 6 AM UTC. Upgrade to Pro to restore 6-hour cadence.
* Topic coverage removed from gap score display (Day 9): stub returns 0, showing it is misleading. Will be added back when topic analysis is implemented.
* Competitor plan limits (Day 10): Starter = 4 total (3 auto + 1 searched), Pro = 13 total (10 auto + 3 searched). Free plan gets 0 competitors — must upgrade to see any.
* Dominator matching uses niche-specific rules (Day 10): gaming/fitness/tech/education require sub-niche similarity; finance/beauty/travel/business/entertainment/diy/vlog/cooking use broad niche match. Avoids assigning a gaming Dominator to a fitness creator.
* Channel search cache (Day 11): searched_channels_cache TTL is 7 days. This avoids repeat YouTube API quota usage for popular channels searched by multiple users.
* Competitor insights use InsightsTab lazy-load pattern (Day 11): Claude insights are generated on-demand when the user clicks the Insights tab, not at page load. This avoids burning Claude API credits for users who never view insights.
* Manual competitor add always fetches full profile immediately on track (Day 15): `getCompetitorFullProfile` is called synchronously inside the track route after insert — the response is not returned until videos, metrics, and snapshot are written. This means the competitor detail page always shows real data immediately. The trade-off is ~2s added latency to the Track button, which is acceptable for a one-time action. If the YouTube API fails, the competitor row is kept and a warning is returned; data will sync overnight via the refresh-data cron.
* Publishing days show only the single dominant day, not top 3 (Day 16): Showing top 3 days across all historical videos creates noise — a creator who changed schedule 6 months ago would still show their old days. Decision: filter to last 30 days (60d/all fallback), then surface only the #1 day by count. If all days have count=1 in the window (no pattern), show "Varies" instead of a misleading day name. This applies identically in ContentTab and in the insights route so Claude never sees stale schedule data.
* Competitor insights max_tokens set to 1800 (Day 17): The expanded prompt passes ~4× more data (best/worst videos, gap scores, viral videos, subscriber growth, revenue). 1800 tokens gives Claude enough room to generate 6-8 thorough insights with specific numbers and concrete next actions in each. Higher than 1800 provides diminishing returns for 6-8 insights and increases cost per generation.
* Competitor insights prompt instructs 6-8 insights not 5-7 (Day 17): The additional data points (best/worst video patterns, viral title analysis, subscriber growth framing) each warrant their own insight. 5-7 forced Claude to merge distinct analyses; 6-8 produces cleaner, more actionable individual cards.
* Competitor data refresh never depends on user OAuth token (Day 17): The daily cron's competitor sync uses the YouTube DATA API (public, no auth). It is implemented as Block 2 — a completely independent try/catch that always executes after Block 1 (user channel sync) regardless of Block 1's outcome. This ensures competitors receive daily snapshots even when the user's token is expired or revoked.

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

*Last updated: 2026-04-28 — Day 17 (part 2): Decoupled competitor sync from user channel sync in refresh-data cron. Single try/catch per user split into two independent blocks: Block 1 (user OAuth channel sync) failure no longer skips Block 2 (competitor DATA API sync). Each competitor wrapped in its own try/catch. Invalid channel IDs (not UC-prefixed or not 24 chars) skipped with log. Snapshot guarded on non-null subscriber_count. Insights cache wiped per-user after Block 2. Result: Sarah/Marcus/Humphrey get daily snapshots even when user token is expired.
Previous Day 17 (part 1): Competitor insights expanded with 5 new data points: (1) best/worst 3 videos by view_count — lets Claude identify winning format patterns vs failing formats; (2) user revenue + RPM from latest snapshot — lets Claude quantify the dollar impact of closing specific gaps; (3) full gap scores (overall, per-metric, primary_bottleneck, estimated_revenue_gap) — Claude now prioritizes insights by calculated opportunity score rather than guessing; (4) competitor viral videos separated from top videos — Claude identifies the title/format pattern behind breakout moments and checks if the user has ever used it; (5) 30-day subscriber growth trend (net change, growth %, growing/flat/declining) — Claude frames recommendations differently based on whether the channel is growing (double down) or flat/declining (fix content-audience fit). Prompt rewritten to 6-8 insights with stricter rules: every sentence must contain a specific number, both channel names required, concrete next action at end of each description. JSON extraction made robust with regex array match. max_tokens set to 1800. All 9/9 validation checks passed on test run: Humphrey Yang insights named both channels, referenced specific video titles and views, gap scores, growth trend, viral pattern, and revenue impact.
Previous Day 16 (part 3): Fixed publishing days noise across ContentTab + insights pipeline. Root cause: top publishing days were computed from ALL synced videos regardless of age, pulling in old schedule data. Example: Humphrey Yang showed Thursday(11)/Wednesday(2)/Tuesday(1) from 15 total videos, but last 30 days was 4×Thursday + 1×Tuesday — the correct signal is Thursday only. Three files changed: (1) ContentTab.tsx — publishing days now filter to last 30 days first, fall back to 60 days if <3 videos, then all videos. Only the single top day is shown (highest upload count). If all days have count=1 (no pattern), shows "Varies" + "Consistent uploading on different days" caption. Window label ("Based on last 30 days uploads" vs "60 days" vs "all synced") shown below. (2) insights/route.ts — same 30d→60d→all fallback applied before building dayCounts. publishingDays now passes only the single top day as a 1-element array, or ["Varies — consistent uploading on different days"]. (3) competitor-insights.ts — prompt label updated from "Publishing days:" to "Top publishing days (last 30 days):" so Claude knows the data is recent. After deploy: clear affected competitor's insights cache via `UPDATE competitors SET insights=null, insights_generated_at=null WHERE channel_name ILIKE '%<name>%' AND user_id=(SELECT id FROM users WHERE email='vedangk2912@gmail.com')` then regenerate.
Previous Day 16 (part 2): Fixed two bugs in competitor insights generation: (1) competitor-insights.ts was multiplying avg_ctr by 100 again in the Claude prompt — stored value is already a percentage (2.86 = 2.86%), so Claude was seeing 286%. Removed ×100. (2) insights/route.ts was computing user upload frequency as videos_count/52 (lifetime total ÷ 52 weeks) — completely wrong for any channel. Replaced with a Supabase COUNT query on videos.published_at >= 30 days ago. Competitor upload frequency was also dividing upload_frequency_30d by 4.3 to get per-week — now passes upload_frequency_30d directly as per-month (matching its stored unit). Both prompt labels updated to "videos/month (last 30 days)". Graham Stephan's cached insights cleared via Supabase SQL for regeneration.
Previous Day 16 (part 1): 5 competitor detail page bugs fixed: CTR showing 286% (removed ×100 from display + digest prompt); competitor videos not inserting on manual add (upsert→delete+insert, constraint didn't exist); upload frequency contradiction (getCompetitorMetricsFromDB now reads upload_frequency_30d, digest uses countVideosLast30Days, all labelled "videos/month last 30d"); total videos gap showing — (now computes compVideoCount−userVideoCount); viral video count now shows 0 not — when videos are loaded but none are viral. Graham Stephan's 15 videos synced via scripts/sync-competitor-videos.ts.
Previous: 2026-04-28 — Day 15 (part 2): Weekly digest email fixed — sendWeeklyDigest now called from generateDigest, FROM_EMAIL fallback changed to onboarding@resend.dev, checkAndSendAlerts status filter corrected. Email confirmed delivered. Day 15 (part 1): Manual competitor add now fetches full profile immediately on track (videos, metrics, snapshot). lib/competitor-metrics.ts added. is_dominator fixed to tier===3. OverviewTab/ContentTab null-safe ("—" not "0"). InsightsTab 422 retryable state. Tier badge fallback from userSubscriberCount. CLAUDE.md Known Issues + Key Decisions updated.
Previous: 2026-04-27 — Day 14 (part 2): Dashboard metric strip null-guard (filter to validSnapshots), saveChannelSnapshot null write guard, seed script competitor dedup fix (match by channel_name not youtube_channel_id), null snapshot cleanup step in seed, duplicate competitor rows removed from DB. Day 14 (part 1): Cron wiring (refresh-data writes competitor metrics + snapshots, wipes insights cache; dominator-refresh skip-if-exists), insights route fixed to use on-row cache, dashboard UI overhauled (SubscriberGrowthChart, niche avg line, gap unit labels, 1 top idea), competitor tabs rewritten (OverviewTab, ContentTab, VideosTab), manual add lock wired end-to-end (track route + ChannelSearchBar modal + competitors page lock query).
Previous: 2026-04-26 — Day 13: Database foundation — competitor_snapshots table, 7 new columns on competitors, 6 new lib/db.ts functions, seed script fully rewritten to upsert mode with 31-day history for user + all 3 competitors, correct tier distribution (Tier1/Tier2/Dominator), 15 own videos.
Previous: 2026-04-26 — Day 12: Cron sync fixed — wrong subscription_status filter + token expiry auto-refresh.
Next update due: End of Week 3*

