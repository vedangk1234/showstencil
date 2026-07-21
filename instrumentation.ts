import * as Sentry from '@sentry/nextjs'

export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('./sentry.server.config')
    const { validateEnv } = await import('./lib/env-validation')
    validateEnv()
  }

  if (process.env.NEXT_RUNTIME === 'edge') {
    await import('./sentry.edge.config')
  }
}

// Capture any uncaught error thrown by a server route / RSC to Sentry. Previously
// only the PayPal webhook explicitly called Sentry.captureException; most routes relied
// on logError to the DB. This ensures server route exceptions reach Sentry too.
export const onRequestError = Sentry.captureRequestError
