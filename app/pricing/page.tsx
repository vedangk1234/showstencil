'use client'

import { useState, useEffect } from 'react'

const starterFeatures = [
  'Competitor channels tracked: 3 channels',
  'Weekly intelligence digest every Monday',
  '3 video ideas per week',
  'Gap score analysis',
  'Revenue gap analysis',
  'Top 3 viral alerts from your niche',
  'Top 3 uncovered topic suggestions',
  '4 weeks digest archive',
  'Email support',
]

const proFeatures = [
  'Competitor channels tracked: 10 channels',
  'Weekly intelligence digest every Monday',
  '6 video ideas per week',
  'Full gap score breakdown per metric',
  'Revenue gap with annual projection',
  'Top 10 viral alerts from entire niche',
  'Top 5 uncovered topic suggestions',
  '12 weeks digest archive',
  'Search and compare any YouTube channel',
  'Priority email support',
]

export default function PricingPage() {
  const [loadingPlan, setLoadingPlan] = useState<'starter' | 'pro' | null>(null)

  useEffect(() => {
    setLoadingPlan(null)
  }, [])

  async function handleCheckout(plan: 'starter' | 'pro') {
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

      const { url } = await res.json()
      window.location.href = url
      setTimeout(() => setLoadingPlan(null), 3000)
    } catch {
      alert('Something went wrong. Please try again.')
    } finally {
      setLoadingPlan(null)
    }
  }

  return (
    <div className="min-h-screen bg-gray-950 text-white py-20 px-4">
      <div className="max-w-4xl mx-auto">
        <div className="text-center mb-14">
          <h1 className="text-4xl font-bold mb-3">Simple, transparent pricing</h1>
          <p className="text-gray-400 text-lg">Start free for 7 days. No credit card required.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {/* Starter card */}
          <div className="bg-gray-900 border border-gray-700 rounded-2xl p-8 flex flex-col">
            <div className="mb-6">
              <h2 className="text-xl font-semibold mb-1">Starter</h2>
              <div className="flex items-end gap-1 mt-3">
                <span className="text-4xl font-bold">$29</span>
                <span className="text-gray-400 mb-1">/month</span>
              </div>
            </div>

            <ul className="space-y-3 flex-1 mb-8">
              {starterFeatures.map((feature) => (
                <li key={feature} className="flex items-start gap-2 text-sm text-gray-300">
                  <svg className="w-4 h-4 text-green-500 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                  {feature}
                </li>
              ))}
            </ul>

            <button
              onClick={() => handleCheckout('starter')}
              disabled={loadingPlan !== null}
              className="w-full py-3 px-6 rounded-xl bg-white text-gray-900 font-semibold hover:bg-gray-100 transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loadingPlan === 'starter' ? 'Redirecting...' : 'Start free trial'}
            </button>
          </div>

          {/* Pro card */}
          <div className="bg-gray-900 border-2 border-blue-600 rounded-2xl p-8 flex flex-col relative">
            <div className="absolute -top-3.5 left-1/2 -translate-x-1/2">
              <span className="bg-blue-600 text-white text-xs font-semibold px-3 py-1 rounded-full">Most popular</span>
            </div>

            <div className="mb-6">
              <h2 className="text-xl font-semibold mb-1">Pro</h2>
              <div className="flex items-end gap-1 mt-3">
                <span className="text-4xl font-bold">$79</span>
                <span className="text-gray-400 mb-1">/month</span>
              </div>
            </div>

            <ul className="space-y-3 flex-1 mb-8">
              {proFeatures.map((feature) => (
                <li key={feature} className="flex items-start gap-2 text-sm text-gray-300">
                  <svg className="w-4 h-4 text-blue-400 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                  {feature}
                </li>
              ))}
            </ul>

            <button
              onClick={() => handleCheckout('pro')}
              disabled={loadingPlan !== null}
              className="w-full py-3 px-6 rounded-xl bg-blue-600 text-white font-semibold hover:bg-blue-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loadingPlan === 'pro' ? 'Redirecting...' : 'Start free trial'}
            </button>
          </div>
        </div>

        <p className="text-center text-gray-500 text-sm mt-10">
          Both plans include a 7-day free trial. Cancel anytime. No credit card required until trial ends.
        </p>
      </div>
    </div>
  )
}
