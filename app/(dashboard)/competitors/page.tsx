import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import { createServiceClient } from '@/lib/supabase'
import { CompetitorsTable } from '@/components/competitors/CompetitorsTable'
import { getPlanLimits } from '@/lib/plan-limits'
import type { Competitor } from '@/types'

export default async function CompetitorsPage() {
  const session = await auth()
  if (!session) redirect('/login')

  try {
    const supabase = createServiceClient()
    const uid = session.user.id
    const now = new Date().toISOString()

    // All four queries are independent — session.user.id is available before any DB call.
    const [{ data: user }, { data: competitors }, { data: lockedSearched }, { data: latestSnapshot }] =
      await Promise.all([
        supabase
          .from('users')
          .select('id, subscription_plan, sub_niche, niche_id')
          .eq('id', uid)
          .single(),
        supabase
          .from('competitors')
          .select('*')
          .eq('user_id', uid)
          .eq('is_active', true)
          .order('subscriber_count', { ascending: false }),
        supabase
          .from('competitors')
          .select('channel_name, replacement_locked_until')
          .eq('user_id', uid)
          .eq('is_searched', true)
          .eq('is_active', true)
          .not('replacement_locked_until', 'is', null)
          .gt('replacement_locked_until', now)
          .limit(1)
          .maybeSingle(),
        supabase
          .from('channel_snapshots')
          .select('subscriber_count')
          .eq('user_id', uid)
          .not('subscriber_count', 'is', null)
          .order('snapshot_date', { ascending: false })
          .limit(1)
          .maybeSingle(),
      ])

    if (!user) redirect('/login')

    const planLimits = getPlanLimits(user.subscription_plan)

    return (
      <CompetitorsTable
        competitors={(competitors ?? []) as Competitor[]}
        user={user}
        planLimits={planLimits}
        lockedUntil={lockedSearched?.replacement_locked_until ?? null}
        lockedChannelName={lockedSearched?.channel_name ?? null}
        userSubscriberCount={latestSnapshot?.subscriber_count ?? null}
      />
    )
  } catch (error) {
    console.error('[competitors] Data fetch failed:', error)
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
          We couldn&apos;t load your competitors right now. This is usually temporary — please refresh the page.
        </p>
        <a
          href="/competitors"
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
