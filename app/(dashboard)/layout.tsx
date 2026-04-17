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
    <div style={{
      display: 'flex',
      height: '100vh',
      background: '#000000',
      fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }}>

      {/* Sidebar */}
      <aside style={{
        width: 240,
        flexShrink: 0,
        display: 'flex',
        flexDirection: 'column',
        background: '#0a0a0a',
        borderRight: '1px solid #1a1a1a',
      }}>

        {/* Logo row */}
        <div style={{
          padding: '11px 16px',
          borderBottom: '1px solid #1a1a1a',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{
              width: 20, height: 20,
              background: '#ffffff',
              borderRadius: 4,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              flexShrink: 0,
            }}>
              <span style={{ color: '#000000', fontSize: 9, fontWeight: 800, letterSpacing: '-0.5px' }}>SS</span>
            </div>
            <span style={{ color: '#ffffff', fontSize: 13, fontWeight: 500 }}>ShowStencil</span>
          </div>
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" style={{ color: '#444444' }}>
            <path d="M3 4.5L6 7.5L9 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>

        {/* Search bar */}
        <div style={{ padding: '8px 12px', borderBottom: '1px solid #1a1a1a' }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 7,
            background: '#111111',
            border: '1px solid #1a1a1a',
            borderRadius: 6,
            padding: '5px 10px',
          }}>
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none" style={{ color: '#444444', flexShrink: 0 }}>
              <circle cx="6.5" cy="6.5" r="5" stroke="currentColor" strokeWidth="1.5" />
              <path d="M10.5 10.5L14 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
            <span style={{ color: '#444444', fontSize: 12, flex: 1 }}>Find...</span>
            <span style={{
              color: '#333333',
              fontSize: 10,
              background: '#1a1a1a',
              border: '1px solid #2a2a2a',
              padding: '1px 5px',
              borderRadius: 3,
              fontWeight: 500,
            }}>F</span>
          </div>
        </div>

        {/* Nav links */}
        <SidebarNav />

        {/* User section */}
        <div style={{ padding: '12px 16px', borderTop: '1px solid #1a1a1a' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            {session.user.image ? (
              <Image
                src={session.user.image}
                alt={session.user.name ?? 'User'}
                width={22}
                height={22}
                style={{ borderRadius: '50%', flexShrink: 0 }}
              />
            ) : (
              <div style={{
                width: 22, height: 22,
                borderRadius: '50%',
                background: '#2a2a2a',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: '#ffffff', fontSize: 10, fontWeight: 700,
                flexShrink: 0,
              }}>
                {session.user.name?.[0]?.toUpperCase() ?? '?'}
              </div>
            )}
            <div style={{ flex: 1, overflow: 'hidden' }}>
              <p style={{
                color: '#ffffff',
                fontSize: 12,
                fontWeight: 500,
                margin: 0,
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}>
                {session.user.name}
              </p>
              <p style={{
                color: '#444444',
                fontSize: 11,
                margin: 0,
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}>
                {session.user.email}
              </p>
            </div>
          </div>
          <SignOutButton />
        </div>

      </aside>

      {/* Main content */}
      <main style={{ flex: 1, overflow: 'auto', background: '#000000' }}>
        <SyncProvider needsSync={needsSync}>{children}</SyncProvider>
      </main>

    </div>
  )
}
