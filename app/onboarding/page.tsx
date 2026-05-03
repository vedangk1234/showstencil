'use client'

import { useState, useEffect, Suspense } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter, useSearchParams } from 'next/navigation'
import StepWelcome from '@/components/onboarding/StepWelcome'
import StepConfirmChannel from '@/components/onboarding/StepConfirmChannel'
import StepConfirmNiche from '@/components/onboarding/StepConfirmNiche'
import StepMeetCompetitors from '@/components/onboarding/StepMeetCompetitors'
import StepFirstAnalysis from '@/components/onboarding/StepFirstAnalysis'
import OnboardingProgress from '@/components/onboarding/OnboardingProgress'

type Step = 1 | 2 | 3 | 4 | 5

interface AnalysisResult {
  gapScore: number | null
  primaryBottleneck: string | null
  topIdeaTitle: string | null
  topIdeaReason: string | null
}

function OnboardingContent() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const searchParams = useSearchParams()

  const initialStep = (() => {
    const s = Number(searchParams.get('step'))
    if (s >= 1 && s <= 5) return s as Step
    return 1
  })()

  const [step, setStep] = useState<Step>(initialStep)
  const [analysisResult, setAnalysisResult] = useState<AnalysisResult>({
    gapScore: null,
    primaryBottleneck: null,
    topIdeaTitle: null,
    topIdeaReason: null,
  })
  const [syncStarted, setSyncStarted] = useState(false)

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/api/auth/signin?callbackUrl=/onboarding')
    }
  }, [status, router])

  const goToStep = (s: Step) => {
    setStep(s)
    router.replace(`/onboarding?step=${s}`, { scroll: false })
  }

  const startBackgroundSync = async () => {
    if (syncStarted) return
    setSyncStarted(true)
    try {
      await fetch('/api/sync', { method: 'POST' })
    } catch (err) {
      console.error('[onboarding] Sync failed:', err)
    }
  }

  const skipOnboarding = async () => {
    try {
      await fetch('/api/onboarding/complete', { method: 'POST' })
    } catch {
      // Continue anyway
    }
    router.push('/dashboard')
  }

  if (status === 'loading') {
    return (
      <div className="min-h-screen bg-[#0A0A0A] flex items-center justify-center">
        <div className="text-zinc-400 text-sm font-mono">Loading...</div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#0A0A0A] text-white flex flex-col">
      {step > 1 && (
        <button
          onClick={skipOnboarding}
          className="absolute top-6 right-6 text-xs text-zinc-500 hover:text-zinc-300 font-mono transition-colors z-10"
        >
          Skip onboarding →
        </button>
      )}

      <div className="pt-12 px-6">
        <OnboardingProgress currentStep={step} totalSteps={5} />
      </div>

      <div className="flex-1 flex items-center justify-center px-6 pb-12">
        <div className="w-full max-w-2xl">
          {step === 1 && (
            <StepWelcome
              onNext={() => {
                startBackgroundSync()
                goToStep(2)
              }}
            />
          )}
          {step === 2 && (
            <StepConfirmChannel
              session={session}
              onNext={() => goToStep(3)}
            />
          )}
          {step === 3 && (
            <StepConfirmNiche onNext={() => goToStep(4)} />
          )}
          {step === 4 && (
            <StepMeetCompetitors onNext={() => goToStep(5)} />
          )}
          {step === 5 && (
            <StepFirstAnalysis
              result={analysisResult}
              setResult={setAnalysisResult}
            />
          )}
        </div>
      </div>
    </div>
  )
}

export default function OnboardingPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-[#0A0A0A] flex items-center justify-center">
          <div className="text-zinc-400 text-sm font-mono">Loading...</div>
        </div>
      }
    >
      <OnboardingContent />
    </Suspense>
  )
}
