# SHOWSTENCIL — Project Context for Claude Code

> Read this before writing code. This file is intentionally lean; detailed reference
> lives in `docs/` (see the Documentation Map at the bottom). Keep this file under ~200
> lines — put schema, build history, and decisions in `docs/`, not here.

## What We Are Building

ShowStencil is a YouTube analytics SaaS for US-based content creators (10K–500K subs).
It finds a creator's niche competitors automatically, compares their metrics across ~35
data points, and uses Claude to generate a personalised weekly digest telling them exactly
what to change to grow.

Pricing: Free (1 competitor, 1 idea, monthly digest) · Starter $29/mo (6 competitors, 3
ideas, weekly digest + alerts) · Pro $79/mo (13 competitors, 10 ideas, all features).

## Tech Stack — Do Not Deviate

| Layer | Tool | Notes |
|-------|------|-------|
| Framework | **Next.js 16 (App Router), React 19** | react-compiler enabled. (Historical docs say "Next 14" — that is stale.) |
| Language | TypeScript (strict) | No `any`; use interfaces from `types/index.ts`. |
| Styling | Tailwind CSS only | No custom CSS files. |
| Database | Supabase (PostgreSQL) | Auth + DB. RLS on. |
| Auth | NextAuth.js v5 | Google OAuth with YouTube scopes. |
| Charts | Recharts | |
| Email | Resend + React Email | |
| Payments | **PayPal Subscriptions API** | Replaced Lemon Squeezy (Day 41) which replaced Stripe. Any "Stripe"/"Lemon Squeezy" reference is stale. |
| AI (digest/ideas/insights) | Anthropic Claude Sonnet (`claude-sonnet-4-6`) | NOT Opus — cost control. |
| AI (thumbnails) | Google Gemini (`gemini-2.5-flash-image`) | |
| Hosting | Vercel (Hobby — 60s function ceiling) | Auto-deploy from GitHub. |
| Monitoring | Sentry + UptimeRobot | |

## Commands

```bash
npm run dev                 # local dev
npm run build               # production build — the real release gate
npx tsc --noEmit            # typecheck
npm run lint                # eslint (note: has pre-existing errors unrelated to new work; see FIXES.md)
npm test                    # placeholder — see docs/testing.md before running any suite
npx tsx --env-file=.env.local scripts/health-check.ts   # read-only prod invariant check
```

Run `npx tsc --noEmit && npm run build` before considering any change done.

## Coding Conventions

1. All DB access goes through `lib/db.ts` (+ `lib/db-videos.ts` for competitor videos) — never query Supabase directly from components.
2. All YouTube calls in `lib/youtube-analytics.ts` (authed) or `lib/youtube-data.ts` (public).
3. All PayPal calls in `lib/paypal.ts`. Environment selected via `isLivePaypal()` / `getPaypalBaseUrl()` (canonical `PAYPAL_MODE` = `live` | `sandbox`).
4. Never expose `SUPABASE_SERVICE_ROLE_KEY` / `ANTHROPIC_API_KEY` / PayPal secrets to the client.
5. Every API route checks auth first. Every data-modifying route validates ownership in the DB `WHERE` clause (RLS + code).
6. Cron routes guard with `assertCron(request)` from `lib/cron-auth.ts` (timing-safe).
7. Errors: log via `logError` (→ `error_logs` table, never throws). Sync attempts via `logSyncAttempt` (→ `sync_logs`).
8. Rate-limit expensive AI endpoints with `checkRateLimit` (`lib/rate-limit.ts`).
9. Sanitize external strings (channel names/titles) with `sanitizeForPrompt` before embedding in any LLM prompt.
10. All money stored as FLOAT USD; all dates stored UTC, converted at render time.
11. Loading + error states required for every async UI operation.
12. Git commit format: `feat: […]` / `fix: […]` / `refactor: […]`.

## Key Libraries (quick map)

- `lib/access.ts` — plan gating. `resolveUserPlan(userId)` resolves the effective plan once; gate helpers (`getCompetitorLimit`, `getIdeaLimit`, `canGenerateThumbnail`, …) accept an optional pre-fetched plan. Atomic thumbnail quota via `reserveThumbnail` / `releaseThumbnail`.
- `lib/plan-limits.ts` — `PLAN_LIMITS`, `getPlanLimits`, `enforceCompetitorLimit` (prunes competitors on downgrade).
- `lib/sync-logic.ts` — `syncUserChannel` (callable without HTTP; used by `/api/sync` and the user-sync cron).
- `lib/niche-engine.ts`, `lib/niches.ts` — 31-niche taxonomy + Claude niche detection + competitor auto-detection.
- `lib/gap-scorer.ts`, `lib/competitor-insights.ts`, `lib/digest-generator.ts` — the intelligence pipeline.

## Crons (vercel.json — staggered; `maxDuration: 60` on the sync-heavy ones)

`cache-cleanup` 02:00 · `refresh-data` 03:00 · `user-sync` 03:30 · `dominator-refresh` 04:00
· `sub-niche-detection` 05:00 · `trend-detection` 06:00 · `weekly-digest` Mon 09:00 (UTC).
`user-sync` and `refresh-data` process bounded batches (≤25 users) with a soft deadline and
log a summary to `sync_logs`.

## Environment Variables

Full list + descriptions in `.env.example`. Required at boot (validated by
`lib/env-validation.ts`, called from `instrumentation.ts`): `NEXTAUTH_URL`,
`NEXTAUTH_SECRET`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `NEXT_PUBLIC_SUPABASE_URL`,
`NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `ANTHROPIC_API_KEY`,
`CRON_SECRET`, `PAYPAL_MODE` (`live`|`sandbox`).

## Documentation Map

Detailed reference (moved out of this file in PR-9 to keep context lean):

- **`docs/schema.md`** — full database schema (all tables + columns).
- **`docs/reference.md`** — folder structure, env var reference, YouTube API scopes/quota, core business logic (gap-score weights, CPM benchmarks, viral threshold, digest prompt), plan gating detail.
- **`docs/buildlog.md`** — chronological build log ("What Is Built So Far"), feature build status tables, security audit log, Known Issues, and Planned-But-Not-Built.
- **`docs/decisions.md`** — key architectural decisions + rationale.
- **`docs/testing.md`** — testing status + the prod-Supabase guard rails.
- **`REVIEW.md`** / **`FIXES.md`** — the 2026-07-21 audit and the fixes applied.

> Migrations are the source of truth for DB state; `docs/schema.md` documents it. When they
> disagree, trust `supabase/migrations/` + the live DB.
