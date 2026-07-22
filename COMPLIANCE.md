# YouTube API Services — Compliance Response

**Product:** ShowStencil (showstencil.com) · **API client:** "Nixlytics"
**Prepared:** 2026-07-22 · **Deadline:** hard 7-day audit window (urgent — first reminder already received)

This document maps each cited violation to the concrete changes made, the files
touched, and the manual steps only the account owner can complete. Strategy:
**keep all features** — the accepted "Additional policies for derived metrics and
data storage" amendment (Analytics & Reporting) permits custom scores, revenue
estimates, comparisons, AI analysis, and long-term metric storage **provided they
are clearly disclosed and data handling is correct**. So this response is
disclosure + lifecycle plumbing, not feature removal.

All code changes were verified with `npx tsc --noEmit && npm run lint && npm run build`
(0 new lint errors on top of the 26 pre-existing, unrelated ones).

---

## Violation → Resolution map

### III.A.1 — Terms of Use (PR-C2)
Users must agree to be bound by the YouTube Terms of Service, and the app must
disclose its use of YouTube API Services + Google Privacy Policy.

| Change | File |
|---|---|
| Finished terms banner into a clear "YouTube API Services" clause binding users to the [YouTube ToS](https://www.youtube.com/t/terms) + linking the [Google Privacy Policy](https://policies.google.com/privacy) | `app/terms/page.tsx` |
| Added a dedicated **YouTube API Services** privacy section: states API use, links Google Privacy Policy, lists YouTube data accessed (own analytics, own video metadata, public competitor data), retention windows, and revocation via [Google permissions](https://myaccount.google.com/permissions) + in-app deletion | `app/privacy/page.tsx` |
| Added YouTube ToS notice + link by the Google sign-in button | `app/(auth)/login/page.tsx` |

### III.E.4h — Derived / estimated metrics must be clearly distinguished (PR-C3, PR-C6)
Every ShowStencil-calculated score/estimate is now visibly (not hover-only)
labelled as not a YouTube metric; raw API values are shown under their real names
with no label.

| Change | File |
|---|---|
| New reusable disclosure component (variants: score / estimate / revenue / youtubeEstimate / analysis) + shared copy map + footer helper | `components/MetricDisclosure.tsx` |
| Overall Gap Score + per-metric gap bars → "Calculated by ShowStencil — not a YouTube metric" | `components/dashboard/DashboardClient.tsx` |
| Onboarding first gap score → score disclosure | `components/onboarding/StepFirstAnalysis.tsx` |
| Competitor Gap column + viral count → ShowStencil-analysis caption; competitor CTR/watch "Not publicly available" clarified as niche estimate used for scoring only | `components/competitors/tabs/OverviewTab.tsx` |
| AI insight cards → footer disclosure line | `components/competitors/tabs/InsightsTab.tsx` |
| Sub-niche label → distinct purple pill, prefixed "ShowStencil sub-niche:" (visually distinct from YouTube categories) | `components/competitors/CompetitorAnalysis.tsx` |
| Digest email: gap score, competitor averages, revenue gap → in-body note + footer disclosure | `emails/weekly-digest.tsx` |
| Digest pages (list + detail): Gap Score + Revenue Gap → disclosure caption | `app/(dashboard)/digest/[id]/page.tsx`, `app/(dashboard)/digest/DigestListClient.tsx` |
| **C1 correction (PR-C6):** user's own "Est. monthly revenue" IS YouTube Analytics API data → relabelled "YouTube Analytics estimate for your channel" (the third-party disclaimer is reserved for the competitor-derived Revenue Gap) | `components/dashboard/DashboardClient.tsx`, `components/MetricDisclosure.tsx` |
| **F1 (PR-C6):** competitor "Revenue Gap" mixes external industry-CPM assumptions with API views → kept but disclosed as "ShowStencil estimate using industry CPM assumptions — not YouTube data or a Google-approved figure" (amendment's permitted "disclose as own data" path) | dashboard, digests, email |
| **F3 (PR-C6):** `lib/revenue-benchmarks.ts` (external CPM/RPM/sponsorship tables) is not wired to any user-facing surface — added a header comment forbidding surfacing it without disclosure | `lib/revenue-benchmarks.ts` |

Raw YouTube data (subscribers, views, video counts, the user's own CTR/watch/analytics)
is shown under its real name with **no** disclosure — verified.

### III.E.4a–g — Token & data lifecycle (PR-C1, PR-C4)
| Change | File |
|---|---|
| Prerequisite: `users.last_active_at` column | `supabase/migrations/20260709000000_add_last_active_at.sql` (**applied to prod**) |
| Revocation column: `users.youtube_revoked_at` | `supabase/migrations/20260722000000_add_youtube_revoked_at.sql` (**applied to prod**) |
| On `invalid_grant` at refresh → null all 3 tokens + stamp `youtube_revoked_at`; no infinite daily retries (preflight aborts once tokens are null) | `lib/sync-logic.ts` |
| Daily cron: purge revoked users' YouTube-derived data 30 days after revocation | `app/api/cron/cache-cleanup/route.ts` |
| Daily cron: 90-day inactive users → null tokens (account + data kept, re-consent on return) | same |
| Daily cron: delete `competitor_videos` older than 30 days by `synced_at` (refreshed on every sync); delete `competitor_snapshots` + `channel_snapshots` older than 36 months | same |
| Account delete already revokes Google token + deletes all YouTube-derived data immediately — **verified** | `app/api/account/delete/route.ts` |

### Amendment framing conditions — AI + adversarial framing (PR-C5)
| Change | File |
|---|---|
| Renamed user-facing "Dominator" → "Top Performer" (UI + email + labels; internal identifiers kept) | TierBadge, digest pages, weekly-digest, CompetitorsTable, ChannelSearchBar, SubscriberGrowthChart, StepMeetCompetitors, competitors/loading, app/page.tsx |
| Shared AI guardrail (no protected-attribute inference; no war/battle/enemy framing) injected into every Claude + Gemini prompt | `lib/ai-guardrails.ts` → `lib/competitor-insights.ts`, `lib/digest-generator.ts`, `lib/sub-niche-detector.ts`, `app/api/ideas/generate/route.ts`, `lib/gemini-image.ts` |
| Thumbnail caption: "AI-generated by ShowStencil from your photo and idea — not YouTube content." | `components/ideas/ThumbnailGenerationModal.tsx` |

### III.D.1c — Project numbers (administrative, no code)
Answered in the audit form / reply, not in code. Known project number:
**343322784370**. List any additional Google Cloud project numbers associated with
the OAuth client on the audit form (see manual steps).

---

## Screenshot checklist for the audit reply

Capture these from the live site after deploy:

- [ ] **Terms of Use** — `/terms` top banner showing the YouTube ToS clause + Google Privacy Policy link.
- [ ] **Privacy Policy** — `/privacy` "YouTube API Services" section (data accessed, retention, revocation links).
- [ ] **Login** — YouTube ToS notice + link beside the "Continue with Google" button.
- [ ] **Dashboard** — Overall Gap Score card + gap bars showing "Calculated by ShowStencil — not a YouTube metric".
- [ ] **Dashboard** — "Est. monthly rev." card showing "YouTube Analytics estimate for your channel" (own revenue) and the Revenue Gap "ShowStencil CPM estimate" note.
- [ ] **Digest email** — the in-body + footer disclosure lines (gap score / competitor averages / revenue gap).
- [ ] **Competitor detail** — sub-niche pill ("ShowStencil sub-niche:") + "Not publicly available" CTR/watch clarification.
- [ ] **Thumbnail generator** — the "AI-generated by ShowStencil … not YouTube content" caption near the preview/download.

---

## Manual steps only the account owner can do

1. **Accept the derived-metrics amendment** — in the YouTube API form (Analytics & Reporting): accept "Additional policies for derived metrics and data storage". This is what authorises the scores, revenue estimates, comparisons, AI analysis, and long-term storage that the disclosures above cover.
2. **Submit the audit form** with the resolutions in this document.
3. **Reply to the violation email** citing III.A.1 / III.E.4a-g / III.E.4h resolutions (link/attach screenshots).
4. **Answer III.D.1c** — list project number **343322784370** and any other Google Cloud project numbers tied to the OAuth client.
5. **Take the screenshots** in the checklist above (after the branch is deployed to prod).
6. **Deploy** — these changes are committed on branch `go-live/prod-hardening-2026-07-21` (compliance work is uncommitted until you approve). The two migrations are already applied to prod; the cron code reads/writes `youtube_revoked_at` and `last_active_at` on the next scheduled run.

> Out of scope this session (do NOT touch): PayPal / billing / go-live. Noted separately:
> the PayPal app credentials may lack webhook scope (a go-live blocker) — handle in the
> billing track, not here.
