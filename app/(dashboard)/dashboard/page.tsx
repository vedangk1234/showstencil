import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import {
  getUser,
  getChannelSnapshots,
  getLatestGapScore,
  getCompetitors,
  getRecentDigests,
  getLatestTrend,
} from '@/lib/db'
import DashboardClient from '@/components/dashboard/DashboardClient'

export default async function DashboardPage() {
  const session = await auth()
  if (!session) redirect('/login')

  const userId = session.user.id

  const [user, snapshots, gapScore, competitors, recentDigests, latestTrend] = await Promise.all([
    getUser(userId),
    getChannelSnapshots(userId, 30),
    getLatestGapScore(userId),
    getCompetitors(userId),
    getRecentDigests(userId, 3),
    getLatestTrend(userId),
  ])

  return (
    <DashboardClient
      user={user}
      snapshots={snapshots}
      gapScore={gapScore}
      competitors={competitors}
      recentDigests={recentDigests}
      latestDigest={recentDigests[0] ?? null}
      latestTrend={latestTrend}
    />
  )
}
