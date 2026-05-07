import { createServiceClient } from '@/lib/supabase'

export async function uploadThumbnail(params: {
  userId: string
  ideaId: string
  imageBase64: string
}): Promise<string | null> {
  const { userId, ideaId, imageBase64 } = params
  const supabase = createServiceClient()

  const timestamp = Date.now()
  const storagePath = `${userId}/${ideaId}-${timestamp}.png`
  const buffer = Buffer.from(imageBase64, 'base64')

  const { error } = await supabase.storage
    .from('thumbnails')
    .upload(storagePath, buffer, { contentType: 'image/png', upsert: true })

  if (error) {
    console.error('[thumbnail-storage] upload error:', error.message)
    return null
  }

  const { data } = supabase.storage.from('thumbnails').getPublicUrl(storagePath)
  return data.publicUrl
}

export async function deleteThumbnailFromStorage(publicUrl: string): Promise<void> {
  const supabase = createServiceClient()
  const pathPart = publicUrl.split('/thumbnails/')[1]
  if (!pathPart) return

  const { error } = await supabase.storage.from('thumbnails').remove([pathPart])
  if (error) {
    console.error('[thumbnail-storage] delete error:', error.message)
  }
}
