# Phase 4 — Sandbox Billing + Limits Test Results

**Env:** local `.env.local` = sandbox (green) · preview = sandbox (mode + creds + webhook id) · PayPal SANDBOX app.
**Where each step runs:** webhook-delivery steps → **preview**; self-contained limit tests → **local**.

| # | Step | Where | Status | Evidence |
|---|------|-------|--------|----------|
| 1 | Subscribe + double-click idempotency | local | ⬜ pending | |
| 2 | Activate (ACTIVATED webhook, signature-verified) | preview | ⬜ pending | |
| 3 | Replay protection (same event id → duplicate) | preview | ⬜ pending | |
| 4 | Out-of-order guard (stale/non-matching event ignored) | preview | ⬜ pending | |
| 5 | Upgrade → downgrade pruning (UPDATED) | preview | ⬜ pending | |
| 6 | Cancel + grace → EXPIRED downgrade | preview | ⬜ pending | |
| 7 | Account delete + PII erasure | preview | ⬜ pending | |
| 8 | Rate limiting (>10 ideas/min → 429) | local | ⬜ pending | |
| 9 | Thumbnail quota atomicity + reaper | local | ⬜ pending | |

Legend: ⬜ pending · ✅ pass · ❌ fail

---

## Step 1 — Subscribe + double-click idempotency (local)
_Results pending._
