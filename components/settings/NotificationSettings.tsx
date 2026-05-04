'use client'

import { useState, useTransition } from 'react'

interface Props {
  initialDigestEnabled: boolean
  initialAlertsEnabled: boolean
  initialThreshold: number
}

export default function NotificationSettings({
  initialDigestEnabled,
  initialAlertsEnabled,
  initialThreshold,
}: Props) {
  const [digestEnabled, setDigestEnabled] = useState(initialDigestEnabled)
  const [alertsEnabled, setAlertsEnabled] = useState(initialAlertsEnabled)
  const [threshold, setThreshold] = useState(initialThreshold)
  const [savedField, setSavedField] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const save = async (updates: {
    weekly_digest_enabled?: boolean
    alerts_enabled?: boolean
    alert_threshold_multiplier?: number
  }, fieldName: string) => {
    startTransition(async () => {
      try {
        await fetch('/api/settings/notifications', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(updates),
        })
        setSavedField(fieldName)
        setTimeout(() => setSavedField(null), 2000)
      } catch {
        // Silent fail — state already updated optimistically
      }
    })
  }

  const toggleDigest = () => {
    const next = !digestEnabled
    setDigestEnabled(next)
    save({ weekly_digest_enabled: next }, 'digest')
  }

  const toggleAlerts = () => {
    const next = !alertsEnabled
    setAlertsEnabled(next)
    save({ alerts_enabled: next }, 'alerts')
  }

  const handleThresholdChange = (value: number) => {
    setThreshold(value)
  }

  const handleThresholdCommit = (value: number) => {
    save({ alert_threshold_multiplier: value }, 'threshold')
  }

  return (
    <div className="flex flex-col gap-6">

      {/* Weekly digest toggle */}
      <div className="flex items-center justify-between py-4 border-b border-zinc-800">
        <div className="flex flex-col gap-1">
          <div className="text-sm font-medium text-white">
            Weekly digest email
          </div>
          <div className="text-xs text-zinc-500">
            Every Monday at 9am — your channel analysis and video ideas
          </div>
        </div>
        <div className="flex items-center gap-3">
          {savedField === 'digest' && (
            <span className="text-xs text-green-400 font-mono">Saved ✓</span>
          )}
          <button
            onClick={toggleDigest}
            disabled={isPending}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors duration-200 focus:outline-none disabled:opacity-50 ${
              digestEnabled ? 'bg-green-500' : 'bg-zinc-700'
            }`}
            role="switch"
            aria-checked={digestEnabled}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform duration-200 ${
                digestEnabled ? 'translate-x-6' : 'translate-x-1'
              }`}
            />
          </button>
        </div>
      </div>

      {/* Viral trend alerts toggle */}
      <div className="flex items-center justify-between py-4 border-b border-zinc-800">
        <div className="flex flex-col gap-1">
          <div className="text-sm font-medium text-white">
            Viral trend alerts
          </div>
          <div className="text-xs text-zinc-500">
            Get notified when a competitor video goes viral in your niche
          </div>
        </div>
        <div className="flex items-center gap-3">
          {savedField === 'alerts' && (
            <span className="text-xs text-green-400 font-mono">Saved ✓</span>
          )}
          <button
            onClick={toggleAlerts}
            disabled={isPending}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors duration-200 focus:outline-none disabled:opacity-50 ${
              alertsEnabled ? 'bg-green-500' : 'bg-zinc-700'
            }`}
            role="switch"
            aria-checked={alertsEnabled}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform duration-200 ${
                alertsEnabled ? 'translate-x-6' : 'translate-x-1'
              }`}
            />
          </button>
        </div>
      </div>

      {/* Alert threshold slider */}
      <div className="flex flex-col gap-3 py-4">
        <div className="flex items-center justify-between">
          <div className="flex flex-col gap-1">
            <div className="text-sm font-medium text-white">
              Alert threshold
            </div>
            <div className="text-xs text-zinc-500">
              A competitor video must exceed {threshold}× their average
              views to trigger an alert.
            </div>
          </div>
          <div className="flex items-center gap-3">
            {savedField === 'threshold' && (
              <span className="text-xs text-green-400 font-mono">Saved ✓</span>
            )}
            <span className="text-sm font-mono text-white w-12 text-right">
              {threshold}×
            </span>
          </div>
        </div>

        <input
          type="range"
          min={1.5}
          max={10}
          step={0.5}
          value={threshold}
          onChange={(e) => handleThresholdChange(Number(e.target.value))}
          onMouseUp={(e) => handleThresholdCommit(Number((e.target as HTMLInputElement).value))}
          onTouchEnd={(e) => handleThresholdCommit(Number((e.target as HTMLInputElement).value))}
          disabled={!alertsEnabled}
          className="w-full h-1.5 bg-zinc-700 rounded-full appearance-none cursor-pointer accent-green-500 disabled:opacity-40 disabled:cursor-not-allowed"
        />

        <div className="flex justify-between text-[10px] font-mono text-zinc-600">
          <span>1.5× (sensitive)</span>
          <span>10× (rare only)</span>
        </div>

        {!alertsEnabled && (
          <div className="text-xs text-zinc-600 italic">
            Enable viral trend alerts above to adjust the threshold.
          </div>
        )}
      </div>

    </div>
  )
}
