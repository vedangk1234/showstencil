/**
 * GET /api/unsubscribe?token=X
 *
 * One-click unsubscribe from all Nixlytics emails.
 * Works without any login — the token in the URL is the only credential.
 *
 * Flow:
 *  1. Read token from query params
 *  2. Find user_settings row where unsubscribe_token = token
 *  3. Not found → return "Invalid or expired link" HTML page
 *  4. Found → set weekly_digest_enabled = false, alerts_enabled = false
 *  5. Return confirmation HTML page
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://nixlytics-u6k1.vercel.app'

function htmlPage(title: string, heading: string, body: string): NextResponse {
  const html = `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${title} — Nixlytics</title>
    <style>
      * { box-sizing: border-box; margin: 0; padding: 0; }
      body {
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
        background: #0f172a;
        color: #e2e8f0;
        display: flex;
        align-items: center;
        justify-content: center;
        min-height: 100vh;
        padding: 24px;
      }
      .card {
        background: #1e293b;
        border: 1px solid #334155;
        border-radius: 12px;
        padding: 40px 48px;
        max-width: 480px;
        width: 100%;
        text-align: center;
      }
      .logo {
        font-size: 20px;
        font-weight: 700;
        color: #6366f1;
        margin-bottom: 24px;
        letter-spacing: -0.5px;
      }
      h1 {
        font-size: 22px;
        font-weight: 600;
        color: #f1f5f9;
        margin-bottom: 12px;
      }
      p {
        font-size: 15px;
        color: #94a3b8;
        line-height: 1.6;
        margin-bottom: 12px;
      }
      a {
        color: #6366f1;
        text-decoration: none;
        font-weight: 500;
      }
      a:hover { text-decoration: underline; }
    </style>
  </head>
  <body>
    <div class="card">
      <div class="logo">Nixlytics</div>
      <h1>${heading}</h1>
      ${body}
    </div>
  </body>
</html>`

  return new NextResponse(html, {
    status: 200,
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  })
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const token = req.nextUrl.searchParams.get('token')

  if (!token) {
    return htmlPage(
      'Invalid link',
      'Invalid unsubscribe link',
      '<p>This link is missing a required token. If you received this in an email, please contact us.</p>',
    )
  }

  const supabase = createServiceClient()

  // Look up user_settings by unsubscribe_token
  const { data: settings, error } = await supabase
    .from('user_settings')
    .select('user_id')
    .eq('unsubscribe_token', token)
    .single()

  if (error || !settings) {
    return htmlPage(
      'Invalid link',
      'Invalid or expired link',
      '<p>This unsubscribe link is no longer valid.</p><p>If you keep receiving emails, <a href="mailto:support@nixlytics.com">contact support</a>.</p>',
    )
  }

  // Disable all email notifications
  const { error: updateError } = await supabase
    .from('user_settings')
    .update({
      weekly_digest_enabled: false,
      alerts_enabled: false,
      updated_at: new Date().toISOString(),
    })
    .eq('user_id', settings.user_id)

  if (updateError) {
    console.error('[unsubscribe] update error:', updateError.message)
    return htmlPage(
      'Error',
      'Something went wrong',
      '<p>We could not process your request. Please try again or <a href="mailto:support@nixlytics.com">contact support</a>.</p>',
    )
  }

  console.log(`[unsubscribe] user ${settings.user_id} unsubscribed from all emails`)

  return htmlPage(
    'Unsubscribed',
    'You have been unsubscribed',
    `<p>You have been unsubscribed from all Nixlytics emails.</p>
     <p>You can re-enable emails anytime from your <a href="${APP_URL}/settings/notifications">settings page</a>.</p>`,
  )
}
