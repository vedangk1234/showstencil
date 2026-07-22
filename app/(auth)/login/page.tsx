import { signIn } from '@/auth'

export default function LoginPage() {
  return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">

        <div className="text-center mb-10">
          <h1 className="text-4xl font-bold text-white tracking-tight">ShowStencil</h1>
          <p className="mt-2 text-sm text-zinc-400">
            YouTube analytics for serious creators
          </p>
        </div>

        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-8 shadow-xl">
          <h2 className="text-lg font-semibold text-white mb-1">Sign in</h2>
          <p className="text-sm text-zinc-400 mb-8">
            Connect your Google account to link your YouTube channel
          </p>

          <form
            action={async () => {
              'use server'
              await signIn('google', { redirectTo: '/dashboard' })
            }}
          >
            <button
              type="submit"
              className="w-full flex items-center justify-center gap-3 bg-white hover:bg-zinc-100 text-zinc-900 font-medium py-3 px-4 rounded-lg transition-colors text-sm"
            >
              <GoogleIcon />
              Continue with Google
            </button>
          </form>

          <p className="mt-6 text-center text-xs text-zinc-500 leading-relaxed">
            We request read-only access to your YouTube channel and analytics.
            We never post or change anything on your behalf.
          </p>

          <p className="mt-3 text-center text-xs text-zinc-500 leading-relaxed">
            ShowStencil uses YouTube API Services. By continuing you agree to the{' '}
            <a
              href="https://www.youtube.com/t/terms"
              target="_blank"
              rel="noopener noreferrer"
              className="text-zinc-400 hover:text-white underline transition-colors"
            >
              YouTube Terms of Service
            </a>
            .
          </p>
        </div>

        <p className="mt-6 text-center text-xs text-zinc-600">
          By signing in, you agree to our{' '}
          <a href="/terms" className="text-zinc-400 hover:text-white transition-colors">
            Terms of Service
          </a>{' '}
          and{' '}
          <a href="/privacy" className="text-zinc-400 hover:text-white transition-colors">
            Privacy Policy
          </a>
        </p>

      </div>
    </div>
  )
}

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="w-4 h-4" aria-hidden="true">
      <path
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
        fill="#4285F4"
      />
      <path
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
        fill="#34A853"
      />
      <path
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
        fill="#FBBC05"
      />
      <path
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
        fill="#EA4335"
      />
    </svg>
  )
}
