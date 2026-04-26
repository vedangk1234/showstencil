import 'dotenv/config'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

async function fetchChannelThumbnail(channelId: string): Promise<string | null> {
  const url = new URL('https://www.googleapis.com/youtube/v3/channels')
  url.searchParams.set('part', 'snippet')
  url.searchParams.set('id', channelId)
  url.searchParams.set('key', process.env.YOUTUBE_API_KEY!)

  const res = await fetch(url.toString())
  if (!res.ok) return null

  const data = await res.json()
  const channel = data.items?.[0]
  return channel?.snippet?.thumbnails?.high?.url || channel?.snippet?.thumbnails?.default?.url || null
}

async function updateThumbnails() {
  console.log('Fetching all competitors...')

  const { data: competitors, error } = await supabase
    .from('competitors')
    .select('id, channel_name, youtube_channel_id, channel_thumbnail')

  if (error || !competitors) {
    console.error('Failed to fetch competitors:', error)
    return
  }

  console.log(`Found ${competitors.length} competitors`)

  for (const comp of competitors) {
    // Skip if already has a real (non-placeholder) thumbnail
    if (
      comp.channel_thumbnail &&
      !comp.channel_thumbnail.includes('placeholder') &&
      !comp.channel_thumbnail.includes('ui-avatars')
    ) {
      console.log(`✓ ${comp.channel_name} (already has real thumbnail)`)
      continue
    }

    // Fake seed channel IDs — use name-based avatar
    if (!comp.youtube_channel_id || comp.youtube_channel_id.startsWith('UC_comp')) {
      const newPlaceholder = `https://ui-avatars.com/api/?name=${encodeURIComponent(comp.channel_name ?? '?')}&background=2b2b2b&color=fff&size=200`
      await supabase.from('competitors').update({ channel_thumbnail: newPlaceholder }).eq('id', comp.id)
      console.log(`✓ ${comp.channel_name}: name-based placeholder`)
      continue
    }

    // Real channel ID — fetch from YouTube
    const thumbnail = await fetchChannelThumbnail(comp.youtube_channel_id)
    if (thumbnail) {
      await supabase.from('competitors').update({ channel_thumbnail: thumbnail }).eq('id', comp.id)
      console.log(`✓ ${comp.channel_name}: YouTube avatar updated`)
    } else {
      console.log(`✗ ${comp.channel_name}: could not fetch thumbnail`)
    }
  }

  console.log('Done!')
}

updateThumbnails().catch(console.error)
