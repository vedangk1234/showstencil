import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import { getRecentDigests, getUser } from '@/lib/db'
import DigestListClient from './DigestListClient'

export default async function DigestPage() {
  const session = await auth()
  if (!session?.user?.id) redirect('/login')

  const [digests, user] = await Promise.all([
    getRecentDigests(session.user.id, 50),
    getUser(session.user.id),
  ])

  return (
    <DigestListClient
      digests={digests}
      nicheId={user?.niche_id ?? 'finance'}
    />
  )
}
