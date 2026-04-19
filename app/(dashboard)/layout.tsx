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
    <div className="flex h-screen bg-stencil-bg font-sans text-stencil-ink antialiased">

      {/* Sidebar */}
      <aside className="w-60 shrink-0 flex flex-col bg-stencil-bg border-r border-stencil-line px-[14px] py-[18px] gap-[18px]">

        {/* Brand */}
        <div className="flex items-center gap-[10px] pt-[2px] px-[6px] pb-[14px] border-b border-dashed border-stencil-line">
          <div className="size-6 bg-stencil-ink text-stencil-bg grid place-items-center font-mono font-semibold text-[11px] relative">
            S
            <span className="absolute inset-[3px] border border-stencil-bg" />
          </div>
          <span className="font-serif text-xl italic tracking-[-0.01em]">
            ShowStencil
          </span>
          <span className="ml-auto font-mono text-[9.5px] text-stencil-ink3 border border-stencil-line px-[5px] py-[2px]">
            {user?.subscription_plan ?? 'free'}
          </span>
        </div>

        {/* Search hint */}
        <div className="flex items-center gap-2 px-[10px] py-[6px] border border-stencil-line font-mono text-[11px] text-stencil-ink3">
          <span>⌘</span>
          <span>Find...</span>
          <kbd className="ml-auto font-mono text-[9.5px] border border-stencil-line px-1 py-px">
            ⌘F
          </kbd>
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
        <SyncProvider needsSync={needsSync}>{children}</SyncProvider>
      </main>
    </div>
  )
}
