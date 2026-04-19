import type { DefaultSession } from 'next-auth'

declare module 'next-auth' {
  interface Session {
    user: {
      id: string
      subscriptionStatus: string
    } & DefaultSession['user']
    accessToken: string | undefined
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    userId: string
    subscriptionStatus: string
    accessToken: string | undefined
    refreshToken: string | undefined
    expiresAt: number | undefined
    error?: 'RefreshTokenError'
  }
}
