'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const group1 = [
  { href: '/dashboard',   label: 'Dashboard',   Icon: IconDashboard },
  { href: '/competitors', label: 'Competitors',  Icon: IconUsers },
  { href: '/ideas',       label: 'Ideas',        Icon: IconLightbulb },
  { href: '/digest',      label: 'Digest',       Icon: IconFile },
]

const group2 = [
  { href: '/settings', label: 'Settings', Icon: IconSettings },
]

export default function SidebarNav() {
  const pathname = usePathname()
  const isActive = (href: string) =>
    pathname === href || (href !== '/dashboard' && pathname.startsWith(href))

  return (
    <nav style={{ flex: 1, overflowY: 'auto', padding: '6px 0' }}>

      {/* Group 1 */}
      <div style={{ padding: '2px 8px' }}>
        {group1.map(({ href, label, Icon }) => {
          const active = isActive(href)
          return (
            <NavItem key={href} href={href} label={label} Icon={Icon} active={active} />
          )
        })}
      </div>

      {/* Divider */}
      <div style={{ height: 1, background: '#1a1a1a', margin: '6px 0' }} />

      {/* Group 2 */}
      <div style={{ padding: '2px 8px' }}>
        {group2.map(({ href, label, Icon }) => {
          const active = isActive(href)
          return (
            <NavItem key={href} href={href} label={label} Icon={Icon} active={active} />
          )
        })}
      </div>

    </nav>
  )
}

function NavItem({
  href,
  label,
  Icon,
  active,
}: {
  href: string
  label: string
  Icon: React.FC<{ active: boolean }>
  active: boolean
}) {
  return (
    <Link
      href={href}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '6px 8px',
        borderRadius: 4,
        color: active ? '#ffffff' : '#888888',
        fontSize: 13,
        textDecoration: 'none',
        lineHeight: 1.4,
      }}
      onMouseEnter={(e) => {
        if (!active) (e.currentTarget as HTMLElement).style.color = '#cccccc'
      }}
      onMouseLeave={(e) => {
        if (!active) (e.currentTarget as HTMLElement).style.color = '#888888'
      }}
    >
      <Icon active={active} />
      {label}
    </Link>
  )
}

// ─── Icons ────────────────────────────────────────────────────────────────────

function IconDashboard({ active }: { active: boolean }) {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0, color: active ? '#ffffff' : '#888888' }}>
      <rect x="1" y="1" width="6" height="6" rx="1" stroke="currentColor" strokeWidth="1.5" />
      <rect x="9" y="1" width="6" height="6" rx="1" stroke="currentColor" strokeWidth="1.5" />
      <rect x="9" y="9" width="6" height="6" rx="1" stroke="currentColor" strokeWidth="1.5" />
      <rect x="1" y="9" width="6" height="6" rx="1" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  )
}

function IconUsers({ active }: { active: boolean }) {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0, color: active ? '#ffffff' : '#888888' }}>
      <path d="M11 14v-1.5a3 3 0 0 0-3-3H4a3 3 0 0 0-3 3V14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <circle cx="6" cy="5" r="2.5" stroke="currentColor" strokeWidth="1.5" />
      <path d="M15 14v-1.5a3 3 0 0 0-2-2.83" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M11 2.17a3 3 0 0 1 0 5.66" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}

function IconLightbulb({ active }: { active: boolean }) {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0, color: active ? '#ffffff' : '#888888' }}>
      <path d="M6 14h4M8 2a5 5 0 0 1 5 5c0 1.85-1 3.47-2.5 4.33V13H5.5v-1.67A5.01 5.01 0 0 1 3 7a5 5 0 0 1 5-5z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function IconFile({ active }: { active: boolean }) {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0, color: active ? '#ffffff' : '#888888' }}>
      <path d="M9.5 1H4a1 1 0 0 0-1 1v12a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1V5.5L9.5 1z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M9.5 1v4.5H13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M5.5 9h5M5.5 11.5h3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}

function IconSettings({ active }: { active: boolean }) {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0, color: active ? '#ffffff' : '#888888' }}>
      <circle cx="8" cy="8" r="2.5" stroke="currentColor" strokeWidth="1.5" />
      <path d="M8 1v2M8 13v2M1 8h2M13 8h2M2.93 2.93l1.41 1.41M11.66 11.66l1.41 1.41M2.93 13.07l1.41-1.41M11.66 4.34l1.41-1.41" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}
