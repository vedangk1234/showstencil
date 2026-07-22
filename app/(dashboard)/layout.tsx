import Link from 'next/link'
import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import Image from 'next/image'
import { getUser } from '@/lib/db'
import { createServiceClient } from '@/lib/supabase'
import { logError } from '@/lib/logger'
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

  if (!user) redirect('/login')

  // Stamp last_active_at so background sync + token retention only apply to
  // users who still actively use the app (YouTube ToS III.E.4). Non-blocking:
  // failures are logged and never break page render.
  try {
    const supabase = createServiceClient()
    await supabase
      .from('users')
      .update({ last_active_at: new Date().toISOString() })
      .eq('id', session.user.id)
  } catch (err) {
    void logError({
      userId: session.user.id,
      route: 'app/(dashboard)/layout',
      error: err instanceof Error ? err.message : String(err),
      severity: 'warn',
    })
  }

  if (!user.onboarding_completed) redirect('/onboarding')

  return (
    <div className="flex h-screen bg-stencil-bg font-sans text-stencil-ink antialiased">

      {/* Sidebar */}
      <aside className="w-60 shrink-0 flex flex-col bg-stencil-bg border-r border-stencil-line px-[14px] py-[18px] gap-[18px]">

        {/* Brand */}
        <div className="flex items-center justify-between pt-[2px] px-[6px] pb-[14px] border-b border-dashed border-stencil-line">
          <Link href="/dashboard" style={{ textDecoration: 'none', cursor: 'pointer' }}>
            <span style={{ fontFamily: 'var(--font-montserrat)', fontWeight: 700, fontSize: 15, letterSpacing: '0.04em', textTransform: 'uppercase' }}>
              <span style={{ color: '#FFFFFF' }}>SHOW</span>
              <span style={{ color: '#737373' }}>STENCIL</span>
              <span style={{ color: '#FFFFFF' }}>.</span>
            </span>
          </Link>
          <span className="font-mono text-[9.5px] text-stencil-ink3 border border-stencil-line px-[5px] py-[2px]">
            {user?.subscription_plan ?? 'free'}
          </span>
        </div>

        <SidebarNav />

        {/* User card */}
        <div className="mt-auto border border-stencil-line p-2.5 flex items-center gap-[10px]">
          {session.user.image ? (
            <Image
              src={session.user.image}
              alt={session.user.name ?? 'User'}
              width={26}
              height={26}
              className="shrink-0"
            />
          ) : (
            <div className="size-[26px] shrink-0 bg-[linear-gradient(135deg,oklch(78%_0.19_145),oklch(72%_0.14_235))]" />
          )}
          <div className="flex-1 min-w-0">
            <div className="text-[12.5px] leading-[1.2] truncate">
              {session.user.name ?? 'You'}
            </div>
            <div className="font-mono text-[10px] text-stencil-ink3 truncate">
              {session.user.email}
            </div>
          </div>
          <SignOutButton />
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 overflow-auto bg-stencil-bg">
        <SyncProvider needsSync={false}>{children}</SyncProvider>
      </main>
    </div>
  )
}
