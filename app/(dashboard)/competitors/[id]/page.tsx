import { auth } from '@/auth'
import { redirect, notFound } from 'next/navigation'
import { createServiceClient } from '@/lib/supabase'
import { CompetitorAnalysis } from '@/components/competitors/CompetitorAnalysis'

export default async function CompetitorAnalysisPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const session = await auth()
  if (!session) redirect('/login')

  const { id } = await params

  try {
    const supabase = createServiceClient()

    // user and competitor are independent — both key on session.user.id which we already have.
    const [{ data: user }, { data: competitor }] = await Promise.all([
      supabase
        .from('users')
        .select('id, name, subscription_plan, sub_niche, sub_niche_keywords, niche_id')
        .eq('id', session.user.id)
        .single(),
      supabase
        .from('competitors')
        .select('*')
        .eq('id', id)
        .eq('user_id', session.user.id)
        .single(),
    ])

    if (!user) redirect('/login')
    if (!competitor) notFound()

    const [
      { data: competitorVideos },
      { data: userSnapshot },
      { data: userSnapshots },
      { data: userVideos },
      { data: competitorSnapshots },
    ] = await Promise.all([
      supabase
        .from('competitor_videos')
        .select('*')
        .eq('competitor_id', id)
        .order('published_at', { ascending: false })
        .limit(20),
      supabase
        .from('channel_snapshots')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .single(),
      supabase
        .from('channel_snapshots')
        .select('*')
        .eq('user_id', user.id)
        .not('subscriber_count', 'is', null)
        .order('snapshot_date', { ascending: true })
        .limit(90),
      supabase
        .from('videos')
        .select('duration_seconds, published_at, view_count')
        .eq('user_id', user.id)
        .order('published_at', { ascending: false })
        .limit(50),
      supabase
        .from('competitor_snapshots')
        .select('snapshot_date, subscriber_count')
        .eq('competitor_id', id)
        .not('subscriber_count', 'is', null)
        .order('snapshot_date', { ascending: true })
        .limit(90),
    ])

    return (
      <CompetitorAnalysis
        user={user}
        userSnapshot={userSnapshot ?? null}
        userSnapshots={userSnapshots ?? []}
        userVideos={userVideos ?? []}
        competitor={competitor}
        competitorVideos={competitorVideos ?? []}
        competitorSnapshots={competitorSnapshots ?? []}
      />
    )
  } catch (error) {
    console.error('[competitor-detail] Data fetch failed:', error)
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
          We couldn&apos;t load this competitor right now. This is usually temporary — please refresh the page.
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
          Back to competitors
        </a>
      </div>
    )
  }
}
