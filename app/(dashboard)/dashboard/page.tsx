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
