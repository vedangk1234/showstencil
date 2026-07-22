# Testing

> Status: **no automated test runner is wired into CI yet.** `npm test` is a placeholder
> that exits non-zero on purpose (see `package.json`). This doc records what exists and
> the guard rails before you run any of it.

## ⚠️ The integration suite targets PRODUCTION Supabase

`scripts/integration/sync-pipeline.test.ts` runs against whatever Supabase project the
env vars point at. Today that is **prod**. It mitigates blast radius by using test users
under the `@showstencil-test.invalid` domain and cleaning them up afterward, but a bug in
the cleanup path (or a mis-set env var) could touch real rows.

**Do not run it casually against prod.** Before running:

1. Point `NEXT_PUBLIC_SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` at a **branch or local**
   Supabase instance (Supabase branching, or a throwaway project), not production.
2. Confirm with `scripts/integration/_audit-cleanup.ts` that no `@showstencil-test.invalid`
   users remain afterward.

Run (once pointed at a safe instance):

```bash
npx tsx --env-file=.env.local scripts/integration/sync-pipeline.test.ts
```

External APIs (YouTube, Anthropic, Google OAuth) are mocked via
`scripts/integration/mock-fetch.ts`; only Supabase is real.

## Other test/diagnostic scripts

Many `scripts/*.ts` are one-off diagnostics that hit prod (`seed-test-data`,
`reset-inactive-competitors`, `fix-competitor-tiers`, `health-check`, etc.). Treat them as
manual, prod-touching tools — read each one before running. `scripts/health-check.ts` is
read-only and safe:

```bash
npx tsx --env-file=.env.local scripts/health-check.ts
```

## Follow-up (not yet done)

A real test-infra overhaul — a runner (vitest/jest) wired into `npm test` + CI, pointed at
an ephemeral test database, with the integration suite migrated onto it — is tracked as a
separate future task (see FIXES.md).
