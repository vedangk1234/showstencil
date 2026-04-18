import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import { getUser, getUserSettings } from '@/lib/db'
import type { User, UserSettings } from '@/types'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function planLabel(user: User): string {
  const status = user.subscription_status
  if (status === 'on_trial') return 'Trial (Starter features)'
  const plan = user.subscription_plan ?? 'free'
  return plan.charAt(0).toUpperCase() + plan.slice(1)
}

function planColor(user: User): string {
  const plan = user.subscription_plan ?? 'free'
  if (plan === 'pro') return '#a78bfa'
  if (plan === 'starter') return '#60a5fa'
  return '#555555'
}

function fmtDate(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 24 }}>
      <p style={{
        color: '#444444',
        fontSize: 11,
        fontWeight: 600,
        textTransform: 'uppercase',
        letterSpacing: '0.06em',
        margin: '0 0 10px',
      }}>
        {title}
      </p>
      <div style={{
        background: '#0a0a0a',
        border: '1px solid #1a1a1a',
        borderRadius: 8,
        overflow: 'hidden',
      }}>
        {children}
      </div>
    </div>
  )
}

function Row({
  label,
  value,
  badge,
}: {
  label: string
  value: React.ReactNode
  badge?: React.ReactNode
}) {
  return (
    <div style={{
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      padding: '12px 16px',
      borderBottom: '1px solid #111111',
    }}>
      <span style={{ color: '#888888', fontSize: 13 }}>{label}</span>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        {badge}
        <span style={{ color: '#ffffff', fontSize: 13, fontWeight: 500 }}>{value}</span>
      </div>
    </div>
  )
}

function Toggle({ enabled, label }: { enabled: boolean; label: string }) {
  return (
    <div style={{
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      padding: '12px 16px',
      borderBottom: '1px solid #111111',
    }}>
      <span style={{ color: '#888888', fontSize: 13 }}>{label}</span>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
      }}>
        <span style={{ color: enabled ? '#00c853' : '#444444', fontSize: 12 }}>
          {enabled ? 'Enabled' : 'Disabled'}
        </span>
        <div style={{
          width: 32, height: 18,
          borderRadius: 9,
          background: enabled ? '#00421a' : '#1a1a1a',
          border: `1px solid ${enabled ? '#00c853' : '#333333'}`,
          position: 'relative',
          flexShrink: 0,
        }}>
          <div style={{
            position: 'absolute',
            top: 2,
            left: enabled ? 14 : 2,
            width: 12,
            height: 12,
            borderRadius: '50%',
            background: enabled ? '#00c853' : '#444444',
            transition: 'left 0.15s ease',
          }} />
        </div>
      </div>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function SettingsPage() {
  const session = await auth()
  if (!session) redirect('/login')

  const [user, settings] = await Promise.all([
    getUser(session.user.id),
    getUserSettings(session.user.id),
  ])

  const digestEnabled = settings?.weekly_digest_enabled ?? true
  const alertsEnabled = settings?.alerts_enabled ?? true
  const threshold = settings?.alert_threshold_multiplier ?? 3.0

  return (
    <div style={{ padding: '28px 32px', maxWidth: 600 }}>

      {/* Header */}
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ color: '#ffffff', fontSize: 18, fontWeight: 700, margin: '0 0 4px', letterSpacing: '-0.3px' }}>
          Settings
        </h1>
        <p style={{ color: '#555555', fontSize: 13, margin: 0 }}>
          Manage your account and notification preferences.
        </p>
      </div>

      {/* Account */}
      <Section title="Account">
        <Row label="Name" value={user?.name ?? '—'} />
        <Row label="Email" value={user?.email ?? session.user.email ?? '—'} />
        <Row
          label="Plan"
          value={user ? planLabel(user) : '—'}
          badge={user && (
            <span style={{
              fontSize: 10,
              fontWeight: 700,
              color: planColor(user),
              background: '#111111',
              border: `1px solid #1a1a1a`,
              borderRadius: 4,
              padding: '2px 7px',
            }}>
              {(user.subscription_plan ?? 'free').toUpperCase()}
            </span>
          )}
        />
        {user?.trial_ends_at && (
          <Row label="Trial ends" value={fmtDate(user.trial_ends_at)} />
        )}
        {user?.current_period_end && !user.trial_ends_at && (
          <Row label="Renews" value={fmtDate(user.current_period_end)} />
        )}
        <div style={{ padding: '12px 16px' }}>
          <span style={{ color: '#888888', fontSize: 13 }}>YouTube channel</span>
          <div style={{ marginTop: 4 }}>
            {user?.youtube_channel_id ? (
              <span style={{ color: '#00c853', fontSize: 12 }}>
                ✓ Connected · {user.youtube_channel_id}
              </span>
            ) : (
              <span style={{ color: '#ff4444', fontSize: 12 }}>
                Not connected — please sign out and sign back in to reconnect
              </span>
            )}
          </div>
        </div>
      </Section>

      {/* Notifications */}
      <Section title="Notifications">
        <Toggle enabled={digestEnabled} label="Weekly digest email" />
        <Toggle enabled={alertsEnabled} label="Viral trend alerts" />
        <div style={{ padding: '12px 16px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ color: '#888888', fontSize: 13 }}>Alert threshold</span>
            <span style={{ color: '#ffffff', fontSize: 13, fontWeight: 500 }}>
              {threshold}× channel average
            </span>
          </div>
          <p style={{ color: '#444444', fontSize: 11, margin: '4px 0 0', lineHeight: 1.5 }}>
            A competitor video must exceed {threshold}× their average views to trigger an alert.
          </p>
        </div>
        <div style={{ padding: '10px 16px', borderTop: '1px solid #111111' }}>
          <p style={{ color: '#333333', fontSize: 11, margin: 0 }}>
            To update notification preferences, use the API:{' '}
            <code style={{ color: '#555555', fontSize: 10 }}>POST /api/settings/notifications</code>
            {'. '}
            Full settings UI coming soon.
          </p>
        </div>
      </Section>

      {/* Niche */}
      <Section title="Channel Analysis">
        <Row label="Detected niche" value={user?.niche_id ? user.niche_id.charAt(0).toUpperCase() + user.niche_id.slice(1) : 'Not detected yet'} />
        {user?.niche_detected_at && (
          <Row label="Detected on" value={fmtDate(user.niche_detected_at)} />
        )}
        <div style={{ padding: '10px 16px', borderTop: '1px solid #111111' }}>
          <p style={{ color: '#333333', fontSize: 11, margin: 0 }}>
            Niche is auto-detected from your video titles and descriptions during the first sync.
          </p>
        </div>
      </Section>

    </div>
  )
}
