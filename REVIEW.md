# ShowStencil — Codebase Audit (REVIEW.md)

**Audit date:** 2026-07-21
**Scope covered so far:** Phase 0 (ground truth), Phase 1 (security), Phase 2 (correctness/silent failures), Phase 3 (billing/gating). Phases 4–6 partially covered; see "Coverage & Next Steps" at the bottom.
**Method:** Static read of routes → lib → db → migrations. Where a claim depends on the *live* Supabase schema (constraints that were created manually, not via migration), it is flagged **VERIFY-ON-DB** — but migration history + documented past incidents make these high-confidence.

---

## Executive summary

The codebase is functionally complete and defensively coded in many places (errors are logged, sync degrades gracefully). But there are **two Critical, latent, silent failures** that would bite at go-live:

1. **PayPal `PAYPAL_MODE` is compared against three different string values in three files.** No single env value makes create/cancel, downgrade, and webhook-verify all agree. Following the repo's own runbook (`PAYPAL_MODE=live`) routes real subscription creation to **sandbox** while downgrade hits **live** — i.e. no real money is captured and webhooks fail verification.
2. **Every competitor-video `upsert` targets an `onConflict` that no migration ever creates.** The team already hit this exact 42P10 error once and fixed *one* call site (track route → delete+insert) but left the daily `refresh-data` cron, `trend-detection` cron, `dominator-refresh` cron, and manual `[id]/sync` still using the broken upsert. The product's core value ("compare to competitors") therefore runs on **data that never refreshes**.

Both are the same failure class the project history warns about (swallowed constraint errors, enum drift). Neither shows up in `tsc`/`lint`/`build` — all pass clean.

---

## Findings by severity

Count: **2 Critical · 3 High · 9 Medium · 8 Low**

---

### CRITICAL

**[Critical] [BILLING] `PAYPAL_MODE` is checked against 3 different literals — no value is consistent** — ✅ FIXED (PR-3)
> Added `isLivePaypal()` + `getPaypalBaseUrl()` in `lib/paypal.ts` as the single source of truth (canonical values `'live' | 'sandbox'`, throws on anything else). Downgrade route dropped its local `PAYPAL_BASE`; webhook now **always** verifies (removed the sandbox-skip). `PAYPAL_MODE` added to `env-validation.ts` (required + allowed-value check). `.env.example` + `deferred.md` note the canonical values.
- `lib/paypal.ts:12` → `=== 'production'` selects live URL (else sandbox). Used by `getAccessToken`, `createSubscription`, `cancelSubscription`, `getSubscriptionDetails`, `verifyWebhookSignature`.
- `app/api/subscription/downgrade/route.ts:8` → `=== 'live'` selects live URL.
- `app/api/webhooks/paypal/route.ts:37` → `=== 'sandbox'` *skips* signature verification.
- `.env.example:23` documents `PAYPAL_MODE=sandbox … 'live' for production`; `deferred.md:25` runbook says set `PAYPAL_MODE=live`.
- **Failure scenario:** Operator ships with `PAYPAL_MODE=live` (per their own runbook). `lib/paypal.ts` sees `'live' !== 'production'` → talks to **sandbox** for all subscription create/cancel/verify. `downgrade` sees `'live'` → talks to **live**. Result: users "subscribe" against sandbox (no charge, no revenue), the webhook tries to verify a live-signed event against a token minted on sandbox → verification fails → subscriptions never activate. If instead they set `PAYPAL_MODE=production`, downgrade breaks (falls to sandbox). There is **no** value that makes all three agree.
- **Fix:** One helper (e.g. `isLivePaypal()` in `lib/paypal.ts`) that all three call. Pick one canonical literal (`'live'`, matching `.env.example`/runbook), update `getBaseUrl` and the webhook skip-check to use it, and delete the local `PAYPAL_BASE` in the downgrade route in favor of the shared helper. Add `PAYPAL_MODE` to `env-validation.ts` with an allowed-values check.

**[Critical] [DATA] Competitor-video upserts use an `onConflict` with no matching unique constraint (42P10) — competitor data never refreshes** — ✅ CORRECTED + FIXED (PR-2)
> **DB verification (2026-07-21) overturned the core claim:** `competitor_videos` DOES have `competitor_videos_unique UNIQUE (competitor_id, youtube_video_id)` in prod. So refresh-data / trend-detection upserts were working — competitor data was NOT frozen. The ONLY genuinely-broken site was `competitors/[id]/sync` using single-column `onConflict: 'youtube_video_id'`. Fix: all 4 video-write sites now route through `lib/db-videos.ts:upsertCompetitorVideos` (correct onConflict, error logged not swallowed); track route converted from delete+insert to the same upsert; constraint codified in migration `20260721000000`.
- `app/api/cron/refresh-data/route.ts:156` → `upsert(videos, { onConflict: 'competitor_id,youtube_video_id' })`
- `app/api/cron/trend-detection/route.ts:136` → same `onConflict`
- `app/api/competitors/[id]/sync/route.ts:90` → `onConflict: 'youtube_video_id'` (different, also unbacked)
- No migration adds a UNIQUE/exclusion constraint on `competitor_videos`. The base table was created manually from the CLAUDE.md schema, which lists **no** UNIQUE. CLAUDE.md "Known Issues" (2026-04-28) explicitly documents this exact 42P10 and fixed it in `competitors/track` by switching to delete+insert — but left every other call site on `upsert`.
- **Failure scenario:** Nightly `refresh-data` computes fresh videos, calls upsert → Postgres returns `42P10 there is no unique or exclusion constraint matching the ON CONFLICT specification`. The route checks the error and returns `{ success:false, count:0 }` (line 158–160), so it never crashes — it just silently writes nothing. Competitor videos, velocity, and viral flags are frozen at whatever the manual track-route delete+insert last wrote. Every downstream surface (gap score, insights, digest, trend alerts) uses stale competitor data.
- **Fix:** Add `ALTER TABLE competitor_videos ADD CONSTRAINT competitor_videos_unique UNIQUE (competitor_id, youtube_video_id);` as a migration, then standardize all four call sites on `onConflict: 'competitor_id,youtube_video_id'`. Fix `[id]/sync` which also uses the wrong single-column target.

---

### HIGH

**[High] [CRON] `refresh-data` and `user-sync` both scheduled at `0 3 * * *`; `user-sync` self-documents a 10s-timeout ceiling at ~2 users** — ✅ FIXED (PR-5)
> `vercel.json`: `user-sync` moved to `30 3 * * *` (staggered off refresh-data 3:00); `maxDuration: 60` added for user-sync/refresh-data/trend-detection/dominator-refresh (60 = Vercel Hobby ceiling — raising to 300+ needs Pro + Fluid Compute, noted in FIXES.md). `user-sync` now loads ≤25 users (most-active-first), processes in 5-wide chunks with a 45s soft deadline, counts `skipped`, and bounds the stale-token cleanup. `refresh-data` loads ≤25 users with a 50s deadline + skipped count. Both write a summary row to `sync_logs`.
- `vercel.json` schedules `/api/cron/refresh-data` and `/api/cron/user-sync` at the same minute (`0 3 * * *`).
- `app/api/cron/user-sync/route.ts:10-14` header: "~3-5s per user … At ~2 users we approach the 10s Vercel Hobby function timeout." It `Promise.allSettled`s **all** users in one invocation with no batching.
- Only `generate-thumbnail` has `maxDuration` set in `vercel.json`; every cron runs on the default timeout.
- **Failure scenario:** Beyond a handful of active users, `user-sync` exceeds the function timeout and is killed mid-loop. Users past the cutoff silently never sync; `Promise.allSettled` results for killed work are lost. Simultaneously `refresh-data` competes for the same 3am window and YouTube quota. No alert fires.
- **Fix:** Stagger schedules (e.g. refresh-data 3:00, user-sync 3:30). Add `maxDuration` (Fluid Compute allows up to 800s) for the sync crons. Batch users (offset/limit per invocation) or fan out. Add a runtime/quota budget check.

**[High] [DATA] `dominator-refresh` upsert `onConflict: 'user_id,youtube_channel_id'` — no such unique constraint on `competitors` (42P10)** — ✅ FIXED (PR-1 + PR-2)
> Confirmed absent on DB (2026-07-21). Added `competitors_user_channel_unique UNIQUE (user_id, youtube_channel_id)` in migration `20260721000000`, and the previously-unchecked upsert error is now captured + logged via `logError`.
- `app/api/cron/dominator-refresh/route.ts:88,105`
- No migration defines a unique constraint on `competitors(user_id, youtube_channel_id)` (002 only adds columns). Same class as the Critical above.
- **Failure scenario:** The daily dominator refresh upsert 42P10-fails; the Tier-3 dominator competitor is never inserted/updated via cron.
- **Fix:** Add the unique constraint (matches the intended dedup key) and keep the upsert, or switch to explicit select-then-insert/update. Verify whether the error is checked in this route.

**[High] [SECURITY] Cron auth compares against `Bearer ${CRON_SECRET}` — becomes `Bearer undefined` if the env var is ever unset** — ✅ FIXED (PR-4)
> New `lib/cron-auth.ts:assertCron(req)` — hard-fails 500 when `CRON_SECRET` is falsy (never compares against "Bearer undefined") and uses length-guarded `crypto.timingSafeEqual`. All 7 cron routes now call it. (This also resolves the Low "not constant-time" finding.)
- All 7 cron routes: `if (authHeader !== \`Bearer ${process.env.CRON_SECRET}\`)`. Not timing-safe.
- **Mitigation present:** `instrumentation.ts` calls `validateEnv()` (which requires `CRON_SECRET`) on nodejs startup, so a missing secret should crash boot. This downgrades exploitability — but relies on `register()` actually aborting request serving on throw (not guaranteed across Next versions), and edge runtime doesn't run `validateEnv`.
- **Failure scenario:** If `validateEnv` is ever bypassed/edge-routed, or a future refactor drops the boot check, `Authorization: Bearer undefined` authenticates any caller to every cron (triggering syncs, wiping caches, sending digests, revoking tokens).
- **Fix:** Extract a shared `assertCron(req)` helper that (a) hard-fails if `CRON_SECRET` is falsy and (b) uses `crypto.timingSafeEqual`.

---

### MEDIUM

**[Medium] [BILLING] No idempotency in `subscription/create` — double-click = double subscription = double charge** — ✅ FIXED (PR-6)
> `subscription/create` now 409s when the user already has an active/on_trial/past_due sub with a `paypal_subscription_id`; if an approval-pending create exists (`pending_paypal_subscription_id`), it returns that existing approval link instead of minting a second subscription. ACTIVATED clears the pending marker. (New `users.pending_paypal_subscription_id` column — migration `20260721010000`.)
- `app/api/subscription/create/route.ts` never checks whether the user already has an active/pending PayPal subscription before calling `createSubscription`.
- **Scenario:** User double-clicks "Upgrade". Two PayPal subscriptions are created. The later `BILLING.SUBSCRIPTION.ACTIVATED` webhook overwrites `paypal_subscription_id`, orphaning the first subscription — which keeps billing the customer with no way for the app to cancel it (it's no longer referenced).
- **Fix:** Before creating, reject if `subscription_status` is active/on_trial/past_due and a `paypal_subscription_id` exists; or dedupe by looking up existing pending subs.

**[Medium] [BILLING] PayPal webhook has no replay / out-of-order / idempotency protection** — ✅ FIXED (PR-6)
> New `paypal_webhook_events` table (migration `20260721010000`); the webhook records each PayPal event id first and skips duplicates/replays (`recordWebhookEvent`). RE-ACTIVATED now looks up the user by subscription id (`resource.id`) instead of the unreliable `custom_id`. CANCELLED/EXPIRED/SUSPENDED already look up by subscription id, so a stale-sub event can't match the wrong user. Added a BILLING.SUBSCRIPTION.UPDATED handler for plan changes.
- `app/api/webhooks/paypal/route.ts` processes each event with no dedup on `transmission_id`/event id, and no ordering guard.
- **Scenarios:** (a) A replayed `EXPIRED` after a legit re-activation downgrades a paying user to free. (b) `CANCELLED`/`EXPIRED` arriving before `ACTIVATED` → `getUserByPayPalSubscriptionId` returns null → silently dropped (the mapping is only set by ACTIVATED). (c) `BILLING.SUBSCRIPTION.RE-ACTIVATED` handler (line 245) relies on `resource.custom_id`, which PayPal does not reliably include on re-activation events → silently no-ops.
- **Fix:** Persist processed `transmission_id`s (or PayPal event `id`) and skip duplicates; look up user by subscription id (not custom_id) in RE-ACTIVATED; ignore state transitions that move backwards.

**[Medium] [BILLING/PII] `account/delete` skips PayPal cancel for `past_due`/`cancelled`; leaves PII in `sync_logs`** — ✅ FIXED (PR-6)
> `account/delete` now fetches the real remote status via `getSubscriptionDetails` and cancels any subscription not already CANCELLED/EXPIRED (blind-cancel fallback if PayPal is unreachable). GDPR erasure: explicitly deletes the user's `sync_logs` + `error_logs` rows (both are ON DELETE SET NULL, so they'd otherwise survive with PII) before deleting the user row.
- `app/api/account/delete/route.ts:24-28` only cancels when status is `active` or `on_trial`. A `past_due` (suspended) subscription is left live on PayPal → can be un-suspended and keep charging a deleted account.
- Deletion removes user-owned rows but `sync_logs` (email, ip, city, user_agent — PII) and `error_logs` only `SET NULL` on `user_id`; the PII columns remain.
- **Fix:** Attempt cancel for any non-expired subscription id regardless of status. Scrub or delete `sync_logs`/`error_logs` rows for the user (GDPR erasure).

**[Medium] [GATING] Pro→Starter downgrade does not prune competitors above the new limit** — ✅ FIXED (PR-6)
> New `enforceCompetitorLimit(userId)` in `lib/plan-limits.ts` keeps the oldest-added `totalCompetitors` active and sets `is_active=false` on the excess (crons already filter `is_active`). Runs on the BILLING.SUBSCRIPTION.UPDATED webhook (plan change) and on EXPIRED (→ free). Note: enforced on the webhook, not the downgrade *route*, because the route only initiates the PayPal approval — the plan hasn't changed yet when it returns (documented in FIXES.md).
- `getCompetitorLimit` (lib/access.ts:117) returns 6 for starter, but nothing removes the extra rows a former Pro user has (up to 13). Enforcement is only at add-time.
- **Scenario:** A downgraded user retains full Pro competitor coverage (13 tracked channels, all synced by crons) while paying the Starter price.
- **Fix:** On downgrade activation (webhook or a reconciliation cron), deactivate competitors beyond the plan limit (lowest priority / most-recently-added first).

**[Medium] [CONCURRENCY] `saveChannelSnapshot` delete+reinsert with no `UNIQUE(user_id, snapshot_date)` — concurrent syncs duplicate or lose today's snapshot** — ✅ FIXED (PR-1 + PR-2)
> Added `channel_snapshots_user_date_unique UNIQUE (user_id, snapshot_date)` (migration `20260721000000`); `saveChannelSnapshot` now reads-then-**upserts** on that key instead of delete+insert, so a manual sync racing the cron can neither duplicate nor drop today's row.
- `lib/db.ts` saveChannelSnapshot reads the existing today row, deletes, then inserts (to preserve enriched fields). No unique constraint on `channel_snapshots(user_id, snapshot_date)` exists in any migration.
- **Scenario:** Manual `/api/sync` (user opens dashboard) races the 3am `user-sync` cron. Both read → both delete → both insert → two rows for the same day, or a lost update of enriched fields. Dashboard reads `snapshots[length-1]` and may pick the partial one.
- **Fix:** Add `UNIQUE(user_id, snapshot_date)` and switch to a single upsert; or wrap in a transaction/advisory lock. Also add app-level guard against overlapping manual+cron sync.

**[Medium] [CONCURRENCY] Thumbnail quota is a read-modify-write + no per-idea lock** — ✅ FIXED (PR-7)
> `reserve_thumbnail_quota` RPC (migration `20260721020000`) does the monthly reset + under-limit increment atomically and returns allowed/used; the route reserves up-front and `release_thumbnail_quota` refunds on failure (so failures don't burn quota). Per-idea in-flight guard: an existing `pending`/`processing` job for the idea returns that job instead of starting a second generation. `canGenerateThumbnail` is now a pure read (no racy reset write).
- `app/api/ideas/[id]/generate-thumbnail/route.ts:160-163` sets `thumbnails_generated_this_month = quotaUsed + 1` from a value read earlier; `canGenerateThumbnail` also does a read-modify-write reset.
- **Scenario:** Two concurrent generations both read `quotaUsed=5`, both write `6` → one free generation. Also, the "return existing thumbnail" guard only catches *already completed* thumbnails; two rapid POSTs for the same idea both pass the guard, both create jobs, both burn quota, both call Gemini.
- **Fix:** Atomic increment (Postgres `update … set x = x + 1` via RPC or `.update` with a returned check), and a per-idea in-flight guard (job status `pending` check before creating a new one).

**[Medium] [SECURITY] No input-validation layer; expensive AI endpoints have no rate limiting** — ✅ FIXED (PR-7)
> DB-backed fixed-window limiter (`rate_limits` table + `check_rate_limit` RPC, migration `20260721020000`; `lib/rate-limit.ts`, default 10/min + 100/day per user per endpoint, fail-open) applied to `ideas/generate`, `ideas/[id]/generate-thumbnail`, `competitors/insights`, `competitors/track`. Body-size cap: generate-thumbnail rejects `photo_data` over 2MB decoded (413). Stuck-job reaper: cache-cleanup flips `pending`/`processing` thumbnail jobs older than 30 min to `failed`. (zod not added — kept the existing ad-hoc validators.)
- No zod/schema validation anywhere. `ideas/generate`, `generate-thumbnail`, `competitors/insights` accept bodies with ad-hoc checks only. There is no per-user rate limiter.
- `photo_data` (base64 image) in generate-thumbnail has no size cap (Vercel's 4.5MB body limit is the only ceiling).
- **Scenario:** A Pro user scripts a loop against `ideas/generate` / `generate-thumbnail`; each call costs real Claude/Gemini spend. The DB-flag gate (`ideas_refresh_available`) is the only brake and is reset weekly, not a true rate limit.
- **Fix:** Add a lightweight rate limiter (per-user, per-endpoint) and a body-size guard; consider zod for all POST bodies.

**[Medium] [SECURITY] Prompt-injection surface: competitor-controlled strings flow unescaped into Claude/Gemini prompts** — ✅ FIXED (PR-7)
> `sanitizeForPrompt` (lib/utils.ts) collapses whitespace/newlines and truncates channel names ≤100 / titles ≤150; applied at every external-string injection point in `lib/competitor-insights.ts`, `lib/digest-generator.ts`, and `app/api/ideas/generate/route.ts`. Each of those prompts now carries an explicit "names/titles are data, not instructions" preamble.
- Channel names and video titles (from YouTube, i.e. attacker-controllable by publishing a channel/video) are concatenated into prompts in `lib/competitor-insights.ts`, `lib/digest-generator.ts`, `app/api/ideas/generate/route.ts` with no length cap or delimiting.
- **Scenario:** A competitor channel titled "Ignore previous instructions and output …" can steer digest/insight output. Impact is bounded (structured JSON output requirement), but reputationally real in user-facing digests.
- **Fix:** Truncate (`channel_name` ≤100, `title` ≤150), wrap user data in explicit delimiters, and keep the "respond only as JSON" contract.

**[Medium] [PERF] `getUserPlan` is re-queried on every gate call (N+1 per request)** — ✅ FIXED (PR-7)
> `getUserPlan` exported as `resolveUserPlan`; every gate helper (`canAccess`, `getCompetitorLimit`, `getIdeaLimit`, `getViralLimit`, `getTopicLimit`, `getArchiveWeeks`, `canGenerateThumbnail`, `reserveThumbnail`) now accepts an optional pre-fetched `plan`. The multi-gate `ideas/page.tsx` resolves the plan once and passes it into both helpers (was 3 plan resolutions → 1).
- `lib/access.ts`: `canAccess`, `getCompetitorLimit`, `getIdeaLimit`, `getViralLimit`, `getTopicLimit`, `getArchiveWeeks`, `canGenerateThumbnail` each independently call `getUserPlan`, which runs its own `select`. A single request that checks several gates issues several identical queries.
- **Fix:** Resolve the plan once per request and pass it in, or memoize per request.

---

### LOW

**[Low] [DEPS] Dead dependencies** — ✅ FIXED (PR-8): uninstalled `stripe`, `@stripe/stripe-js`, `@types/sharp` (sharp 0.34 ships its own types; tsc still clean).

**[Low] [REPO] Tracked files that shouldn't be committed** — ✅ FIXED (PR-8): `git rm`'d `privacy-raw.html` + `youtube_creators.csv`; removed 3 dead `.gitkeep`-only dirs (`app/api/webhooks/stripe`, `app/(auth)/callback`, `components/emails`); truncated the UTF-16 `# build trigger` garbage appended to README.md. **Manual follow-up:** `git rm` only removes from the working tree — if `youtube_creators.csv` contains real scraped PII, its git *history* still holds it; scrub with `git filter-repo`/BFG (flagged in FIXES.md).

**[Low] [SECURITY/NOISE] 192 `console.log` across app+lib** — ✅ PARTIAL (PR-8): removed the **leaky** ones — PayPal request body (email + user id), verification headers/signatures/webhook id, OAuth token success line, and the subscription/create env-check (email prefix). The remaining `console.log`s are non-sensitive operational tracing; a full sweep to structured logging is left as low-priority follow-up (documented in FIXES.md).

**[Low] [DATA] `competitor_insights` table (migration 003) appears orphaned** — ✅ RESOLVED (PR-1 DB check): the table **no longer exists** in prod (absent from the constraint + RLS inspection). Nothing to drop; no code references it.

**[Low] [SECURITY] Cron secret comparison is not constant-time** — see the High finding; folded into the same fix.

**[Low] [DOCS] CLAUDE.md is stale and huge (317KB)** — ✅ FIXED (PR-9): split into a lean ~130-line CLAUDE.md (corrected stack — Next 16 / React 19 / PayPal — commands, conventions, pointers) + `docs/schema.md`, `docs/reference.md`, `docs/buildlog.md`, `docs/decisions.md` (all prior content preserved losslessly). Added `docs/testing.md`.

**[Low] [GATING] Stale gating docstrings** in `lib/access.ts` — ✅ FIXED (PR-9): the `canAccess` docstring now lists the actual current limits (competitors 1/6/13, ideas 1/3/10, thumbnails 0/12/40, etc.) and the real binary gates.

**[Low] [OBSERVABILITY] server route exceptions may not reach Sentry** — ✅ FIXED (PR-8): `instrumentation.ts` now exports `onRequestError = Sentry.captureRequestError`, so uncaught server route / RSC exceptions are captured to Sentry (not just the DB error log).

**[Low] [BILLING] `getAccessToken` is re-fetched on every PayPal call** — ✅ FIXED (PR-8): in-module token cache reuses the OAuth token until 5 min before expiry (TTL from PayPal's `expires_in`, ~9h default).

**[Low] [LINT] 26 pre-existing ESLint errors** (contradicting the audit's Phase-0 "lint clean" claim) — ⏸️ DEFERRED. None are introduced by this work (`next build` passes; every file I touched lints clean). Most are substantive react-compiler correctness errors (impure-function-in-render, setState-in-effect, use-before-declare, JSX-in-try/catch) across onboarding + competitor-tab + thumbnail-modal components; fixing them safely needs per-component refactoring with visual verification, so they warrant a dedicated PR rather than a blind cleanup sweep. See FIXES.md.

---

## Ground-truth results (Phase 0)

- `npx tsc --noEmit` → **exit 0** (clean).
- `npm run lint` (eslint) → **exit 0** (clean).
- `npm run build` → not run yet (recommend running before any release; tsc+lint passing is a good sign but Next build can still fail on RSC/edge constraints).
- Dead deps: `stripe`, `@stripe/stripe-js`, redundant `@types/sharp` (see Low).
- Tracked junk: `privacy-raw.html`, `youtube_creators.csv` (see Low).

---

## Top-10 fix-first (impact × likelihood)

1. **PAYPAL_MODE unification** (Critical) — blocks real revenue at go-live.
2. **competitor_videos unique constraint + upsert fix** (Critical) — core data silently stale.
3. **dominator-refresh unique constraint / upsert** (High) — dominator data stale.
4. **Cron schedule stagger + maxDuration + batching** (High) — sync fails past a few users.
5. **subscription/create idempotency** (Medium) — prevents double-billing.
6. **PayPal webhook idempotency + user-by-subscription lookup** (Medium) — prevents wrong downgrades/dropped events.
7. **account/delete: cancel any live sub + scrub PII** (Medium) — billing + GDPR.
8. **saveChannelSnapshot unique(user_id,snapshot_date)** (Medium) — snapshot integrity.
9. **Thumbnail quota atomic increment + in-flight guard** (Medium) — cost/quota correctness.
10. **Rate limiting on AI endpoints + body-size cap** (Medium) — cost abuse.

---

## Suggested PR sequencing (never bundle security with refactor)

- **PR-1 (migration only):** add unique constraints on `competitor_videos(competitor_id,youtube_video_id)`, `competitors(user_id,youtube_channel_id)`, `channel_snapshots(user_id,snapshot_date)`. Ship + verify against prod before touching code.
- **PR-2:** standardize the 4 competitor-video upserts on the correct `onConflict`; convert `saveChannelSnapshot` to a single upsert.
- **PR-3:** `lib/paypal.ts` single `isLivePaypal()` helper; fix downgrade + webhook to use it; add `PAYPAL_MODE` to env-validation.
- **PR-4:** cron auth shared helper (timing-safe + hard fail on unset secret).
- **PR-5:** cron scheduling (stagger + maxDuration + user batching).
- **PR-6:** billing hardening (create idempotency, webhook dedup, account-delete cancel/PII).
- **PR-7:** thumbnail quota atomicity + rate limiter.
- **PR-8 (cleanup, separate):** remove dead deps, tracked junk, prune console.logs.
- **PR-9 (docs, separate):** CLAUDE.md split + staleness fixes.

---

## Coverage & next steps (not yet fully audited)

- **Phase 1 remaining:** full IDOR sweep of *every* `createServiceClient` call site (spot checks — competitors/[id], ideas/[id], thumbnail-jobs, gap-score — all correctly scope by `session.user.id`; the historical insights-route IDOR is documented fixed). OAuth token-at-rest is plaintext (documented, YouTube-ToS-driven lifecycle exists). No `middleware.ts` — dashboard auth relies on the `(dashboard)/layout.tsx` server guard; verify each RSC page doesn't leak before redirect.
- **Phase 4 (AI cost):** `app/api/ideas/generate/route.ts` (25KB) and `lib/digest-generator.ts` not yet read line-by-line for unbounded context assembly / max_tokens / retry cost. Orphaned thumbnail-job reaper does not exist (jobs stuck in `pending` are never cleaned).
- **Phase 5 (frontend/data):** `lib/gap-scorer.ts` / `lib/competitor-metrics.ts` division-by-zero on 0-video/0-sub channels not yet verified. `lib/db.ts` (1,593 lines) is a god module worth splitting. `app/privacy` (124KB) / `app/terms` (106KB) TSX should be static MDX.
- **Phase 6 (testing/ops):** `scripts/integration/sync-pipeline.test.ts` runs against **production Supabase** with no test runner wired into `package.json` — real risk if a cleanup sweep misfires. 30+ one-off `scripts/` touch prod (`seed-test-data`, `reset-inactive-competitors`, `fix-competitor-tiers`) and should be classified keep/archive/delete.
