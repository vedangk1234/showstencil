import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import { getRecentDigests } from '@/lib/db'
import type { Digest } from '@/types'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  })
}

function nextMonday(): string {
  const d = new Date()
  const day = d.getUTCDay()
  const daysUntilMonday = day === 0 ? 1 : 8 - day
  d.setUTCDate(d.getUTCDate() + daysUntilMonday)
  return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', timeZone: 'UTC' })
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function DigestCard({ digest }: { digest: Digest }) {
  const preview = digest.content.slice(0, 220).replace(/\n/g, ' ')

  return (
    <div style={{
      background: '#0a0a0a',
      border: '1px solid #1a1a1a',
      borderRadius: 8,
      padding: '16px 20px',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
        <p style={{ color: '#ffffff', fontSize: 13, fontWeight: 600, margin: 0 }}>
          Week of {fmtDate(digest.week_start_date)}
        </p>
        <span style={{
          fontSize: 10,
          color: digest.email_sent_at ? '#00c853' : '#555555',
          background: digest.email_sent_at ? '#001a07' : '#111111',
          border: `1px solid ${digest.email_sent_at ? '#00421a' : '#1a1a1a'}`,
          borderRadius: 4,
          padding: '2px 7px',
          fontWeight: 500,
        }}>
          {digest.email_sent_at ? 'Emailed' : 'Not sent'}
        </span>
      </div>
      <p style={{ color: '#666666', fontSize: 12, lineHeight: 1.6, margin: '0 0 12px' }}>
        {preview}{digest.content.length > 220 ? '…' : ''}
      </p>
      {digest.video_ideas && digest.video_ideas.length > 0 && (
        <p style={{ color: '#444444', fontSize: 11, margin: 0 }}>
          {digest.video_ideas.length} video idea{digest.video_ideas.length !== 1 ? 's' : ''} included
        </p>
      )}
    </div>
  )
}

function EmptyState() {
  return (
    <div style={{
      background: '#0a0a0a',
      border: '1px dashed #1a1a1a',
      borderRadius: 8,
      padding: '40px 24px',
      textAlign: 'center',
    }}>
      <div style={{
        width: 36, height: 36,
        background: '#111111',
        borderRadius: 8,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        margin: '0 auto 14px',
      }}>
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          <rect x="2" y="3" width="12" height="1.5" rx="0.75" fill="#444444" />
          <rect x="2" y="6.5" width="9" height="1.5" rx="0.75" fill="#333333" />
          <rect x="2" y="10" width="10" height="1.5" rx="0.75" fill="#333333" />
        </svg>
      </div>
      <p style={{ color: '#ffffff', fontSize: 13, fontWeight: 600, margin: '0 0 6px' }}>
        No digests yet
      </p>
      <p style={{ color: '#555555', fontSize: 12, margin: 0, lineHeight: 1.6 }}>
        Your first digest will be generated on the next Monday at 9am UTC.
      </p>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function DigestPage() {
  const session = await auth()
  if (!session) redirect('/login')

  const digests = await getRecentDigests(session.user.id, 3)

  return (
    <div style={{ padding: '28px 32px', maxWidth: 720 }}>

      {/* Header */}
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ color: '#ffffff', fontSize: 18, fontWeight: 700, margin: '0 0 4px', letterSpacing: '-0.3px' }}>
          Weekly Digest
        </h1>
        <p style={{ color: '#555555', fontSize: 13, margin: 0 }}>
          AI-generated weekly reports comparing your channel to competitors.
        </p>
      </div>

      {/* Next digest banner */}
      <div style={{
        background: '#0a0a0a',
        border: '1px solid #1a1a1a',
        borderRadius: 8,
        padding: '14px 18px',
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        marginBottom: 24,
      }}>
        <div style={{
          width: 6, height: 6,
          borderRadius: '50%',
          background: '#f5a623',
          flexShrink: 0,
        }} />
        <p style={{ color: '#888888', fontSize: 12, margin: 0 }}>
          Next digest:{' '}
          <span style={{ color: '#ffffff', fontWeight: 500 }}>
            {nextMonday()} at 9:00 AM UTC
          </span>
        </p>
      </div>

      {/* Digest list */}
      <div style={{ marginBottom: 12 }}>
        <p style={{ color: '#444444', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 12px' }}>
          Recent Digests
        </p>
        {digests.length === 0 ? (
          <EmptyState />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {digests.map((d) => (
              <DigestCard key={d.id} digest={d} />
            ))}
          </div>
        )}
      </div>

    </div>
  )
}
