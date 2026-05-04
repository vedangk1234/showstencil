import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import { createServiceClient } from '@/lib/supabase'
import { getRecentIdeasBatch, getIdeasRefreshAvailable } from '@/lib/db'
import { getIdeaLimit, canGenerateThumbnail } from '@/lib/access'
import { IdeasClient } from '@/components/ideas/IdeasClient'
import type { PlanType } from '@/types'

// ─── Plan resolution (mirrors the route logic) ────────────────────────────────

function resolvePlan(row: {
  subscription_status: string | null
  subscription_plan: string | null
  trial_ends_at: string | null
} | null): PlanType {
  if (!row) return 'free'
  const { subscription_status, subscription_plan, trial_ends_at } = row
  if (subscription_status === 'on_trial' && trial_ends_at && new Date(trial_ends_at) < new Date()) return 'free'
  if (
    subscription_status === 'on_trial' ||
    subscription_status === 'active' ||
    subscription_status === 'past_due'
  ) {
    return (subscription_plan as PlanType) ?? 'free'
  }
  return 'free'
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function IdeasPage() {
  const session = await auth()
  if (!session) redirect('/login')

  const userId = session.user.id

  try {
    const supabase = createServiceClient()

    // Load plan info, niche, recent ideas, thumbnail quota, and refresh flag in parallel
    const [userRow, ideas, ideaLimit, thumbnailQuota, ideasRefreshAvailable] = await Promise.all([
      supabase
        .from('users')
        .select('subscription_status, subscription_plan, trial_ends_at, niche_id')
        .eq('id', userId)
        .single()
        .then((r) => r.data),
      getRecentIdeasBatch(userId),
      getIdeaLimit(userId),
      canGenerateThumbnail(userId),
      getIdeasRefreshAvailable(userId),
    ])

    const plan = resolvePlan(userRow)
    const nicheId = userRow?.niche_id ?? 'finance'

    // Google profile photo from session (set by NextAuth from Google OAuth)
    const googleProfilePhotoUrl = (session.user.image as string | null | undefined) ?? null

    // Is this batch "fresh" (generated within the last 7 days)?
    const latestGeneratedAt = ideas.length > 0 ? new Date(ideas[0].generated_at) : null
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
    const isFresh = latestGeneratedAt !== null && latestGeneratedAt > sevenDaysAgo

    // Pass raw generated_at to client — lock state is computed there
    const mostRecentGeneratedAt = latestGeneratedAt?.toISOString() ?? null

    // Seed for deterministic image shuffle — stable across refreshes, changes on regeneration
    const imageSeed = mostRecentGeneratedAt ? new Date(mostRecentGeneratedAt).getTime() : 1

    return (
      <IdeasClient
        initialIdeas={ideas}
        isFresh={isFresh}
        plan={plan}
        ideaLimit={ideaLimit}
        nicheId={nicheId}
        imageSeed={imageSeed}
        canGenerate={thumbnailQuota.allowed}
        quotaUsed={thumbnailQuota.quotaUsed}
        quotaLimit={thumbnailQuota.quotaLimit}
        quotaResetAt={thumbnailQuota.quotaResetAt}
        googleProfilePhotoUrl={googleProfilePhotoUrl}
        ideasRefreshAvailable={ideasRefreshAvailable}
      />
    )
  } catch (error) {
    console.error('[ideas] Data fetch failed:', error)
    return (
      <div style={{
        minHeight: '100vh',
        background: '#000',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexDirection: 'column',
        gap: 16,
        padding: 32,
        textAlign: 'center',
      }}>
        <h1 style={{ color: '#fff', fontSize: 20, margin: 0 }}>Something went wrong</h1>
        <p style={{ color: '#555', fontSize: 14, margin: 0, maxWidth: 380 }}>
          We couldn&apos;t load your ideas right now. This is usually temporary — please refresh the page.
        </p>
        <a
          href="/ideas"
          style={{
            background: '#fff',
            color: '#000',
            padding: '10px 24px',
            borderRadius: 6,
            fontSize: 14,
            fontWeight: 600,
            textDecoration: 'none',
          }}
        >
          Refresh page
        </a>
      </div>
    )
  }
}
