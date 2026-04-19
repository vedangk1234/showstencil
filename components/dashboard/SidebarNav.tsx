'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const workspace = [
  { href: '/dashboard',   label: 'Dashboard',  Icon: IconDashboard },
  { href: '/competitors', label: 'Competitors', Icon: IconUsers },
  { href: '/ideas',       label: 'Ideas',       Icon: IconLightbulb },
  { href: '/digest',      label: 'Digest',      Icon: IconFile },
]

const account = [
  { href: '/settings', label: 'Settings', Icon: IconSettings },
]

export default function SidebarNav() {
  const pathname = usePathname()
  const isActive = (href: string) =>
    pathname === href || (href !== '/dashboard' && pathname.startsWith(href))

  return (
    <nav className="flex-1 overflow-y-auto py-1 flex flex-col gap-[18px]">
      <Group label="Workspace">
        {workspace.map(({ href, label, Icon }) => (
          <Item key={href} href={href} label={label} Icon={Icon} active={isActive(href)} />
        ))}
      </Group>

      <Group label="Account">
        {account.map(({ href, label, Icon }) => (
          <Item key={href} href={href} label={label} Icon={Icon} active={isActive(href)} />
        ))}
      </Group>
    </nav>
  )
}

function Group({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="font-mono text-[9.5px] tracking-[0.16em] uppercase text-stencil-ink3 px-[14px] pb-[6px]">
        {label}
      </div>
      <div className="flex flex-col gap-px px-[6px]">
        {children}
      </div>
    </div>
  )
}

function Item({
  href, label, Icon, active,
}: { href: string; label: string; Icon: React.FC<{ active: boolean }>; active: boolean }) {
  return (
    <Link
      href={href}
      className={`flex items-center gap-[10px] px-2 py-[6px] text-[13px] no-underline relative rounded-[3px] ${
        active ? 'text-stencil-ink bg-stencil-surface' : 'text-stencil-ink2 bg-transparent'
      }`}
    >
      {active && (
        <span className="absolute left-[-8px] top-1 bottom-1 w-[2px] bg-stencil-accent" />
      )}
      <Icon active={active} />
      {label}
    </Link>
  )
}

// ─── Icons ────────────────────────────────────────────────────────────────────

function IconDashboard({ active }: { active: boolean }) {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none"
      className={`shrink-0 ${active ? 'text-stencil-accent' : 'text-stencil-ink3'}`}>
      <rect x="1" y="1" width="6" height="6" stroke="currentColor" strokeWidth="1.5"/>
      <rect x="9" y="1" width="6" height="6" stroke="currentColor" strokeWidth="1.5"/>
      <rect x="9" y="9" width="6" height="6" stroke="currentColor" strokeWidth="1.5"/>
      <rect x="1" y="9" width="6" height="6" stroke="currentColor" strokeWidth="1.5"/>
    </svg>
  )
}

function IconUsers({ active }: { active: boolean }) {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none"
      className={`shrink-0 ${active ? 'text-stencil-accent' : 'text-stencil-ink3'}`}>
      <circle cx="6" cy="5" r="2.5" stroke="currentColor" strokeWidth="1.5"/>
      <path d="M11 14v-1.5a3 3 0 0 0-3-3H4a3 3 0 0 0-3 3V14"
        stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
      <path d="M11 2.17a3 3 0 0 1 0 5.66"
        stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
  )
}

function IconLightbulb({ active }: { active: boolean }) {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none"
      className={`shrink-0 ${active ? 'text-stencil-accent' : 'text-stencil-ink3'}`}>
      <path d="M6 14h4M8 2a5 5 0 0 1 5 5c0 1.85-1 3.47-2.5 4.33V13H5.5v-1.67A5.01 5.01 0 0 1 3 7a5 5 0 0 1 5-5z"
        stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
    </svg>
  )
}

function IconFile({ active }: { active: boolean }) {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none"
      className={`shrink-0 ${active ? 'text-stencil-accent' : 'text-stencil-ink3'}`}>
      <path d="M9.5 1H4a1 1 0 0 0-1 1v12a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1V5.5L9.5 1z"
        stroke="currentColor" strokeWidth="1.5"/>
      <path d="M9.5 1v4.5H13" stroke="currentColor" strokeWidth="1.5"/>
      <path d="M5.5 9h5M5.5 11.5h3" stroke="currentColor" strokeWidth="1.5"/>
    </svg>
  )
}

function IconSettings({ active }: { active: boolean }) {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none"
      className={`shrink-0 ${active ? 'text-stencil-accent' : 'text-stencil-ink3'}`}>
      <circle cx="8" cy="8" r="2.5" stroke="currentColor" strokeWidth="1.5"/>
      <path d="M8 1v2M8 13v2M1 8h2M13 8h2"
        stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
  )
}
