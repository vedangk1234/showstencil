import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import Image from 'next/image'
import { getUser, updateUserOnboardingStatus } from '@/lib/db'
import { SyncProvider } from '@/components/sync-context'
import SidebarNav from '@/components/dashboard/SidebarNav'
import SignOutButton from '@/components/dashboard/SignOutButton'

const T = {
  bg:     '#0A0A0A',
  surface:'#141414',
  line:   '#222222',
  ink:    '#EDEDED',
  ink2:   '#A1A1A1',
  ink3:   '#6E6E6E',
  accent: 'oklch(78% 0.19 145)',
  serif:  '"Instrument Serif", ui-serif, Georgia, serif',
  sans:   '"Geist", ui-sans-serif, system-ui, -apple-system, sans-serif',
  mono:   '"Geist Mono", ui-monospace, SFMono-Regular, monospace',
}

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
      background: T.bg,
      fontFamily: T.sans,
      color: T.ink,
      WebkitFontSmoothing: 'antialiased',
    }}>

      {/* Sidebar */}
      <aside style={{
        width: 240, flexShrink: 0,
        display: 'flex', flexDirection: 'column',
        background: T.bg,
        borderRight: `1px solid ${T.line}`,
        padding: '18px 14px',
        gap: 18,
      }}>

        {/* Brand */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10,
          padding: '2px 6px 14px',
          borderBottom: `1px dashed ${T.line}`,
        }}>
          <div style={{
            width: 24, height: 24, background: T.ink, color: T.bg,
            display: 'grid', placeItems: 'center',
            fontFamily: T.mono, fontWeight: 600, fontSize: 11,
            position: 'relative',
          }}>
            S
            <span style={{ position: 'absolute', inset: 3, border: `1px solid ${T.bg}` }} />
          </div>
          <span style={{
            fontFamily: T.serif, fontSize: 20, fontStyle: 'italic',
            letterSpacing: '-0.01em',
          }}>
            ShowStencil
          </span>
          <span style={{
            marginLeft: 'auto',
            fontFamily: T.mono, fontSize: 9.5, color: T.ink3,
            border: `1px solid ${T.line}`, padding: '2px 5px',
          }}>
            {user?.subscription_plan ?? 'free'}
          </span>
        </div>

        {/* Search hint */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '6px 10px',
          border: `1px solid ${T.line}`,
          fontFamily: T.mono, fontSize: 11, color: T.ink3,
        }}>
          <span>⌘</span>
          <span>Find...</span>
          <kbd style={{
            marginLeft: 'auto',
            fontFamily: T.mono, fontSize: 9.5,
            border: `1px solid ${T.line}`, padding: '1px 4px',
          }}>
            ⌘F
          </kbd>
        </div>

        <SidebarNav />

        {/* User card */}
        <div style={{
          marginTop: 'auto',
          border: `1px solid ${T.line}`,
          padding: 10,
          display: 'flex', alignItems: 'center', gap: 10,
        }}>
          {session.user.image ? (
            <Image
              src={session.user.image}
              alt={session.user.name ?? 'User'}
              width={26}
              height={26}
              style={{ flexShrink: 0 }}
            />
          ) : (
            <div style={{
              width: 26, height: 26,
              background: `linear-gradient(135deg, ${T.accent}, oklch(72% 0.14 235))`,
              flexShrink: 0,
            }} />
          )}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{
              fontSize: 12.5, lineHeight: 1.2,
              whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
            }}>
              {session.user.name ?? 'You'}
            </div>
            <div style={{
              fontFamily: T.mono, fontSize: 10, color: T.ink3,
              whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
            }}>
              {session.user.email}
            </div>
          </div>
          <SignOutButton />
        </div>
      </aside>

      {/* Main */}
      <main style={{ flex: 1, overflow: 'auto', background: T.bg }}>
        <SyncProvider needsSync={needsSync}>{children}</SyncProvider>
      </main>
    </div>
  )
}
