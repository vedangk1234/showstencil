'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

interface Props {
  currentPeriodEnd: string | null
}

export default function CancelSubscription({ currentPeriodEnd }: Props) {
  const router = useRouter()
  const [showModal, setShowModal] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function fmtDate(iso: string | null): string {
    if (!iso) return 'the end of your billing period'
    return new Date(iso).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
  }

  async function handleCancel() {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/subscription/cancel', { method: 'POST' })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setError(data.error ?? 'Something went wrong. Please try again.')
        setLoading(false)
        return
      }
      setShowModal(false)
      router.refresh()
    } catch {
      setError('Network error. Please try again.')
      setLoading(false)
    }
  }

  return (
    <>
      <button
        onClick={() => setShowModal(true)}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          padding: '8px 16px',
          fontSize: 13,
          fontWeight: 500,
          border: '1px solid #7f1d1d',
          borderRadius: 6,
          background: 'transparent',
          color: '#f87171',
          cursor: 'pointer',
          transition: 'background 0.15s',
        }}
        onMouseEnter={e => (e.currentTarget.style.background = '#1a0a0a')}
        onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
      >
        Cancel Subscription
      </button>

      {showModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.75)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 50,
            padding: '0 16px',
          }}
          onClick={e => { if (e.target === e.currentTarget) setShowModal(false) }}
        >
          <div style={{
            background: '#0a0a0a',
            border: '1px solid #1a1a1a',
            borderRadius: 10,
            padding: '24px',
            maxWidth: 420,
            width: '100%',
          }}>
            <h2 style={{ color: '#ffffff', fontSize: 16, fontWeight: 700, margin: '0 0 10px', letterSpacing: '-0.3px' }}>
              Cancel your subscription?
            </h2>
            <p style={{ color: '#888888', fontSize: 13, margin: '0 0 20px', lineHeight: 1.6 }}>
              You will keep access until <strong style={{ color: '#cccccc' }}>{fmtDate(currentPeriodEnd)}</strong>. After that you&apos;ll be downgraded to the Free plan and lose access to paid features.
            </p>

            {error && (
              <p style={{ color: '#f87171', fontSize: 12, margin: '0 0 16px' }}>{error}</p>
            )}

            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button
                onClick={() => { setShowModal(false); setError(null) }}
                disabled={loading}
                style={{
                  padding: '8px 16px',
                  fontSize: 13,
                  fontWeight: 500,
                  border: '1px solid #333333',
                  borderRadius: 6,
                  background: 'transparent',
                  color: '#ffffff',
                  cursor: loading ? 'not-allowed' : 'pointer',
                  opacity: loading ? 0.5 : 1,
                }}
              >
                Keep Subscription
              </button>
              <button
                onClick={handleCancel}
                disabled={loading}
                style={{
                  padding: '8px 16px',
                  fontSize: 13,
                  fontWeight: 500,
                  border: '1px solid #7f1d1d',
                  borderRadius: 6,
                  background: loading ? '#1a0a0a' : 'transparent',
                  color: '#f87171',
                  cursor: loading ? 'not-allowed' : 'pointer',
                  opacity: loading ? 0.7 : 1,
                }}
              >
                {loading ? 'Cancelling…' : 'Yes, Cancel'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
