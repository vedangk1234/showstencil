'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

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
}

// ─── Main component ───────────────────────────────────────────────────────────

export function PricingClient({ currentPlan, isLoggedIn }: PricingClientProps) {
  const router = useRouter()
  const [loadingPlan, setLoadingPlan] = useState<'starter' | 'pro' | null>(null)

  async function handleCheckout(plan: 'starter' | 'pro') {
    if (!isLoggedIn) {
      router.push('/login')
      return
    }
    setLoadingPlan(plan)
    try {
      const res = await fetch('/api/create-checkout-session', {
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
      if (!data.url) {
        alert('No checkout URL received. Please try again.')
        return
      }
      window.location.href = data.url
      setTimeout(() => setLoadingPlan(null), 3000)
    } catch {
      alert('Something went wrong. Please try again.')
    } finally {
      setLoadingPlan(null)
    }
  }

  const planOrder: Record<'free' | 'starter' | 'pro', number> = { free: 0, starter: 1, pro: 2 }
  const currentOrder = currentPlan !== null ? planOrder[currentPlan] : -1

  function renderButton(card: 'free' | 'starter' | 'pro', isPopular: boolean) {
    const cardOrder = planOrder[card]
    const isCurrent = currentPlan === card
    const isUpgrade = cardOrder > currentOrder
    const isLoading = loadingPlan === card

    const baseClass = 'w-full py-3 px-6 rounded-xl font-semibold text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed'

    if (isCurrent) {
      return (
        <button disabled className={`${baseClass} bg-zinc-800 text-zinc-500 border border-zinc-700 cursor-default`}>
          Current Plan
        </button>
      )
    }

    if (card === 'free') {
      if (isLoggedIn) {
        // Already on a paid plan — can't downgrade from UI
        return (
          <span className="block w-full py-3 text-center text-xs text-zinc-600 font-mono">
            Manage subscription at Lemon Squeezy
          </span>
        )
      }
      return (
        <a
          href="/login"
          className={`${baseClass} bg-zinc-800 text-zinc-300 hover:bg-zinc-700 border border-zinc-700 text-center inline-block`}
        >
          Get Started
        </a>
      )
    }

    if (!isUpgrade && isLoggedIn) {
      // Downgrade path — don't offer in-app
      return (
        <span className="block w-full py-3 text-center text-xs text-zinc-600 font-mono">
          Manage subscription at Lemon Squeezy
        </span>
      )
    }

    // Upgrade path or not logged in
    if (isPopular) {
      return (
        <button
          onClick={() => void handleCheckout(card as 'starter' | 'pro')}
          disabled={isLoading || loadingPlan !== null}
          className={`${baseClass} bg-emerald-500 hover:bg-emerald-400 text-black`}
        >
          {isLoading ? 'Redirecting…' : isLoggedIn ? 'Start 7-day free trial' : 'Start 7-day free trial'}
        </button>
      )
    }

    return (
      <button
        onClick={() => void handleCheckout(card as 'starter' | 'pro')}
        disabled={isLoading || loadingPlan !== null}
        className={`${baseClass} bg-zinc-800 text-zinc-200 hover:bg-zinc-700 border border-zinc-700`}
      >
        {isLoading ? 'Redirecting…' : 'Start 7-day free trial'}
      </button>
    )
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

        {/* Cards grid — 3 columns on md+, 1 column on mobile */}
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
    </div>
  )
}
