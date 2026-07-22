# FIXES.md — Resolution of REVIEW.md findings

**Date:** 2026-07-21
**Gate after every PR:** `npx tsc --noEmit` ✅ and `npm run build` ✅ (both green throughout).
`npm run lint` has 26 **pre-existing** errors unrelated to this work (see Deferred §D1); every
file touched here lints clean. Nothing has been committed — changes are in the working tree.

Full per-finding notes are inline in `REVIEW.md` (each finding marked ✅/⏸️ with a one-liner).

---

## Findings → status → PR

| # | Finding | Severity | Status | PR |
|---|---------|----------|--------|----|
| 1 | `PAYPAL_MODE` checked against 3 different literals | **Critical** | ✅ Fixed | PR-3 |
| 2 | Competitor-video upserts / 42P10 "data never refreshes" | **Critical** | ✅ **Corrected + fixed** — the core claim was false (constraint existed); real bug was only `[id]/sync` | PR-1 + PR-2 |
| 3 | `refresh-data` + `user-sync` same schedule; timeout ceiling | High | ✅ Fixed | PR-5 |
| 4 | `dominator-refresh` unbacked upsert (42P10) | High | ✅ Fixed (constraint existed to add; error now checked) | PR-1 + PR-2 |
| 5 | Cron auth → `Bearer undefined`; not timing-safe | High | ✅ Fixed | PR-4 |
| 6 | `subscription/create` no idempotency (double charge) | Medium | ✅ Fixed | PR-6 |
| 7 | PayPal webhook no replay/ordering/idempotency | Medium | ✅ Fixed | PR-6 |
| 8 | `account/delete` skips cancel for past_due; leaves PII | Medium | ✅ Fixed | PR-6 |
| 9 | Pro→Starter downgrade doesn't prune competitors | Medium | ✅ Fixed (on webhook) | PR-6 |
| 10 | `saveChannelSnapshot` delete+reinsert race | Medium | ✅ Fixed | PR-1 + PR-2 |
| 11 | Thumbnail quota read-modify-write; no per-idea lock | Medium | ✅ Fixed | PR-7 |
| 12 | No input validation; no rate limiting on AI endpoints | Medium | ✅ Fixed (rate limit + body cap; zod not added) | PR-7 |
| 13 | Prompt-injection surface (competitor strings → prompts) | Medium | ✅ Fixed | PR-7 |
| 14 | `getUserPlan` re-queried per gate (N+1) | Medium | ✅ Fixed | PR-7 |
| 15 | Dead deps (`stripe`, `@stripe/stripe-js`, `@types/sharp`) | Low | ✅ Fixed | PR-8 |
| 16 | Tracked junk (`privacy-raw.html`, `youtube_creators.csv`) + README garbage | Low | ✅ Fixed (history-scrub flagged, §M4) | PR-8 |
| 17 | 192 `console.log` (some leaky) | Low | ✅ Partial — leaky ones removed; full sweep deferred (§D2) | PR-8 |
| 18 | `competitor_insights` orphan table | Low | ✅ Resolved — table already gone in prod | PR-1 (DB check) |
| 19 | Cron secret not constant-time | Low | ✅ Fixed (folded into #5) | PR-4 |
| 20 | CLAUDE.md stale + huge (Next 14 / Lemon Squeezy) | Low | ✅ Fixed (split + corrected) | PR-9 |
| 21 | Stale gating docstrings in `lib/access.ts` | Low | ✅ Fixed | PR-9 |
| 22 | Server route exceptions may not reach Sentry | Low | ✅ Fixed (`onRequestError`) | PR-8 |
| 23 | `getAccessToken` re-fetched each PayPal call | Low | ✅ Fixed (token cache) | PR-8 |

### Notable correction to the audit
The **second Critical** ("competitor data never refreshes") was **largely a false positive**.
DB inspection (2026-07-21) showed `competitor_videos` already has
`UNIQUE (competitor_id, youtube_video_id)`, so the refresh-data / trend-detection upserts
were working. The only genuinely-broken write was `competitors/[id]/sync` using a single-column
`onConflict: 'youtube_video_id'`. PR-2 standardized all four sites on the shared
`lib/db-videos.ts:upsertCompetitorVideos` regardless.

---

## What each PR changed (files)

- **PR-1** (migration only) — `supabase/migrations/20260721000000_codify_constraints.sql`: codified `competitor_videos` (already present), added `competitors_user_channel_unique`, `channel_snapshots_user_date_unique`. Applied + verified on prod.
- **PR-2** — `lib/db-videos.ts` (new), `app/api/cron/{refresh-data,trend-detection}/route.ts`, `app/api/competitors/[id]/sync/route.ts`, `app/api/competitors/track/route.ts`, `app/api/cron/dominator-refresh/route.ts`, `lib/db.ts` (`saveChannelSnapshot` → upsert).
- **PR-3** — `lib/paypal.ts` (`isLivePaypal`/`getPaypalBaseUrl`), `app/api/subscription/downgrade/route.ts`, `app/api/webhooks/paypal/route.ts` (always-verify), `lib/env-validation.ts`, `.env.example`, `deferred.md`.
- **PR-4** — `lib/cron-auth.ts` (new) + all 7 `app/api/cron/*/route.ts`.
- **PR-5** — `vercel.json` (stagger + `maxDuration`), `app/api/cron/user-sync/route.ts`, `app/api/cron/refresh-data/route.ts`.
- **PR-6** — `supabase/migrations/20260721010000_billing_hardening.sql` (new), `app/api/subscription/create/route.ts`, `app/api/webhooks/paypal/route.ts`, `app/api/account/delete/route.ts`, `lib/db.ts` (`recordWebhookEvent`, `updateUserSubscription`), `lib/plan-limits.ts` (`enforceCompetitorLimit`), `lib/paypal.ts` (`links`), `types/index.ts`.
- **PR-7** — `supabase/migrations/20260721020000_concurrency_cost_controls.sql` (new), `lib/rate-limit.ts` (new), `lib/access.ts` (atomic `reserveThumbnail`/`releaseThumbnail`, prefetched-plan params), `lib/utils.ts` (`sanitizeForPrompt`), `app/api/ideas/[id]/generate-thumbnail/route.ts`, `app/api/ideas/generate/route.ts`, `app/api/competitors/{insights,track}/route.ts`, `app/api/cron/cache-cleanup/route.ts` (reaper), `lib/competitor-insights.ts`, `lib/digest-generator.ts`, `app/(dashboard)/ideas/page.tsx`.
- **PR-8** — removed `stripe`/`@stripe/stripe-js`/`@types/sharp`; `git rm` junk files + 3 dead dirs; README fix; `lib/paypal.ts` (token cache + stripped logs); `app/api/subscription/create/route.ts` (stripped logs); `instrumentation.ts` (`onRequestError`).
- **PR-9** — lean `CLAUDE.md`; `docs/{schema,reference,buildlog,decisions,testing}.md` (new); `lib/access.ts` docstrings; `package.json` (`test` script).

---

## Intentionally deferred

- **D1 — 26 pre-existing ESLint errors.** Not introduced by this work; `next build` passes. Most are substantive react-compiler correctness errors (impure-function-in-render, setState-in-effect, use-before-declare, JSX-in-try/catch) across onboarding + competitor-tab + thumbnail-modal components. They need per-component refactoring **with visual/runtime verification**, so they warrant a dedicated PR rather than a blind sweep. (The audit's Phase-0 "lint clean" claim was inaccurate.)
- **D2 — Full `console.log` → structured-logging sweep.** The **leaky** logs (PayPal request body, verification headers/signatures, tokens, email prefixes) were removed. The remaining logs are non-sensitive operational tracing; converting all ~190 is low-priority.
- **D3 — zod / schema-validation layer.** Kept the existing per-field validators + added the body-size cap. A project-wide zod adoption was out of scope.
- **D4 — Downgrade enforcement on the route.** `enforceCompetitorLimit` runs on the `UPDATED`/`EXPIRED` **webhooks** (the moment the plan actually changes), **not** in the downgrade route — the route only initiates PayPal approval, so pruning there would wrongly deactivate competitors if the user abandons approval. Flag if you want optimistic route-side pruning too.
- **D5 — Test-infra overhaul.** `npm test` is a placeholder; the integration suite still targets prod Supabase. See `docs/testing.md`. A real runner + ephemeral test DB is a separate task.
- **D6 — Always-verify webhook in sandbox** requires a sandbox `PAYPAL_WEBHOOK_ID` (see §M2).

---

## Manual steps you still owe

### M1 — Migrations (all THREE already applied + verified on prod during this session)
- `20260721000000_codify_constraints.sql` — ✅ applied & verified.
- `20260721010000_billing_hardening.sql` — ✅ applied & verified.
- `20260721020000_concurrency_cost_controls.sql` — ✅ applied & verified.
If you rebuild a fresh/branch DB from migrations, run all three (they're idempotent). Optional cleanup of the PR-7 smoke-test row: `delete from public.rate_limits where endpoint='smoke-test';`

### M2 — Environment variables
- **`PAYPAL_MODE`** must be exactly `live` or `sandbox` in **every** environment (Vercel prod/preview + local). Boot now fails (`validateEnv`) on any other value, including the old `production`. For go-live set `PAYPAL_MODE=live`.
- **`PAYPAL_WEBHOOK_ID`** must be set for the **active** mode. The webhook now **always verifies** (no sandbox skip) — sandbox testing needs a sandbox webhook id, live needs the live one.

### M3 — Deploy ordering
Migrations are already on prod, so code can deploy directly. If deploying to a fresh environment, apply migrations **before** the code (the billing + quota + rate-limit code reads the new tables/functions/columns).

### M4 — Git history scrub (privacy)
`git rm` removed `youtube_creators.csv` from the working tree but **not from git history**. If that CSV contains real scraped creator PII, purge it from history with `git filter-repo` (or BFG) and force-push, then rotate anything sensitive. `privacy-raw.html` is likely non-sensitive.

### M5 — PayPal live-vs-sandbox end-to-end test (run in sandbox first, then live)
Verify DB **and** the PayPal dashboard at each step:

1. **Subscribe** — POST `/api/subscription/create` (Starter). Expect a PayPal approval URL; `users.pending_paypal_subscription_id` set. Double-click → **same** approval URL, no second subscription.
2. **Activate** — approve in PayPal → `BILLING.SUBSCRIPTION.ACTIVATED` webhook (verify it 200s and signature-verifies). Expect `subscription_status='active'`, `subscription_plan='starter'`, `paypal_subscription_id` set, `pending_*` cleared, and a row in `paypal_webhook_events`.
3. **Replay** the ACTIVATED webhook (same event id) → 200 `{duplicate:true}`, no state change.
4. **Upgrade then downgrade** (Pro→Starter) via `/api/subscription/downgrade` → approve → `BILLING.SUBSCRIPTION.UPDATED` → `subscription_plan='starter'` and competitors beyond 6 set `is_active=false` (check `enforceCompetitorLimit`).
5. **Cancel** — `/api/subscription/cancel` → `subscription_status='cancelled'`, `current_period_end` set, plan retained (grace). Later `EXPIRED` → plan `free` + excess competitors deactivated.
6. **Delete account** — `/api/account/delete` with a live sub → PayPal subscription cancelled (confirm on dashboard), user rows gone, and `sync_logs`/`error_logs` for the user removed (PII erasure).
7. **Rate limit** — hammer `/api/ideas/generate` >10×/min for one user → 429s; confirm `rate_limits` rows.
8. **Thumbnail quota** — generate up to the plan limit → next call 403; a failed generation refunds (used count doesn't rise); a second POST for the same idea while one is pending returns the same `job_id`.
