'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import type { SubscriptionStatus } from '@/types'

// ─── Feature list helpers ──────────────────────────────────────────────────────

interface Feature {
  text: string
  included: boolean
}

const FREE_FEATURES: Feature[] = [
  { text: '1 competitor tracked automatically', included: true },
  { text: '1 video idea per month', included: true },
  { text: 'Weekly Monday digest', included: true },
  { text: 'Basic safe hook only', included: true },
  { text: 'Manual competitor adds', included: false },
  { text: 'AI competitor insights', included: false },
  { text: 'Thumbnail generation', included: false },
  { text: 'Bolder and controversial hooks', included: false },
]

const STARTER_FEATURES: Feature[] = [
  { text: '5 competitors tracked automatically', included: true },
  { text: '1 manual competitor add', included: true },
  { text: '3 video ideas per month', included: true },
  { text: 'All 3 hooks per idea (safe, bolder, controversial)', included: true },
  { text: 'AI competitor insights', included: true },
  { text: '12 thumbnail generations per month', included: true },
  { text: 'Weekly Monday digest', included: true },
  { text: 'Daily digest', included: false },
]

const PRO_FEATURES: Feature[] = [
  { text: '10 competitors tracked automatically', included: true },
  { text: '3 manual competitor adds', included: true },
  { text: '10 video ideas per week', included: true },
  { text: 'All 3 hooks per idea (safe, bolder, controversial)', included: true },
  { text: 'AI competitor insights', included: true },
  { text: '40 thumbnail generations per month', included: true },
  { text: 'Daily digest option', included: true },
  { text: 'Real-time trend alerts', included: true },
  { text: '12-week digest archive', included: true },
]

// ─── Check / X icons ─────────────────────────────────────────────────────────

function CheckIcon() {
  return (
    <svg className="w-4 h-4 text-emerald-400 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
    </svg>
  )
}

function XIcon() {
  return (
    <svg className="w-4 h-4 text-zinc-700 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
    </svg>
  )
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface PricingClientProps {
  currentPlan: 'free' | 'starter' | 'pro' | null
  isLoggedIn: boolean
  subscriptionStatus: SubscriptionStatus | null
  currentPeriodEnd: string | null
}

// ─── Main component ───────────────────────────────────────────────────────────

export function PricingClient({
  currentPlan,
  isLoggedIn,
  subscriptionStatus,
  currentPeriodEnd,
}: PricingClientProps) {
  const router = useRouter()
  const [loadingPlan, setLoadingPlan] = useState<'starter' | 'pro' | null>(null)

  // Cancel modal state
  const [showCancelModal, setShowCancelModal] = useState(false)
  const [cancelLoading, setCancelLoading] = useState(false)
  const [cancelError, setCancelError] = useState<string | null>(null)
  const [cancelled, setCancelled] = useState(false)
  const [accessUntil, setAccessUntil] = useState<string | null>(currentPeriodEnd)

  // Downgrade modal state
  const [showDowngradeModal, setShowDowngradeModal] = useState(false)
  const [downgradeLoading, setDowngradeLoading] = useState(false)
  const [downgradeError, setDowngradeError] = useState<string | null>(null)

  // Determine effective plan — cancelled/expired/null all resolve to 'free'
  const isPaidActive = ['active', 'on_trial', 'past_due'].includes(subscriptionStatus ?? '')
  const effectivePlan: 'free' | 'starter' | 'pro' =
    isPaidActive && currentPlan ? currentPlan : 'free'

  function fmtDate(iso: string | null): string {
    if (!iso) return 'the end of your billing period'
    return new Date(iso).toLocaleDateString('en-US', {
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    })
  }

  async function handleCheckout(plan: 'starter' | 'pro') {
    if (!isLoggedIn) {
      router.push('/login')
      return
    }
    setLoadingPlan(plan)
    try {
      const res = await fetch('/api/subscription/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan }),
      })
      if (!res.ok) {
        const data = await res.json()
        alert(data.error || 'Something went wrong. Please try again.')
        return
      }
      const data = await res.json()
      if (!data.approvalUrl) {
        alert('No checkout URL received. Please try again.')
        return
      }
      console.log('[paypal] approve URL:', data.approvalUrl)
      window.location.href = data.approvalUrl
      setTimeout(() => setLoadingPlan(null), 3000)
    } catch {
      alert('Something went wrong. Please try again.')
    } finally {
      setLoadingPlan(null)
    }
  }

  async function handleCancel() {
    setCancelLoading(true)
    setCancelError(null)
    try {
      const res = await fetch('/api/subscription/cancel', { method: 'POST' })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setCancelError(data.error ?? 'Something went wrong. Please try again.')
        setCancelLoading(false)
        return
      }
      const data = await res.json().catch(() => ({}))
      if (data.accessUntil) setAccessUntil(data.accessUntil)
      setCancelled(true)
      setCancelLoading(false)
    } catch {
      setCancelError('Network error. Please try again.')
      setCancelLoading(false)
    }
  }

  async function handleDowngrade() {
    setDowngradeLoading(true)
    setDowngradeError(null)
    try {
      const res = await fetch('/api/subscription/downgrade', { method: 'POST' })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setDowngradeError(data.error ?? 'Something went wrong. Please try again.')
        setDowngradeLoading(false)
        return
      }
      const data = (await res.json()) as { approvalUrl?: string }
      if (data.approvalUrl) {
        window.location.href = data.approvalUrl
      } else {
        setDowngradeError('No approval URL received. Please try again.')
        setDowngradeLoading(false)
      }
    } catch {
      setDowngradeError('Network error. Please try again.')
      setDowngradeLoading(false)
    }
  }

  function closeCancelModal() {
    setShowCancelModal(false)
    setCancelError(null)
    if (cancelled) router.refresh()
  }

  const baseClass =
    'w-full py-3 px-6 rounded-xl font-semibold text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed'

  function renderButton(card: 'free' | 'starter' | 'pro', isPopular: boolean) {
    // ── Free card ──────────────────────────────────────────────────────────────
    if (card === 'free') {
      if (!isLoggedIn) {
        return (
          <a
            href="/login"
            className={`${baseClass} bg-zinc-800 text-zinc-300 hover:bg-zinc-700 border border-zinc-700 text-center inline-block`}
          >
            Get Started
          </a>
        )
      }
      if (effectivePlan === 'free') {
        return (
          <button
            disabled
            className={`${baseClass} bg-zinc-800 text-zinc-500 border border-zinc-700 cursor-default`}
          >
            Current Plan
          </button>
        )
      }
      // On a paid plan — free card is informational only
      return (
        <span className="block w-full py-3 text-center text-xs text-zinc-600 font-mono">
          Manage subscription at PayPal
        </span>
      )
    }

    // ── Starter card ───────────────────────────────────────────────────────────
    if (card === 'starter') {
      if (effectivePlan === 'starter') {
        return (
          <button
            onClick={() => setShowCancelModal(true)}
            className={baseClass}
            style={{ background: 'transparent', border: '1px solid #7f1d1d', color: '#f87171' }}
          >
            Cancel Subscription
          </button>
        )
      }
      if (effectivePlan === 'pro') {
        return (
          <button
            onClick={() => setShowDowngradeModal(true)}
            className={`${baseClass} bg-zinc-800 text-zinc-400 hover:bg-zinc-700 border border-zinc-700`}
          >
            Downgrade to Starter
          </button>
        )
      }
      // free → upgrade
      if (isPopular) {
        return (
          <button
            onClick={() => void handleCheckout('starter')}
            disabled={loadingPlan !== null}
            className={`${baseClass} bg-emerald-500 hover:bg-emerald-400 text-black`}
          >
            {loadingPlan === 'starter' ? 'Redirecting…' : 'Start 7-day free trial'}
          </button>
        )
      }
      return (
        <button
          onClick={() => void handleCheckout('starter')}
          disabled={loadingPlan !== null}
          className={`${baseClass} bg-zinc-800 text-zinc-200 hover:bg-zinc-700 border border-zinc-700`}
        >
          {loadingPlan === 'starter' ? 'Redirecting…' : 'Start 7-day free trial'}
        </button>
      )
    }

    // ── Pro card ───────────────────────────────────────────────────────────────
    if (effectivePlan === 'pro') {
      return (
        <button
          onClick={() => setShowCancelModal(true)}
          className={baseClass}
          style={{ background: 'transparent', border: '1px solid #7f1d1d', color: '#f87171' }}
        >
          Cancel Subscription
        </button>
      )
    }
    // free or starter → upgrade to pro
    return (
      <button
        onClick={() => void handleCheckout('pro')}
        disabled={loadingPlan !== null}
        className={`${baseClass} bg-zinc-800 text-zinc-200 hover:bg-zinc-700 border border-zinc-700`}
      >
        {loadingPlan === 'pro' ? 'Redirecting…' : 'Start 7-day free trial'}
      </button>
    )
  }

  // ─── Modal shared styles ───────────────────────────────────────────────────

  const modalOverlay: React.CSSProperties = {
    position: 'fixed',
    inset: 0,
    background: 'rgba(0,0,0,0.75)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 50,
    padding: '0 16px',
  }

  const modalCard: React.CSSProperties = {
    background: '#0a0a0a',
    border: '1px solid #1a1a1a',
    borderRadius: 10,
    padding: '24px',
    maxWidth: 420,
    width: '100%',
  }

  const modalTitle: React.CSSProperties = {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: 700,
    margin: '0 0 10px',
    letterSpacing: '-0.3px',
  }

  const modalBody: React.CSSProperties = {
    color: '#888888',
    fontSize: 13,
    margin: '0 0 20px',
    lineHeight: 1.6,
  }

  const btnRow: React.CSSProperties = {
    display: 'flex',
    gap: 10,
    justifyContent: 'flex-end',
  }

  const btnSecondary: React.CSSProperties = {
    padding: '8px 16px',
    fontSize: 13,
    fontWeight: 500,
    border: '1px solid #333333',
    borderRadius: 6,
    background: 'transparent',
    color: '#ffffff',
    cursor: 'pointer',
  }

  const btnDestructive: React.CSSProperties = {
    padding: '8px 16px',
    fontSize: 13,
    fontWeight: 500,
    border: '1px solid #7f1d1d',
    borderRadius: 6,
    background: 'transparent',
    color: '#f87171',
    cursor: 'pointer',
  }

  const btnMuted: React.CSSProperties = {
    padding: '8px 16px',
    fontSize: 13,
    fontWeight: 500,
    border: '1px solid #333333',
    borderRadius: 6,
    background: '#18181b',
    color: '#a1a1aa',
    cursor: 'pointer',
  }

  return (
    <div style={{ minHeight: '100vh', background: '#000000', color: '#ffffff', padding: '64px 24px' }}>
      <div style={{ maxWidth: 1100, margin: '0 auto' }}>

        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: 56 }}>
          <h1 style={{
            fontSize: 'clamp(28px, 5vw, 44px)',
            fontFamily: 'Georgia, serif',
            fontStyle: 'italic',
            fontWeight: 400,
            letterSpacing: '-0.02em',
            margin: '0 0 14px',
            color: '#ffffff',
          }}>
            Choose the right plan to grow
          </h1>
          <p style={{ color: '#555555', fontSize: 16, margin: 0 }}>
            Scale effortlessly with features designed to grow your channel
          </p>
        </div>

        {/* Cards grid */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
          gap: 20,
          alignItems: 'start',
        }}>

          {/* ── FREE CARD ── */}
          <div style={{
            background: '#0a0a0a',
            border: '1px solid #1a1a1a',
            borderRadius: 16,
            padding: 28,
            display: 'flex',
            flexDirection: 'column',
          }}>
            <div style={{ marginBottom: 20 }}>
              <p style={{ color: '#555555', fontSize: 11, fontFamily: 'monospace', letterSpacing: '0.1em', textTransform: 'uppercase', margin: '0 0 6px' }}>
                Free
              </p>
              <h2 style={{ fontSize: 28, fontWeight: 700, margin: '0 0 4px' }}>
                $0<span style={{ fontSize: 15, fontWeight: 400, color: '#555555' }}>/mo</span>
              </h2>
              <p style={{ color: '#555555', fontSize: 13, margin: 0 }}>Get started with the basics</p>
            </div>

            <div style={{ flex: 1, marginBottom: 24 }}>
              <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
                {FREE_FEATURES.map((f) => (
                  <li key={f.text} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 13, color: f.included ? '#cccccc' : '#444444' }}>
                    {f.included ? <CheckIcon /> : <XIcon />}
                    {f.text}
                  </li>
                ))}
              </ul>
            </div>

            {renderButton('free', false)}
          </div>

          {/* ── STARTER CARD (Most Popular) ── */}
          <div style={{
            background: '#0a0a0a',
            border: '2px solid #ffffff',
            borderRadius: 16,
            padding: 28,
            display: 'flex',
            flexDirection: 'column',
            position: 'relative',
            boxShadow: '0 0 40px rgba(255,255,255,0.04)',
          }}>
            {/* Most Popular badge */}
            <div style={{ position: 'absolute', top: -14, left: '50%', transform: 'translateX(-50%)' }}>
              <span style={{
                background: '#ffffff',
                color: '#000000',
                fontSize: 10,
                fontWeight: 700,
                fontFamily: 'monospace',
                letterSpacing: '0.1em',
                textTransform: 'uppercase',
                padding: '4px 12px',
                borderRadius: 999,
                whiteSpace: 'nowrap',
              }}>
                Most Popular
              </span>
            </div>

            <div style={{ marginBottom: 20 }}>
              <p style={{ color: '#888888', fontSize: 11, fontFamily: 'monospace', letterSpacing: '0.1em', textTransform: 'uppercase', margin: '0 0 6px' }}>
                Starter
              </p>
              <h2 style={{ fontSize: 28, fontWeight: 700, margin: '0 0 4px' }}>
                $29<span style={{ fontSize: 15, fontWeight: 400, color: '#555555' }}>/mo</span>
              </h2>
              <p style={{ color: '#555555', fontSize: 13, margin: '0 0 8px' }}>For serious creators ready to grow</p>
              <span style={{
                display: 'inline-block',
                fontSize: 10,
                fontFamily: 'monospace',
                color: '#4ade80',
                background: '#0a2018',
                border: '1px solid #1d5e3a',
                borderRadius: 4,
                padding: '2px 8px',
                letterSpacing: '0.05em',
              }}>
                7-day free trial
              </span>
            </div>

            <div style={{ flex: 1, marginBottom: 24 }}>
              <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
                {STARTER_FEATURES.map((f) => (
                  <li key={f.text} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 13, color: f.included ? '#cccccc' : '#444444' }}>
                    {f.included ? <CheckIcon /> : <XIcon />}
                    {f.text}
                  </li>
                ))}
              </ul>
            </div>

            {renderButton('starter', true)}
          </div>

          {/* ── PRO CARD ── */}
          <div style={{
            background: '#0a0a0a',
            border: '1px solid #1a1a1a',
            borderRadius: 16,
            padding: 28,
            display: 'flex',
            flexDirection: 'column',
          }}>
            <div style={{ marginBottom: 20 }}>
              <p style={{ color: '#555555', fontSize: 11, fontFamily: 'monospace', letterSpacing: '0.1em', textTransform: 'uppercase', margin: '0 0 6px' }}>
                Pro
              </p>
              <h2 style={{ fontSize: 28, fontWeight: 700, margin: '0 0 4px' }}>
                $79<span style={{ fontSize: 15, fontWeight: 400, color: '#555555' }}>/mo</span>
              </h2>
              <p style={{ color: '#555555', fontSize: 13, margin: '0 0 8px' }}>Everything you need to dominate your niche</p>
              <span style={{
                display: 'inline-block',
                fontSize: 10,
                fontFamily: 'monospace',
                color: '#4ade80',
                background: '#0a2018',
                border: '1px solid #1d5e3a',
                borderRadius: 4,
                padding: '2px 8px',
                letterSpacing: '0.05em',
              }}>
                7-day free trial
              </span>
            </div>

            <div style={{ flex: 1, marginBottom: 24 }}>
              <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
                {PRO_FEATURES.map((f) => (
                  <li key={f.text} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 13, color: f.included ? '#cccccc' : '#444444' }}>
                    {f.included ? <CheckIcon /> : <XIcon />}
                    {f.text}
                  </li>
                ))}
              </ul>
            </div>

            {renderButton('pro', false)}
          </div>

        </div>

        {/* Footer note */}
        <p style={{ textAlign: 'center', color: '#333333', fontSize: 12, marginTop: 40, fontFamily: 'monospace' }}>
          Both paid plans include a 7-day free trial. Cancel anytime. No credit card required until trial ends.
        </p>

      </div>

      {/* ── Cancel Subscription Modal ─────────────────────────────────────────── */}
      {showCancelModal && (
        <div
          style={modalOverlay}
          onClick={(e) => { if (e.target === e.currentTarget) closeCancelModal() }}
        >
          <div style={modalCard}>
            {cancelled ? (
              <>
                <h2 style={modalTitle}>Subscription cancelled</h2>
                <p style={modalBody}>
                  Your subscription has been cancelled. You&apos;ll keep full{' '}
                  <strong style={{ color: '#cccccc' }}>
                    {accessUntil
                      ? `access until ${fmtDate(accessUntil)}`
                      : 'access until the end of your billing period'}
                  </strong>
                  , then your account will move to the Free plan.
                </p>
                <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                  <button onClick={closeCancelModal} style={btnSecondary}>
                    Close
                  </button>
                </div>
              </>
            ) : (
              <>
                <h2 style={modalTitle}>Cancel your subscription?</h2>
                <p style={modalBody}>
                  Are you sure you want to cancel? You will keep access until{' '}
                  <strong style={{ color: '#cccccc' }}>{fmtDate(accessUntil)}</strong>. After that
                  your account will revert to the free plan.
                </p>

                {cancelError && (
                  <p style={{ color: '#f87171', fontSize: 12, margin: '0 0 16px' }}>{cancelError}</p>
                )}

                <div style={btnRow}>
                  <button
                    onClick={closeCancelModal}
                    disabled={cancelLoading}
                    style={{ ...btnSecondary, opacity: cancelLoading ? 0.5 : 1, cursor: cancelLoading ? 'not-allowed' : 'pointer' }}
                  >
                    Keep my plan
                  </button>
                  <button
                    onClick={handleCancel}
                    disabled={cancelLoading}
                    style={{ ...btnDestructive, opacity: cancelLoading ? 0.7 : 1, cursor: cancelLoading ? 'not-allowed' : 'pointer' }}
                  >
                    {cancelLoading ? 'Cancelling…' : 'Cancel subscription'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* ── Downgrade to Starter Modal ────────────────────────────────────────── */}
      {showDowngradeModal && (
        <div
          style={modalOverlay}
          onClick={(e) => { if (e.target === e.currentTarget) setShowDowngradeModal(false) }}
        >
          <div style={modalCard}>
            <h2 style={modalTitle}>Downgrade to Starter?</h2>
            <p style={modalBody}>
              Downgrading to Starter will reduce your competitors from 10 to 5 and ideas from 10 to
              3 per week. You will be redirected to PayPal to confirm the change.
            </p>

            {downgradeError && (
              <p style={{ color: '#f87171', fontSize: 12, margin: '0 0 16px' }}>{downgradeError}</p>
            )}

            <div style={btnRow}>
              <button
                onClick={() => { setShowDowngradeModal(false); setDowngradeError(null) }}
                disabled={downgradeLoading}
                style={{ ...btnSecondary, opacity: downgradeLoading ? 0.5 : 1, cursor: downgradeLoading ? 'not-allowed' : 'pointer' }}
              >
                Keep Pro
              </button>
              <button
                onClick={handleDowngrade}
                disabled={downgradeLoading}
                style={{ ...btnMuted, opacity: downgradeLoading ? 0.7 : 1, cursor: downgradeLoading ? 'not-allowed' : 'pointer' }}
              >
                {downgradeLoading ? 'Redirecting to PayPal…' : 'Downgrade to Starter'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
