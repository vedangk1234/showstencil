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
}
