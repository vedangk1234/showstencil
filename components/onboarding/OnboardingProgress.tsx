'use client'

interface Props {
  currentStep: number
  totalSteps: number
}

const STEP_LABELS = [
  '',
  'Welcome',
  'Your channel',
  'Your niche',
  'Your competitors',
  'Your analysis',
]

export default function OnboardingProgress({ currentStep, totalSteps }: Props) {
  return (
    <div className="flex flex-col items-center gap-3">
      <div className="flex gap-2">
        {Array.from({ length: totalSteps }, (_, i) => {
          const stepNum = i + 1
          const isComplete = stepNum < currentStep
          const isCurrent = stepNum === currentStep
          return (
            <div
              key={stepNum}
              className={`h-1.5 rounded-full transition-all duration-300 ${
                isCurrent
                  ? 'w-8 bg-white'
                  : isComplete
                  ? 'w-1.5 bg-green-400'
                  : 'w-1.5 bg-zinc-700'
              }`}
            />
          )
        })}
      </div>
      <div className="text-[11px] font-mono uppercase tracking-widest text-zinc-500 text-center">
        Step {currentStep} of {totalSteps} — {STEP_LABELS[currentStep]}
      </div>
    </div>
  )
}
