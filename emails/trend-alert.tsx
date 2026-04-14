/**
 * emails/trend-alert.tsx
 * React Email component for Nixlytics viral trend alerts.
 *
 * Design rules (same as weekly-digest.tsx):
 *  - Inline styles only — no CSS classes
 *  - No images — must look correct with images disabled
 *  - Web-safe fonts: Arial, Helvetica, sans-serif
 *  - Max width 600px centered
 *  - Accent: #185FA5 (brand), alert uses #dc2626 / #ea580c
 */

import {
  Body,
  Button,
  Container,
  Head,
  Hr,
  Html,
  Link,
  Preview,
  Section,
  Text,
} from '@react-email/components'
import * as React from 'react'

const APP_URL = 'https://nixlytics-u6k1.vercel.app'

export interface TrendAlertEmailProps {
  channelName: string
  competitorChannelName: string
  videoTitle: string
  viewCount: number
  performanceMultiplier: number
  hoursOld: number
  suggestedAngle: string
  viewFullAnalysisUrl: string
  unsubscribeToken: string
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return n.toLocaleString()
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function TrendAlertEmail({
  channelName,
  competitorChannelName,
  videoTitle,
  viewCount,
  performanceMultiplier,
  hoursOld,
  suggestedAngle,
  viewFullAnalysisUrl,
  unsubscribeToken,
}: TrendAlertEmailProps) {
  const multiplierStr = performanceMultiplier.toFixed(1)

  return (
    <Html lang="en" dir="ltr">
      <Head />
      <Preview>
        Trend alert: "{videoTitle}" just hit {formatNumber(viewCount)} views in your niche
      </Preview>

      <Body style={bodyStyle}>
        <Container style={containerStyle}>

          {/* ── SECTION 1: Header ─────────────────────────────────────── */}
          <Section style={headerSectionStyle}>
            <Text style={logoStyle}>NIXLYTICS</Text>
            <Text style={headerTitleStyle}>Trend alert in your niche</Text>
            <Text style={headerSubStyle}>Something is moving fast. Act within 72 hours.</Text>
          </Section>

          {/* ── SECTION 2: Alert banner ───────────────────────────────── */}
          <Section style={alertBannerStyle}>
            <Text style={alertBannerTextStyle}>
              A video just hit {formatNumber(viewCount)} views in {hoursOld} hours
            </Text>
          </Section>

          <Hr style={hrStyle} />

          {/* ── SECTION 3: Video card ─────────────────────────────────── */}
          <Section style={sectionStyle}>
            <Text style={sectionLabelStyle}>THE TRENDING VIDEO</Text>

            <Section style={videoCardStyle}>
              <Text style={channelLabelStyle}>Channel</Text>
              <Text style={channelNameStyle}>{competitorChannelName}</Text>

              <Hr style={cardDividerStyle} />

              <Text style={channelLabelStyle}>Title</Text>
              <Text style={videoTitleStyle}>{videoTitle}</Text>

              <Hr style={cardDividerStyle} />

              <Text style={channelLabelStyle}>Performance</Text>
              <Text style={performanceStyle}>
                {multiplierStr}x their channel average
              </Text>
            </Section>
          </Section>

          <Hr style={hrStyle} />

          {/* ── SECTION 4: Your opportunity ───────────────────────────── */}
          <Section style={sectionStyle}>
            <Text style={sectionLabelStyle}>YOUR OPPORTUNITY</Text>

            <Text style={opportunityBodyStyle}>
              This topic is uncovered in your recent content.
            </Text>

            <Section style={angleBoxStyle}>
              <Text style={angleLabelStyle}>Suggested angle for {channelName}</Text>
              <Text style={angleTextStyle}>{suggestedAngle}</Text>
            </Section>

            <Section style={timingBoxStyle}>
              <Text style={timingTextStyle}>
                ⏱ Publishing within 72 hours maximises your algorithmic overlap with this trend.
              </Text>
            </Section>
          </Section>

          <Hr style={hrStyle} />

          {/* ── SECTION 5: CTA + Footer ───────────────────────────────── */}
          <Section style={footerSectionStyle}>
            <Button href={viewFullAnalysisUrl} style={ctaButtonStyle}>
              View full analysis →
            </Button>

            <Text style={footerBodyStyle}>
              You are receiving this because you connected your YouTube channel to Nixlytics and have trend alerts enabled.
            </Text>

            <Link
              href={`${APP_URL}/api/unsubscribe?token=${unsubscribeToken}`}
              style={unsubscribeLinkStyle}
            >
              Unsubscribe from alerts
            </Link>

            <Text style={footerSmallStyle}>Nixlytics · Pune, India</Text>
          </Section>

        </Container>
      </Body>
    </Html>
  )
}

export default TrendAlertEmail

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
  margin: '0',
}

const alertBannerStyle: React.CSSProperties = {
  backgroundColor: '#dc2626',
  padding: '18px 40px',
  textAlign: 'center',
}

const alertBannerTextStyle: React.CSSProperties = {
  color: '#ffffff',
  fontSize: '18px',
  fontWeight: '700',
  margin: '0',
  lineHeight: '1.3',
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

// Video card

const videoCardStyle: React.CSSProperties = {
  backgroundColor: '#f9fafb',
  borderRadius: '8px',
  padding: '20px 24px',
  border: '1px solid #e5e7eb',
}

const channelLabelStyle: React.CSSProperties = {
  color: '#9ca3af',
  fontSize: '10px',
  fontWeight: '700',
  letterSpacing: '1px',
  textTransform: 'uppercase',
  margin: '0 0 4px',
}

const channelNameStyle: React.CSSProperties = {
  color: '#374151',
  fontSize: '14px',
  fontWeight: '500',
  margin: '0',
}

const cardDividerStyle: React.CSSProperties = {
  borderColor: '#e5e7eb',
  borderTopWidth: '1px',
  margin: '14px 0',
}

const videoTitleStyle: React.CSSProperties = {
  color: '#1a1a1a',
  fontSize: '16px',
  fontWeight: '700',
  margin: '0',
  lineHeight: '1.4',
}

const performanceStyle: React.CSSProperties = {
  color: '#dc2626',
  fontSize: '15px',
  fontWeight: '700',
  margin: '0',
}

// Opportunity section

const opportunityBodyStyle: React.CSSProperties = {
  color: '#374151',
  fontSize: '15px',
  margin: '0 0 16px',
  lineHeight: '1.5',
}

const angleBoxStyle: React.CSSProperties = {
  backgroundColor: '#eff6ff',
  borderLeft: '4px solid #185FA5',
  borderRadius: '4px',
  padding: '16px 20px',
  marginBottom: '12px',
}

const angleLabelStyle: React.CSSProperties = {
  color: '#6b7280',
  fontSize: '10px',
  fontWeight: '700',
  letterSpacing: '1px',
  textTransform: 'uppercase',
  margin: '0 0 8px',
}

const angleTextStyle: React.CSSProperties = {
  color: '#1e40af',
  fontSize: '15px',
  fontWeight: '500',
  margin: '0',
  lineHeight: '1.6',
}

const timingBoxStyle: React.CSSProperties = {
  backgroundColor: '#fef3c7',
  borderRadius: '6px',
  padding: '12px 16px',
}

const timingTextStyle: React.CSSProperties = {
  color: '#92400e',
  fontSize: '13px',
  fontWeight: '500',
  margin: '0',
  lineHeight: '1.5',
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
