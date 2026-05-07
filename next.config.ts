import type { NextConfig } from "next";
import { withSentryConfig } from '@sentry/nextjs'

// Security headers applied to every route.
// CSP is intentionally omitted here — Next.js hydration requires nonce-based
// CSP via middleware, and the full allowlist (Supabase, Google OAuth, YouTube,
// Resend) needs testing before enabling. The headers below address the two
// CRITICAL risks (clickjacking, MIME sniffing) and the standard baseline.
const securityHeaders = [
  // Prevents the app from being embedded in an iframe on another domain (clickjacking).
  { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
  // Prevents browsers from MIME-sniffing a response away from the declared Content-Type.
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  // Controls how much referrer info is sent with requests.
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  // Restrict browser feature access. Camera is allowed for self (thumbnail generation
  // uses getUserMedia); microphone and geolocation are fully blocked.
  { key: 'Permissions-Policy', value: 'camera=(self), microphone=(), geolocation=()' },
  // Enable DNS prefetching for performance.
  { key: 'X-DNS-Prefetch-Control', value: 'on' },
  // Force HTTPS for 2 years, include subdomains, eligible for browser preload list.
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
]

const nextConfig: NextConfig = {
  reactCompiler: true,
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'lh3.googleusercontent.com', // Google profile photos
      },
    ],
  },
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: securityHeaders,
      },
    ]
  },
};

export default withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  silent: true,
  widenClientFileUpload: true,
  sourcemaps: { deleteSourcemapsAfterUpload: true },
  disableLogger: true,
  automaticVercelMonitors: false,
})
