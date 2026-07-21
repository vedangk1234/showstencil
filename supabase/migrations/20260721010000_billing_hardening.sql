-- PR-6 — Billing hardening: webhook idempotency + create idempotency support.
-- Idempotent (IF NOT EXISTS guards) — safe to re-run.

-- 1. Dedup table for PayPal webhook events.
--    The webhook records each PayPal event id here BEFORE processing; a duplicate /
--    replayed delivery hits the primary-key conflict and is acknowledged (200) without
--    re-applying the state change (prevents e.g. a replayed EXPIRED downgrading a user
--    who was since re-activated).
CREATE TABLE IF NOT EXISTS public.paypal_webhook_events (
  event_id    TEXT        PRIMARY KEY,
  event_type  TEXT,
  received_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.paypal_webhook_events ENABLE ROW LEVEL SECURITY;

-- service_role only (the webhook route uses the service client). No authenticated/anon
-- grants — users must never read billing event history.
GRANT SELECT, INSERT ON public.paypal_webhook_events TO service_role;

-- 2. Track an approval-pending subscription id so a double-click on "Upgrade" returns
--    the existing PayPal approval link instead of minting a second subscription (which
--    would double-charge and orphan the first). Cleared when the subscription activates.
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS pending_paypal_subscription_id TEXT;
