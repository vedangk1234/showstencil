import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import {
  getUser,
  getChannelSnapshots,
  getLatestGapScore,
  getCompetitors,
  getRecentDigests,
  getLatestTrend,
  getAllCompetitorSnapshotsForUser,
  getRecentIdeasBatch,
  getNicheAvgViewsPerVideo,
} from '@/lib/db'
import DashboardClient from '@/components/dashboard/DashboardClient'

export default async function DashboardPage() {
  const session = await auth()
  if (!session) redirect('/login')

  const userId = session.user.id

  try {
    const [user, snapshots, gapScore, competitors, recentDigests, latestTrend, competitorSnapshots, recentIdeas, nicheAvgViewsPerVideo] =
      await Promise.all([
        getUser(userId),
        getChannelSnapshots(userId, 30),
        getLatestGapScore(userId),
        getCompetitors(userId),
        getRecentDigests(userId, 3),
        getLatestTrend(userId),
        getAllCompetitorSnapshotsForUser(userId, 30),
        getRecentIdeasBatch(userId),
        getNicheAvgViewsPerVideo(userId),
      ])

    const topIdea = recentIdeas.find((i) => !i.made_at) ?? null

    if (!user?.youtube_channel_id) {
      return (
        <div style={{
          minHeight: '100vh',
          background: '#000',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '32px 24px',
        }}>
          <div style={{
            maxWidth: 520,
            width: '100%',
            border: '1px solid #27272a',
            borderRadius: 8,
            padding: '40px 36px',
            textAlign: 'center',
          }}>
            <div style={{
              width: 48,
              height: 48,
              borderRadius: '50%',
              background: '#18181b',
              border: '1px solid #3f3f46',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 24px',
              fontSize: 22,
            }}>
              📺
            </div>
            <h1 style={{ color: '#fff', fontSize: 20, fontWeight: 600, margin: '0 0 12px' }}>
              No YouTube channel detected
            </h1>
            <p style={{ color: '#a1a1aa', fontSize: 14, lineHeight: 1.6, margin: '0 0 24px' }}>
              We couldn&apos;t find a YouTube channel linked to your Google account.
              ShowStencil requires a YouTube channel to analyse your performance and find competitors.
            </p>
            <p style={{ color: '#71717a', fontSize: 13, lineHeight: 1.6, margin: 0 }}>
              If you do have a YouTube channel and it&apos;s not being detected, please reach out —
              we&apos;ll get it sorted.{' '}
              <a
                href="mailto:support@showstencil.com"
                style={{ color: '#e4e4e7', textDecoration: 'underline' }}
              >
                support@showstencil.com
              </a>
            </p>
          </div>
        </div>
      )
    }

    return (
      <DashboardClient
        user={user}
        snapshots={snapshots}
        gapScore={gapScore}
        competitors={competitors}
        recentDigests={recentDigests}
        latestDigest={recentDigests[0] ?? null}
        latestTrend={latestTrend}
        competitorSnapshots={competitorSnapshots}
        topIdea={topIdea}
        nicheAvgViewsPerVideo={nicheAvgViewsPerVideo}
      />
    )
  } catch (error) {
    console.error('[dashboard] Data fetch failed:', error)
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
          We couldn&apos;t load your dashboard right now. This is usually temporary — please refresh the page.
        </p>
        <a
          href="/dashboard"
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
          Refresh dashboard
        </a>
      </div>
    )
  }
}
