import Link from 'next/link'

interface UpgradeBannerProps {
  feature: string
  description: string
}

export function UpgradeBanner({ feature, description }: UpgradeBannerProps) {
  return (
    <div style={{
      marginBottom: 24,
      padding: '20px 24px',
      background: '#0a0a0a',
      border: '1px dashed #2a2a2a',
      borderRadius: 8,
      display: 'flex',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      gap: 16,
    }}>
      <div style={{ flex: 1 }}>
        <h3 style={{
          color: '#ffffff',
          fontSize: 14,
          fontWeight: 600,
          margin: '0 0 6px',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
        }}>
          🔒 {feature}
        </h3>
        <p style={{
          color: '#555555',
          fontSize: 12,
          margin: '0 0 10px',
          lineHeight: 1.6,
        }}>
          {description}
        </p>
        <p style={{ color: '#444444', fontSize: 11, margin: 0, fontFamily: 'monospace' }}>
          Pro Plan: ✓ Unlimited searches · ✓ 13 competitors · ✓ Full analysis
        </p>
      </div>
      <Link
        href="/pricing"
        style={{
          display: 'inline-block',
          padding: '8px 16px',
          background: '#ffffff',
          color: '#000000',
          borderRadius: 6,
          fontSize: 12,
          fontWeight: 600,
          textDecoration: 'none',
          whiteSpace: 'nowrap',
          flexShrink: 0,
        }}
      >
        Upgrade to Pro
      </Link>
    </div>
  )
}
