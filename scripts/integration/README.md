# Integration tests — sync pipeline

End-to-end tests for `syncUserChannel()` that hit a real Supabase but stub every
external API (YouTube, Anthropic, Google OAuth). Cover the wiring failures that
unit tests miss — including the niche-detection regression that triggered this
work in the first place.

## How to run

```bash
npx tsx --env-file=.env.local scripts/integration/sync-pipeline.test.ts
```

Exit code:
- `0` — all cases passed
- `1` — at least one case failed

Each case prints `✓` or `✗` with elapsed time. Failures print the assertion
message and the file location.

## What's mocked vs live

| Service              | Approach                                       | Why |
|----------------------|------------------------------------------------|-----|
| YouTube Analytics    | `globalThis.fetch` interceptor                 | 200/day quota — never burn it on tests |
| YouTube Data         | `globalThis.fetch` interceptor                 | 10K/day quota — same reason |
| Anthropic Claude     | `globalThis.fetch` interceptor                 | Real-cost + non-determinism |
| Google OAuth         | `globalThis.fetch` interceptor                 | Test 5 (expired token) needs a controllable response |
| Resend / PayPal      | Not exercised                                  | Sync pipeline doesn't touch them |
| **Supabase (prod)**  | **Live — passthrough**                         | Tests need real DB end-state to assert against |

The mock-fetch helper runs in **strict mode**: any URL with no registered
handler throws. That's deliberate — if a test silently picks up an unstubbed
API, the suite should fail loudly rather than burn prod quota.

Supabase URLs (`*.supabase.co`, `*.supabase.in`) are passthrough-listed in
`mock-fetch.ts` so the JS client's internal fetches go to the real DB.

## Test data setup

Each test creates a fresh user with:
- `id = crypto.randomUUID()`
- `email = 'integration-test-{uuid}@showstencil-test.invalid'`

`.invalid` is a reserved TLD (RFC 2606) — guaranteed not to collide with a real
account. The email pattern is also the cleanup key.

## Cleanup

Each case calls `cleanupTestUser(userId)` in a `finally` block — this deletes:
1. `error_logs` rows for the user (ON DELETE SET NULL, not cascade — would
   otherwise be orphaned for the next test's assertions)
2. `sync_logs` rows for the user (same reason)
3. `users` row (cascades to all other child tables via FK)

A global sweep also runs at the start and end of the suite:
```sql
DELETE FROM users WHERE email ILIKE '%@showstencil-test.invalid'
```

If the suite crashes mid-run, the next invocation cleans up leftover rows. You
can also run this query manually in the Supabase SQL editor if needed.

## What's covered

| Case | Scenario                                                          |
|------|-------------------------------------------------------------------|
| 1    | Happy path with niche detection — niche_id becomes 'finance_crypto' |
| 2    | Niche already set — Claude is NOT called (strict-mode assertion)  |
| 3    | 0 videos from Analytics → warn logged, niche stays null           |
| 4    | Claude returns confidence 0 → niche stays null, warn logged       |
| 5    | Token expired + no refresh token → 401, no DB writes, no fetches  |
| 6    | Analytics returns 500 → graceful degradation, no partial state    |
| 7    | Self-heal: empty first sync → user posts → second sync detects niche |

Case 7 is the exact regression pattern that prompted this suite — sync must
recover on subsequent invocations after a previously-broken state, not just on
a single happy-path call.

## Adding a new test case

1. Write an `async function caseN_descriptiveName(): Promise<void>` in
   `sync-pipeline.test.ts`.
2. Call `createTestUser(opts)` for setup, then `install([...handlers])`,
   then `await syncUserChannel(userId)`, then assertions.
3. Always wrap the sync call in `try { ... } finally { restore(); await
   cleanupTestUser(userId); }` so a failing assertion doesn't leak a user.
4. Add an entry to the `cases` array at the bottom of the file.

## What's NOT covered

- HTTP-level concerns (auth cookies, route handlers, rate limiting). The
  `/api/sync` route wrapper around `syncUserChannel` is tested implicitly
  through manual QA only.
- Frontend behaviour during sync (`SyncProvider`, `DashboardClient` retry
  states).
- The `detectAndAssignCompetitors` codepath — test setups deliberately mock
  `getChannelStats` to return `subscriberCount: null` so this branch is
  skipped. Competitor auto-detection has its own bug surface and is out of
  scope here.
- Sub-niche detection — the `POST /api/users/detect-sub-niche` fire-and-forget
  is stubbed with a no-op so it doesn't hang the test.

If a regression appears in any of those areas, add a dedicated test rather than
stretching this suite.

## Dependencies

None beyond what the project already uses (`tsx`, `node:assert/strict`,
`@supabase/supabase-js`). No Jest, no Vitest, no testing-library.
