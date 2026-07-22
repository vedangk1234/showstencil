interface TierBadgeProps {
  tier: number | null
  isDominator: boolean
}

export function TierBadge({ tier, isDominator }: TierBadgeProps) {
  if (isDominator) {
    return (
      <span style={{
        display: 'inline-block',
        padding: '3px 8px',
        fontSize: 10,
        fontWeight: 600,
        color: '#fbbf24',
        background: '#1a1200',
        border: '1px solid #3d2e00',
        borderRadius: 4,
        fontFamily: 'var(--font-geist-mono, monospace)',
        letterSpacing: '0.05em',
      }}>
        Top Performer
      </span>
    )
  }

  if (tier === 1) {
    return (
      <span style={{
        display: 'inline-block',
        padding: '3px 8px',
        fontSize: 10,
        fontWeight: 600,
        color: '#60a5fa',
        background: '#0a1628',
        border: '1px solid #1d3a6e',
        borderRadius: 4,
        fontFamily: 'var(--font-geist-mono, monospace)',
        letterSpacing: '0.05em',
      }}>
        Tier 1 · Similar
      </span>
    )
  }

  if (tier === 2) {
    return (
      <span style={{
        display: 'inline-block',
        padding: '3px 8px',
        fontSize: 10,
        fontWeight: 600,
        color: '#a78bfa',
        background: '#120a28',
        border: '1px solid #3a1d6e',
        borderRadius: 4,
        fontFamily: 'var(--font-geist-mono, monospace)',
        letterSpacing: '0.05em',
      }}>
        Tier 2 · Aspirational
      </span>
    )
  }

  return (
    <span style={{
      display: 'inline-block',
      padding: '3px 8px',
      fontSize: 10,
      fontWeight: 600,
      color: '#555555',
      background: '#111111',
      border: '1px solid #1a1a1a',
      borderRadius: 4,
      fontFamily: 'var(--font-geist-mono, monospace)',
      letterSpacing: '0.05em',
    }}>
      Unknown
    </span>
  )
}
