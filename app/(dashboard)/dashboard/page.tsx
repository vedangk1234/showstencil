import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import {
  getUser,
  getChannelSnapshots,
  getLatestGapScore,
  getCompetitors,
  getLatestDigest,
  getLatestTrend,
} from '@/lib/db'
import DashboardClient from '@/components/dashboard/DashboardClient'

export default async function DashboardPage() {
  const session = await auth()
  if (!session) redirect('/login')

  const userId = session.user.id

  const [user, snapshots, gapScore, competitors, latestDigest, latestTrend] = await Promise.all([
    getUser(userId),
    getChannelSnapshots(userId, 30),
    getLatestGapScore(userId),
    getCompetitors(userId),
    getLatestDigest(userId),
    getLatestTrend(userId),
  ])

  return (
    <DashboardClient
      user={user}
      snapshots={snapshots}
      gapScore={gapScore}
      competitors={competitors}
      latestDigest={latestDigest}
      latestTrend={latestTrend}
    />
  )
}
