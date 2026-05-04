import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import { getRecentDigests, getUser } from '@/lib/db'
import { createServiceClient } from '@/lib/supabase'
import DigestListClient from './DigestListClient'

export default async function DigestPage() {
  const session = await auth()
  if (!session?.user?.id) redirect('/login')

  const userId = session.user.id

  try {
    const supabase = createServiceClient()

    const [digests, _user, competitorResult] = await Promise.all([
      getRecentDigests(userId, 50),
      getUser(userId),
      supabase
        .from('competitors')
        .select('id, channel_name, tier, is_dominator, subscriber_count, avg_views_per_video, upload_frequency_30d, sub_niche')
        .eq('user_id', userId)
        .eq('is_active', true)
        .order('tier', { ascending: true }),
    ])

    return (
      <DigestListClient
        digests={digests}
        competitors={competitorResult.data ?? []}
      />
    )
  } catch (error) {
    console.error('[digest] Data fetch failed:', error)
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
          We couldn&apos;t load your digests right now. This is usually temporary — please refresh the page.
        </p>
        <a
          href="/digest"
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
