'use client'

import { signOut } from 'next-auth/react'
import { useEffect, useState } from 'react'
import type { Session } from 'next-auth'

interface Props {
  session: Session | null
  onNext: () => void
}

interface ChannelInfo {
  channel_name: string | null
  channel_thumbnail: string | null
  subscriber_count: number | null
}

function formatSubs(n: number | null): string {
  if (n == null) return ''
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return n.toString()
}

export default function StepConfirmChannel({ session, onNext }: Props) {
  const [channel, setChannel] = useState<ChannelInfo | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false

    const loadChannel = async () => {
      try {
        const res = await fetch('/api/user/profile')
        const data = await res.json() as {
          channel_name?: string | null
          channel_thumbnail?: string | null
          subscriber_count?: number | null
        }
        if (!cancelled) {
          setChannel({
            channel_name: data.channel_name ?? session?.user?.name ?? null,
            channel_thumbnail: data.channel_thumbnail ?? session?.user?.image ?? null,
            subscriber_count: data.subscriber_count ?? null,
          })
          setLoading(false)
        }
      } catch {
        if (!cancelled) {
          setChannel({
            channel_name: session?.user?.name ?? null,
            channel_thumbnail: session?.user?.image ?? null,
            subscriber_count: null,
          })
          setLoading(false)
        }
      }
    }

    loadChannel()
    return () => { cancelled = true }
  }, [session])

  if (loading) {
    return (
      <div className="text-center text-zinc-400 text-sm">
        Loading your channel...
      </div>
    )
  }

  const initial = channel?.channel_name?.[0]?.toUpperCase() ?? '?'

  return (
    <div className="flex flex-col items-center text-center">
      <div className="text-xs text-green-400 font-mono uppercase tracking-widest mb-8">
        ✓ Connected to YouTube
      </div>

      <div className="flex flex-col items-center mb-8">
        {channel?.channel_thumbnail ? (
          <img
            src={channel.channel_thumbnail}
            alt={channel.channel_name ?? 'Your channel'}
            className="w-24 h-24 rounded-full mb-4 border border-zinc-700"
          />
        ) : (
          <div className="w-24 h-24 rounded-full mb-4 border border-zinc-700 bg-zinc-800 flex items-center justify-center text-zinc-400 text-3xl font-medium">
            {initial}
          </div>
        )}
        <div
          className="text-3xl mb-1"
          style={{ fontFamily: 'Instrument Serif, serif' }}
        >
          {channel?.channel_name || 'Your channel'}
        </div>
        {channel?.subscriber_count != null && (
          <div className="text-zinc-500 text-sm font-mono">
            {formatSubs(channel.subscriber_count)} subscribers
          </div>
        )}
      </div>

      <p className="text-zinc-400 text-base mb-10">
        Is this your channel?
      </p>

      <div className="flex gap-3">
        <button
          onClick={onNext}
          className="bg-white text-black px-6 py-2.5 text-sm font-medium hover:bg-zinc-200 transition-colors"
        >
          Yes, that&apos;s me →
        </button>
        <button
          onClick={() => signOut({ callbackUrl: '/' })}
          className="border border-zinc-700 text-zinc-400 px-6 py-2.5 text-sm hover:border-zinc-500 hover:text-zinc-200 transition-colors"
        >
          Wrong account
        </button>
      </div>
    </div>
  )
}
