'use client'

/**
 * components/sync-context.tsx
 * Manages first-time channel sync state across the dashboard layout and pages.
 *
 * Usage:
 *   Layout (server component) wraps children in <SyncProvider needsSync={bool} />.
 *   Dashboard page (client component) reads state via useSyncStatus().
 */

import { createContext, useContext, useEffect, useState, ReactNode } from 'react'

interface SyncContextValue {
  /** true while /api/sync is in-flight */
  isSyncing: boolean
  /** true once sync has finished (successfully or not) */
  syncComplete: boolean
  /** true if the sync request returned a non-ok response */
  syncError: boolean
}

const SyncContext = createContext<SyncContextValue>({
  isSyncing: false,
  syncComplete: true,
  syncError: false,
})

export function SyncProvider({
  needsSync,
  children,
}: {
  needsSync: boolean
  children: ReactNode
}) {
  const [isSyncing, setIsSyncing] = useState(needsSync)
  const [syncComplete, setSyncComplete] = useState(!needsSync)
  const [syncError, setSyncError] = useState(false)

  useEffect(() => {
    if (!needsSync) return

    fetch('/api/sync', { method: 'POST' })
      .then((r) => {
        if (!r.ok) throw new Error(`Sync failed with status ${r.status}`)
        return r.json()
      })
      .then((data) => {
        console.log('[sync-context] Initial sync complete:', data.message)
        setSyncComplete(true)
      })
      .catch((err) => {
        console.error('[sync-context] Initial sync error:', err)
        setSyncError(true)
        setSyncComplete(true) // stop blocking UI even on error
      })
      .finally(() => setIsSyncing(false))
  }, [needsSync])

  return (
    <SyncContext.Provider value={{ isSyncing, syncComplete, syncError }}>
      {children}
    </SyncContext.Provider>
  )
}

export function useSyncStatus(): SyncContextValue {
  return useContext(SyncContext)
}
