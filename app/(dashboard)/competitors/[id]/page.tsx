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
  const supabase = createServiceClient()

  const { data: user } = await supabase
    .from('users')
    .select('id, name, subscription_plan, sub_niche, sub_niche_keywords, niche_id')
    .eq('id', session.user.id)
    .single()

  if (!user) redirect('/login')

  const { data: competitor } = await supabase
    .from('competitors')
    .select('*')
    .eq('id', id)
    .eq('user_id', user.id)
    .single()

  if (!competitor) notFound()

  const [
    { data: competitorVideos },
    { data: userSnapshot },
    { data: userSnapshots },
    { data: userVideos },
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
      .order('snapshot_date', { ascending: true })
      .limit(30),
    supabase
      .from('videos')
      .select('duration_seconds, published_at, view_count')
      .eq('user_id', user.id)
      .order('published_at', { ascending: false })
      .limit(50),
  ])

  return (
    <CompetitorAnalysis
      user={user}
      userSnapshot={userSnapshot ?? null}
      userSnapshots={userSnapshots ?? []}
      userVideos={userVideos ?? []}
      competitor={competitor}
      competitorVideos={competitorVideos ?? []}
    />
  )
}
