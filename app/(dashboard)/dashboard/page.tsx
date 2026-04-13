'use client'

import { useSyncStatus } from '@/components/sync-context'

export default function DashboardPage() {
  const { isSyncing, syncError } = useSyncStatus()

  if (isSyncing) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4">
        {/* Spinner */}
        <div className="w-10 h-10 rounded-full border-2 border-zinc-700 border-t-white animate-spin" />

        <div className="text-center">
          <h2 className="text-white text-lg font-semibold">Syncing your channel data...</h2>
          <p className="text-zinc-400 text-sm mt-1">
            This takes about 10–15 seconds on first load.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold text-white">Dashboard</h1>
      <p className="mt-2 text-zinc-400">Your analytics will appear here.</p>

      {syncError && (
        <p className="mt-3 text-sm text-red-400">
          Initial sync encountered an error — some data may be missing. It will retry on next
          load.
        </p>
      )}
    </div>
  )
}
