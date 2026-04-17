'use client'

import { signOut } from 'next-auth/react'

export default function SignOutButton() {
  return (
    <button
      type="button"
      onClick={() => signOut({ callbackUrl: '/login' })}
      className="mt-1 w-full px-3 py-1.5 text-xs rounded-lg transition-colors text-left"
      style={{ color: '#6b7280' }}
      onMouseEnter={(e) => {
        const el = e.currentTarget as HTMLButtonElement
        el.style.color = '#d1d5db'
        el.style.background = '#16161a'
      }}
      onMouseLeave={(e) => {
        const el = e.currentTarget as HTMLButtonElement
        el.style.color = '#6b7280'
        el.style.background = 'transparent'
      }}
    >
      Sign out
    </button>
  )
}
