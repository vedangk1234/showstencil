import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import { getRecentDigests, getUser } from '@/lib/db'
import { createServiceClient } from '@/lib/supabase'
import DigestListClient from './DigestListClient'

export default async function DigestPage() {
  const session = await auth()
  if (!session?.user?.id) redirect('/login')

  const userId = session.user.id
  const supabase = createServiceClient()

  const [digests, user, competitorResult] = await Promise.all([
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
}
