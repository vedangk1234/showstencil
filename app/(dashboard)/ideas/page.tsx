import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import { getRecentIdeas } from '@/lib/db'
import type { GeneratedVideoIdea } from '@/types'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function scoreColor(score: number): string {
  if (score >= 70) return '#00c853'
  if (score >= 40) return '#f5a623'
  return '#ff4444'
}

function scoreBg(score: number): string {
  if (score >= 70) return '#001a07'
  if (score >= 40) return '#1a1200'
  return '#1a0000'
}

function scoreBorder(score: number): string {
  if (score >= 70) return '#00421a'
  if (score >= 40) return '#42300a'
  return '#421a1a'
}

const FORMAT_ICON: Record<string, string> = {
  tutorial: '🎓',
  documentary: '🎬',
  listicle: '📋',
  'case study': '🔍',
  opinion: '💬',
  challenge: '⚡',
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function IdeaCard({ idea, rank }: { idea: GeneratedVideoIdea; rank: number }) {
  const fmt = idea.format?.toLowerCase() ?? ''
  const icon = FORMAT_ICON[fmt] ?? '💡'

  return (
    <div style={{
      background: '#0a0a0a',
      border: '1px solid #1a1a1a',
      borderRadius: 8,
      padding: '16px 20px',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
          <span style={{
            width: 20, height: 20,
            background: '#1a1a1a',
            borderRadius: 4,
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            color: '#555555', fontSize: 10, fontWeight: 700,
            flexShrink: 0,
          }}>
            {rank}
          </span>
          <p style={{
            color: '#ffffff',
            fontSize: 13,
            fontWeight: 600,
            margin: 0,
            lineHeight: 1.4,
          }}>
            {icon} {idea.title}
          </p>
        </div>
        <span style={{
          fontSize: 11,
          fontWeight: 700,
          color: scoreColor(idea.score),
          background: scoreBg(idea.score),
          border: `1px solid ${scoreBorder(idea.score)}`,
          borderRadius: 4,
          padding: '3px 8px',
          flexShrink: 0,
          marginLeft: 12,
        }}>
          {idea.score}
        </span>
      </div>

      <p style={{ color: '#666666', fontSize: 12, lineHeight: 1.6, margin: '0 0 12px' }}>
        {idea.whyNow}
      </p>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {idea.angle && (
          <span style={{
            fontSize: 11, color: '#555555',
            background: '#111111', border: '1px solid #1a1a1a',
            borderRadius: 4, padding: '2px 8px',
          }}>
            {idea.angle}
          </span>
        )}
        {idea.format && (
          <span style={{
            fontSize: 11, color: '#555555',
            background: '#111111', border: '1px solid #1a1a1a',
            borderRadius: 4, padding: '2px 8px', textTransform: 'capitalize',
          }}>
            {idea.format}
          </span>
        )}
        {idea.estimatedLength && (
          <span style={{
            fontSize: 11, color: '#555555',
            background: '#111111', border: '1px solid #1a1a1a',
            borderRadius: 4, padding: '2px 8px',
          }}>
            {idea.estimatedLength}
          </span>
        )}
      </div>
    </div>
  )
}

function EmptyState() {
  return (
    <div style={{
      background: '#0a0a0a',
      border: '1px dashed #1a1a1a',
      borderRadius: 8,
      padding: '48px 24px',
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
          <circle cx="8" cy="7" r="4" stroke="#444444" strokeWidth="1.5" />
          <path d="M8 11v2M6.5 13h3" stroke="#444444" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      </div>
      <p style={{ color: '#ffffff', fontSize: 13, fontWeight: 600, margin: '0 0 6px' }}>
        No ideas generated yet
      </p>
      <p style={{ color: '#555555', fontSize: 12, margin: 0, lineHeight: 1.6 }}>
        AI-generated video ideas are produced alongside your weekly digest.<br />
        Your first ideas will appear after your channel data has been synced.
      </p>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function IdeasPage() {
  const session = await auth()
  if (!session) redirect('/login')

  const ideas = await getRecentIdeas(session.user.id, 5)

  return (
    <div style={{ padding: '28px 32px', maxWidth: 720 }}>

      {/* Header */}
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ color: '#ffffff', fontSize: 18, fontWeight: 700, margin: '0 0 4px', letterSpacing: '-0.3px' }}>
          Video Ideas
        </h1>
        <p style={{ color: '#555555', fontSize: 13, margin: 0 }}>
          AI-generated ideas ranked by opportunity score, based on competitor gaps and trending topics.
        </p>
      </div>

      {/* Score legend */}
      {ideas.length > 0 && (
        <div style={{
          display: 'flex',
          gap: 16,
          marginBottom: 20,
          padding: '10px 14px',
          background: '#0a0a0a',
          border: '1px solid #1a1a1a',
          borderRadius: 6,
        }}>
          <span style={{ fontSize: 11, color: '#444444' }}>Score:</span>
          {[
            { label: '70–100 High', color: '#00c853' },
            { label: '40–69 Medium', color: '#f5a623' },
            { label: '0–39 Low', color: '#ff4444' },
          ].map(({ label, color }) => (
            <span key={label} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: color, display: 'inline-block' }} />
              <span style={{ color: '#444444', fontSize: 11 }}>{label}</span>
            </span>
          ))}
        </div>
      )}

      {/* Ideas list */}
      {ideas.length === 0 ? (
        <EmptyState />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {ideas.map((idea, i) => (
            <IdeaCard key={`${idea.title}-${i}`} idea={idea} rank={i + 1} />
          ))}
        </div>
      )}

    </div>
  )
}
