const REQUIRED_ENV_VARS = [
  'NEXTAUTH_URL',
  'NEXTAUTH_SECRET',
  'GOOGLE_CLIENT_ID',
  'GOOGLE_CLIENT_SECRET',
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
  'ANTHROPIC_API_KEY',
  'CRON_SECRET',
  'PAYPAL_MODE',
]

// Env vars that must be one of a fixed set of values when present.
const ALLOWED_VALUES: Record<string, readonly string[]> = {
  PAYPAL_MODE: ['live', 'sandbox'],
}

export function validateEnv(): void {
  const missing = REQUIRED_ENV_VARS.filter((key) => !process.env[key])
  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missing.join(', ')}`,
    )
  }

  for (const [key, allowed] of Object.entries(ALLOWED_VALUES)) {
    const value = process.env[key]
    if (value && !allowed.includes(value)) {
      throw new Error(
        `Invalid ${key}: '${value}'. Allowed values: ${allowed.join(', ')}`,
      )
    }
  }
}
