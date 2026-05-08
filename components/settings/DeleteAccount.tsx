'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function DeleteAccount() {
  const router = useRouter()
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [confirmText, setConfirmText] = useState('')
  const [isDeleting, setIsDeleting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function openModal() {
    setConfirmText('')
    setError(null)
    setIsModalOpen(true)
  }

  function closeModal() {
    if (isDeleting) return
    setIsModalOpen(false)
    setConfirmText('')
    setError(null)
  }

  async function handleDelete() {
    if (confirmText !== 'CONFIRM') return
    setIsDeleting(true)
    setError(null)
    try {
      const res = await fetch('/api/account/delete', { method: 'POST' })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setError(data.error ?? 'Something went wrong. Please try again.')
        setIsDeleting(false)
        return
      }
      router.push('/')
    } catch {
      setError('Network error. Please try again.')
      setIsDeleting(false)
    }
  }

  const canDelete = confirmText === 'CONFIRM' && !isDeleting

  return (
    <>
      <button
        onClick={openModal}
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
        Delete Account
      </button>

      {isModalOpen && (
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
          onClick={e => { if (e.target === e.currentTarget) closeModal() }}
        >
          <div style={{
            background: '#0a0a0a',
            border: '1px solid #3a1a1a',
            borderRadius: 10,
            padding: '24px',
            maxWidth: 440,
            width: '100%',
          }}>
            <h2 style={{ color: '#ffffff', fontSize: 16, fontWeight: 700, margin: '0 0 10px', letterSpacing: '-0.3px' }}>
              Delete your account?
            </h2>
            <p style={{ color: '#888888', fontSize: 13, margin: '0 0 20px', lineHeight: 1.6 }}>
              This will permanently delete your account, all your data, competitors, ideas, digests,
              and cancel any active subscription. This cannot be undone.
            </p>
            <p style={{ color: '#888888', fontSize: 13, margin: '0 0 8px' }}>
              Type <strong style={{ color: '#f87171', fontFamily: 'monospace' }}>CONFIRM</strong> below to proceed.
            </p>
            <input
              type="text"
              value={confirmText}
              onChange={e => setConfirmText(e.target.value)}
              disabled={isDeleting}
              placeholder="CONFIRM"
              autoComplete="off"
              style={{
                width: '100%',
                padding: '8px 12px',
                fontSize: 13,
                background: '#111111',
                border: '1px solid #2a2a2a',
                borderRadius: 6,
                color: '#ffffff',
                outline: 'none',
                marginBottom: 20,
                boxSizing: 'border-box',
                fontFamily: 'monospace',
                opacity: isDeleting ? 0.5 : 1,
              }}
            />

            {error && (
              <p style={{ color: '#f87171', fontSize: 12, margin: '0 0 16px' }}>{error}</p>
            )}

            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button
                onClick={closeModal}
                disabled={isDeleting}
                style={{
                  padding: '8px 16px',
                  fontSize: 13,
                  fontWeight: 500,
                  border: '1px solid #333333',
                  borderRadius: 6,
                  background: 'transparent',
                  color: '#ffffff',
                  cursor: isDeleting ? 'not-allowed' : 'pointer',
                  opacity: isDeleting ? 0.5 : 1,
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={!canDelete}
                style={{
                  padding: '8px 16px',
                  fontSize: 13,
                  fontWeight: 500,
                  border: '1px solid #7f1d1d',
                  borderRadius: 6,
                  background: canDelete ? '#1a0505' : 'transparent',
                  color: canDelete ? '#f87171' : '#555555',
                  cursor: canDelete ? 'pointer' : 'not-allowed',
                  transition: 'background 0.15s, color 0.15s',
                }}
              >
                {isDeleting ? 'Deleting…' : 'Delete Account'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
