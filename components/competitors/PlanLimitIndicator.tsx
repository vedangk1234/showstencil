interface PlanLimitIndicatorProps {
  current: number
  max: number
  plan: string
}

export function PlanLimitIndicator({ current, max, plan }: PlanLimitIndicatorProps) {
  const planName = plan ? plan.charAt(0).toUpperCase() + plan.slice(1) : 'Free'

  return (
    <p style={{ color: '#555555', fontSize: 13, margin: 0 }}>
      {current}/{max} competitors tracked · {planName} plan
    </p>
  )
}
