import NextAuth from 'next-auth'
import Google from 'next-auth/providers/google'
import { createServiceClient } from '@/lib/supabase'
import type { JWT } from 'next-auth/jwt'

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      authorization: {
        params: {
          scope: [
            'openid',
            'email',
            'profile',
            'https://www.googleapis.com/auth/youtube.readonly',
            'https://www.googleapis.com/auth/yt-analytics.readonly',
          ].join(' '),
          access_type: 'offline',
          prompt: 'consent', // always prompt so we always get a refresh token
        },
      },
    }),
  ],
  session: { strategy: 'jwt' },
  pages: {
    signIn: '/login',
    error: '/login',
  },
  callbacks: {
    async signIn({ user, account }) {
      if (!user.email || account?.provider !== 'google') return false

      try {
        const supabase = createServiceClient()
        const { error } = await supabase.from('users').upsert(
          {
            email: user.email,
            name: user.name ?? null,
            image: user.image ?? null,
            youtube_access_token: account.access_token ?? null,
            youtube_refresh_token: account.refresh_token ?? null,
            token_expires_at: account.expires_at
              ? new Date(account.expires_at * 1000).toISOString()
              : null,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'email' }
        )
        if (error) {
          console.error('[auth] upsert error:', error.message)
          return false
        }

        // Fetch and save YouTube channel ID
        if (account.access_token) {
          const channelId = await getYouTubeChannelId(account.access_token)
          if (channelId) {
            console.log('[auth] YouTube channel ID:', channelId)
            await supabase
              .from('users')
              .update({ youtube_channel_id: channelId, updated_at: new Date().toISOString() })
              .eq('email', user.email)
          } else {
            console.warn('[auth] Could not fetch YouTube channel ID for', user.email)
          }
        }

        return true
      } catch (err) {
        console.error('[auth] signIn error:', err)
        return false
      }
    },

    async jwt({ token, account }) {
      if (account) {
        // Initial sign-in: fetch our DB user's id and plan status
        const supabase = createServiceClient()
        const { data: dbUser } = await supabase
          .from('users')
          .select('id, subscription_status')
          .eq('email', token.email!)
          .single()

        if (dbUser) {
          token.userId = dbUser.id as string
          token.subscriptionStatus = dbUser.subscription_status as string
        }

        token.accessToken = account.access_token ?? undefined
        token.refreshToken = account.refresh_token ?? undefined
        token.expiresAt = account.expires_at ?? undefined
        return token
      }

      // Subsequent requests: return token if still valid (with 5-minute buffer)
      const expiresAt = token.expiresAt
      if (!expiresAt || Date.now() < expiresAt * 1000 - 300_000) {
        return token
      }

      // Token expired — refresh it
      if (!token.refreshToken) return token
      return refreshGoogleToken(token)
    },

    async session({ session, token }) {
      session.user.id = token.userId ?? ''
      session.user.subscriptionStatus = token.subscriptionStatus ?? 'free'
      return session
    },
  },
})

async function getYouTubeChannelId(accessToken: string): Promise<string | null> {
  try {
    const res = await fetch(
      'https://www.googleapis.com/youtube/v3/channels?part=id&mine=true',
      { headers: { Authorization: `Bearer ${accessToken}` } }
    )
    const data = await res.json() as { items?: { id: string }[] }
    return data.items?.[0]?.id ?? null
  } catch (err) {
    console.error('[auth] getYouTubeChannelId error:', err)
    return null
  }
}

async function refreshGoogleToken(token: JWT): Promise<JWT> {
  try {
    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: process.env.GOOGLE_CLIENT_ID!,
        client_secret: process.env.GOOGLE_CLIENT_SECRET!,
        grant_type: 'refresh_token',
        refresh_token: token.refreshToken!,
      }),
    })

    const refreshed = (await response.json()) as {
      access_token: string
      expires_in: number
    }
    if (!response.ok) throw new Error(JSON.stringify(refreshed))

    const expiresAt = Math.floor(Date.now() / 1000) + refreshed.expires_in

    // Persist the new access token to our DB
    const supabase = createServiceClient()
    await supabase
      .from('users')
      .update({
        youtube_access_token: refreshed.access_token,
        token_expires_at: new Date(expiresAt * 1000).toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', token.userId!)

    return { ...token, accessToken: refreshed.access_token, expiresAt, error: undefined }
  } catch (err) {
    console.error('[auth] token refresh failed:', err)
    return { ...token, error: 'RefreshTokenError' }
  }
}
