/**
 * emails/weekly-digest.tsx
 * React Email component for the ShowStencil weekly digest.
 *
 * Design rules:
 *  - Inline styles only — no CSS classes
 *  - No images — must look correct with images disabled
 *  - Web-safe fonts: Arial, Helvetica, sans-serif
 *  - Max width 600px centered
 *  - Accent: #185FA5
 */

import {
  Body,
  Button,
  Container,
  Column,
  Head,
  Hr,
  Html,
  Link,
  Preview,
  Row,
  Section,
  Text,
} from '@react-email/components'
import * as React from 'react'

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://nixlytics-u6k1.vercel.app'

export interface WeeklyDigestEmailProps {
  channelName: string
  weekDate: string
  gapScore: number
  metrics: {
    userAvgViews: number
    competitorAvgViews: number
    revenueGap: number
  }
  competitorMoves: {
    videoTitle: string
    channelName: string
    viewCount: number
    performanceMultiplier: number
  }[]
  videoIdeas: {
    rank: number
    title: string
    score: number
    whyNow: string
  }[]
  oneChange: string
  unsubscribeToken: string
  viewFullAnalysisUrl?: string
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return n.toLocaleString()
}

function ideaBadge(score: number): { bg: string; color: string; label: string } {
  if (score >= 80) return { bg: '#dcfce7', color: '#15803d', label: 'High' }
  if (score >= 60) return { bg: '#fef9c3', color: '#a16207', label: 'Medium' }
  return { bg: '#f3f4f6', color: '#6b7280', label: 'Low' }
}

function gapScoreColor(score: number): string {
  if (score >= 70) return '#dc2626'
  if (score >= 40) return '#d97706'
  return '#16a34a'
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function WeeklyDigestEmail({
  channelName,
  weekDate,
  gapScore,
  metrics,
  competitorMoves,
  videoIdeas,
  oneChange,
  unsubscribeToken,
  viewFullAnalysisUrl,
}: WeeklyDigestEmailProps) {
  const viewsDelta =
    metrics.competitorAvgViews > 0 && metrics.userAvgViews < metrics.competitorAvgViews
      ? Math.round(
          ((metrics.competitorAvgViews - metrics.userAvgViews) /
            metrics.competitorAvgViews) *
            100,
        )
      : null

  const scoreColor = gapScoreColor(gapScore)

  return (
    <Html lang="en" dir="ltr">
      <Head />
      <Preview>
        {channelName}: gap score {String(gapScore)}/100 · {String(videoIdeas.length)} ideas ready this week
      </Preview>

      <Body style={bodyStyle}>
        <Container style={containerStyle}>

          {/* ── SECTION 1: Header ─────────────────────────────────────── */}
          <Section style={headerSectionStyle}>
            <Text style={logoStyle}>SHOWSTENCIL</Text>
            <Text style={headerTitleStyle}>Weekly digest for {channelName}</Text>
            <Text style={headerSubStyle}>Week of {weekDate}</Text>
            <Text
              style={{
                ...gapBadgeStyle,
                color: scoreColor,
                borderColor: scoreColor,
              }}
            >
              Gap score: {gapScore}/100
            </Text>
          </Section>

          <Hr style={hrStyle} />

          {/* ── SECTION 2: This week summary ──────────────────────────── */}
          <Section style={sectionStyle}>
            <Text style={sectionLabelStyle}>THIS WEEK</Text>

            <Row>
              <Column style={metricColumnStyle}>
                <Section style={metricCardStyle}>
                  <Text style={metricLabelStyle}>Your avg views</Text>
                  <Text style={metricValueStyle}>{formatNumber(metrics.userAvgViews)}</Text>
                  <Text style={metricDeltaStyle}>
                    {viewsDelta !== null
                      ? `${viewsDelta}% below niche avg`
                      : 'At niche average'}
                  </Text>
                </Section>
              </Column>

              <Column style={{ ...metricColumnStyle, paddingLeft: '8px', paddingRight: '8px' }}>
                <Section style={metricCardStyle}>
                  <Text style={metricLabelStyle}>Competitor avg</Text>
                  <Text style={{ ...metricValueStyle, color: '#185FA5' }}>
                    {formatNumber(metrics.competitorAvgViews)}
                  </Text>
                  <Text style={{ ...metricDeltaStyle, color: '#185FA5' }}>Tier 1 average</Text>
                </Section>
              </Column>

              <Column style={{ ...metricColumnStyle, paddingLeft: '0' }}>
                <Section style={metricCardStyle}>
                  <Text style={metricLabelStyle}>Revenue gap</Text>
                  <Text style={{ ...metricValueStyle, color: '#dc2626' }}>
                    ${formatNumber(metrics.revenueGap)}
                  </Text>
                  <Text style={{ ...metricDeltaStyle, color: '#dc2626' }}>per month</Text>
                </Section>
              </Column>
            </Row>
          </Section>

          <Hr style={hrStyle} />

          {/* ── SECTION 3: Competitor moves ───────────────────────────── */}
          {competitorMoves.length > 0 && (
            <>
              <Section style={sectionStyle}>
                <Text style={sectionLabelStyle}>WHAT YOUR COMPETITORS DID</Text>

                {competitorMoves.map((move, i) => (
                  <Section key={i} style={competitorCardStyle}>
                    <Text style={competitorVideoTitleStyle}>{move.videoTitle}</Text>
                    <Text style={competitorMetaStyle}>
                      {move.channelName}
                      {'  ·  '}
                      {formatNumber(move.viewCount)} views
                      {'  ·  '}
                      {move.performanceMultiplier.toFixed(2)}x their average
                    </Text>
                  </Section>
                ))}
              </Section>

              <Hr style={hrStyle} />
            </>
          )}

          {/* ── SECTION 4: Video ideas ────────────────────────────────── */}
          <Section style={sectionStyle}>
            <Text style={sectionLabelStyle}>YOUR 3 VIDEO IDEAS</Text>

            {videoIdeas.map((idea) => {
              const badge = ideaBadge(idea.score)
              return (
                <Section key={idea.rank} style={ideaCardStyle}>
                  <Row>
                    <Column style={{ width: '32px', verticalAlign: 'top' }}>
                      <Text style={ideaRankStyle}>{idea.rank}</Text>
                    </Column>
                    <Column style={{ verticalAlign: 'top' }}>
                      <Text style={ideaTitleStyle}>{idea.title}</Text>
                      <Text
                        style={{
                          ...scoreBadgeStyle,
                          backgroundColor: badge.bg,
                          color: badge.color,
                        }}
                      >
                        {idea.score}/100 · {badge.label} opportunity
                      </Text>
                      <Text style={ideaWhyStyle}>{idea.whyNow}</Text>
                    </Column>
                  </Row>
                </Section>
              )
            })}
          </Section>

          <Hr style={hrStyle} />

          {/* ── SECTION 5: One thing to change ───────────────────────── */}
          <Section style={sectionStyle}>
            <Text style={sectionLabelStyle}>ONE THING TO CHANGE THIS WEEK</Text>
            <Section style={oneChangeBoxStyle}>
              <Text style={oneChangeTextStyle}>{oneChange}</Text>
            </Section>
          </Section>

          <Hr style={hrStyle} />

          {/* ── SECTION 6: Footer ─────────────────────────────────────── */}
          <Section style={footerSectionStyle}>
            <Button href={viewFullAnalysisUrl ?? `${APP_URL}/digest`} style={ctaButtonStyle}>
              View full analysis →
            </Button>

            <Text style={footerBodyStyle}>
              You are receiving this because you connected your YouTube channel to ShowStencil.
            </Text>

            <Link
              href={`${APP_URL}/api/unsubscribe?token=${unsubscribeToken}`}
              style={unsubscribeLinkStyle}
            >
              Unsubscribe
            </Link>

            <Text style={footerSmallStyle}>ShowStencil · Pune, India</Text>
          </Section>

        </Container>
      </Body>
    </Html>
  )
}

export default WeeklyDigestEmail

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const bodyStyle: React.CSSProperties = {
  backgroundColor: '#f3f4f6',
  fontFamily: 'Arial, Helvetica, sans-serif',
  margin: '0',
  padding: '24px 0',
}

const containerStyle: React.CSSProperties = {
  backgroundColor: '#ffffff',
  maxWidth: '600px',
  margin: '0 auto',
  borderRadius: '8px',
  overflow: 'hidden',
}

const headerSectionStyle: React.CSSProperties = {
  backgroundColor: '#185FA5',
  padding: '36px 40px 28px',
  textAlign: 'center',
}

const logoStyle: React.CSSProperties = {
  color: '#ffffff',
  fontSize: '20px',
  fontWeight: '700',
  letterSpacing: '4px',
  margin: '0 0 14px',
}

const headerTitleStyle: React.CSSProperties = {
  color: '#ffffff',
  fontSize: '20px',
  fontWeight: '600',
  margin: '0 0 6px',
  lineHeight: '1.3',
}

const headerSubStyle: React.CSSProperties = {
  color: '#bfdbfe',
  fontSize: '14px',
  margin: '0 0 18px',
}

const gapBadgeStyle: React.CSSProperties = {
  display: 'inline-block',
  fontSize: '13px',
  fontWeight: '700',
  padding: '5px 14px',
  border: '2px solid',
  borderRadius: '20px',
  backgroundColor: '#ffffff',
  margin: '0',
}

const hrStyle: React.CSSProperties = {
  borderColor: '#e5e7eb',
  borderTopWidth: '1px',
  margin: '0',
}

const sectionStyle: React.CSSProperties = {
  padding: '28px 40px',
}

const footerSectionStyle: React.CSSProperties = {
  padding: '28px 40px 36px',
  textAlign: 'center',
}

const sectionLabelStyle: React.CSSProperties = {
  color: '#9ca3af',
  fontSize: '10px',
  fontWeight: '700',
  letterSpacing: '2px',
  textTransform: 'uppercase',
  margin: '0 0 20px',
}

// Metric cards

const metricColumnStyle: React.CSSProperties = {
  width: '33%',
  paddingRight: '8px',
}

const metricCardStyle: React.CSSProperties = {
  backgroundColor: '#f9fafb',
  borderRadius: '8px',
  padding: '16px 12px',
  textAlign: 'center',
}

const metricLabelStyle: React.CSSProperties = {
  color: '#6b7280',
  fontSize: '10px',
  fontWeight: '700',
  letterSpacing: '1px',
  textTransform: 'uppercase',
  margin: '0 0 6px',
}

const metricValueStyle: React.CSSProperties = {
  color: '#1a1a1a',
  fontSize: '22px',
  fontWeight: '700',
  margin: '0 0 4px',
  lineHeight: '1.2',
}

const metricDeltaStyle: React.CSSProperties = {
  color: '#6b7280',
  fontSize: '11px',
  margin: '0',
}

// Competitor cards

const competitorCardStyle: React.CSSProperties = {
  backgroundColor: '#f9fafb',
  borderRadius: '6px',
  padding: '14px 16px',
  marginBottom: '10px',
}

const competitorVideoTitleStyle: React.CSSProperties = {
  color: '#1a1a1a',
  fontSize: '14px',
  fontWeight: '600',
  margin: '0 0 5px',
  lineHeight: '1.4',
}

const competitorMetaStyle: React.CSSProperties = {
  color: '#6b7280',
  fontSize: '12px',
  margin: '0',
}

// Idea cards

const ideaCardStyle: React.CSSProperties = {
  backgroundColor: '#f9fafb',
  borderRadius: '6px',
  padding: '16px',
  marginBottom: '12px',
}

const ideaRankStyle: React.CSSProperties = {
  backgroundColor: '#185FA5',
  color: '#ffffff',
  fontSize: '12px',
  fontWeight: '700',
  width: '24px',
  height: '24px',
  borderRadius: '50%',
  textAlign: 'center',
  lineHeight: '24px',
  margin: '2px 12px 0 0',
  display: 'inline-block',
}

const ideaTitleStyle: React.CSSProperties = {
  color: '#1a1a1a',
  fontSize: '15px',
  fontWeight: '600',
  margin: '0 0 6px',
  lineHeight: '1.4',
}

const scoreBadgeStyle: React.CSSProperties = {
  display: 'inline-block',
  fontSize: '11px',
  fontWeight: '600',
  padding: '2px 8px',
  borderRadius: '4px',
  margin: '0 0 8px',
}

const ideaWhyStyle: React.CSSProperties = {
  color: '#444444',
  fontSize: '13px',
  margin: '0',
  lineHeight: '1.5',
}

// One change box

const oneChangeBoxStyle: React.CSSProperties = {
  backgroundColor: '#eff6ff',
  borderLeft: '4px solid #185FA5',
  borderRadius: '4px',
  padding: '16px 20px',
}

const oneChangeTextStyle: React.CSSProperties = {
  color: '#1e40af',
  fontSize: '15px',
  fontWeight: '500',
  margin: '0',
  lineHeight: '1.6',
}

// Footer

const ctaButtonStyle: React.CSSProperties = {
  backgroundColor: '#185FA5',
  borderRadius: '6px',
  color: '#ffffff',
  display: 'inline-block',
  fontSize: '15px',
  fontWeight: '600',
  padding: '12px 28px',
  textDecoration: 'none',
  margin: '0 0 20px',
}

const footerBodyStyle: React.CSSProperties = {
  color: '#6b7280',
  fontSize: '12px',
  margin: '0 0 10px',
  lineHeight: '1.5',
}

const unsubscribeLinkStyle: React.CSSProperties = {
  color: '#9ca3af',
  fontSize: '12px',
  textDecoration: 'underline',
  display: 'block',
  margin: '0 0 12px',
}

const footerSmallStyle: React.CSSProperties = {
  color: '#9ca3af',
  fontSize: '11px',
  margin: '0',
}
