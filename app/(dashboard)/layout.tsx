import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import Image from 'next/image'
import { getUser, updateUserOnboardingStatus } from '@/lib/db'
import { SyncProvider } from '@/components/sync-context'
import SidebarNav from '@/components/dashboard/SidebarNav'
import SignOutButton from '@/components/dashboard/SignOutButton'

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await auth()
  if (!session) redirect('/login')

  const user = await getUser(session.user.id)
  const needsSync = !user?.onboarding_completed

  if (needsSync) {
    await updateUserOnboardingStatus(session.user.id, true)
  }

  return (
    <div className="flex h-screen" style={{ background: '#0a0a0b' }}>

      {/* Sidebar */}
      <aside
        className="w-60 shrink-0 flex flex-col"
        style={{ background: '#0d0d10', borderRight: '1px solid #1f1f23' }}
      >

        {/* Logo */}
        <div className="px-5 py-5 flex items-center" style={{ borderBottom: '1px solid #1f1f23' }}>
          <span style={{ fontFamily: 'Montserrat, sans-serif', fontSize: '17px' }}>
            <span style={{ color: '#FFFFFF', fontWeight: 700 }}>Show</span>
            <span style={{ color: '#B8B8B8', fontWeight: 700 }}>Stencil</span>
          </span>
        </div>

        {/* Nav links (client component — needs usePathname) */}
        <SidebarNav />

        {/* User section */}
        <div className="p-3" style={{ borderTop: '1px solid #1f1f23' }}>
          <div className="flex items-center gap-2.5 px-3 py-2">
            {session.user.image ? (
              <Image
                src={session.user.image}
                alt={session.user.name ?? 'User'}
                width={28}
                height={28}
                className="rounded-full"
              />
            ) : (
              <div
                className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-medium text-white"
                style={{ background: '#2563eb' }}
              >
                {session.user.name?.[0]?.toUpperCase() ?? '?'}
              </div>
            )}
            <div className="flex-1 min-w-0">
              <p className="text-xs text-white truncate font-medium">{session.user.name}</p>
              <p className="text-xs truncate" style={{ color: '#6b7280' }}>{session.user.email}</p>
            </div>
          </div>

          <SignOutButton />
        </div>

      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-auto" style={{ background: '#0a0a0b', padding: '32px' }}>
        <SyncProvider needsSync={needsSync}>{children}</SyncProvider>
      </main>

    </div>
  )
}
