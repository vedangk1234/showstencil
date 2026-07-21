import { NextResponse } from 'next/server'
import { after } from 'next/server'
import { auth } from '@/auth'
import { createServiceClient } from '@/lib/supabase'
import { reserveThumbnail, releaseThumbnail } from '@/lib/access'
import { createThumbnailJob, updateThumbnailJob } from '@/lib/db'
import { checkRateLimit } from '@/lib/rate-limit'
import { generateThumbnail } from '@/lib/gemini-image'
import { uploadThumbnail } from '@/lib/thumbnail-storage'
import { padToSixteenNine } from '@/lib/image-utils'
import { logError } from '@/lib/logger'

// ~2MB decoded ceiling on the incoming photo (base64 length ≈ 4/3 × decoded bytes).
const MAX_PHOTO_DECODED_BYTES = 2 * 1024 * 1024

type PhotoSource = 'camera' | 'upload' | 'google_profile' | 'no_photo'

function isDefaultGoogleAvatar(url: string): boolean {
  return url.includes('default-user') || url.includes('=s96-c') && !url.includes('/a/ACg')
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const userId = session.user.id
  const { id: ideaId } = await params
  const supabase = createServiceClient()

  // Verify idea belongs to this user
  const { data: idea, error: ideaError } = await supabase
    .from('ideas')
    .select('id, title, thumbnail_description, thumbnail_image_url, user_id')
    .eq('id', ideaId)
    .eq('user_id', userId)
    .single()

  if (ideaError || !idea) {
    return NextResponse.json({ error: 'Idea not found' }, { status: 404 })
  }

  // Return existing thumbnail immediately without burning quota
  if (idea.thumbnail_image_url) {
    return NextResponse.json({ thumbnail_url: idea.thumbnail_image_url, cached: true })
  }

  // In-flight guard: if a generation is already pending for this idea, return that
  // job instead of starting a second one (two rapid POSTs would both reserve quota
  // and both call Gemini). Return the existing job without consuming rate/quota.
  const { data: pendingJob } = await supabase
    .from('thumbnail_jobs')
    .select('id')
    .eq('idea_id', ideaId)
    .eq('user_id', userId)
    .in('status', ['pending', 'processing'])
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (pendingJob) {
    return NextResponse.json({ job_id: pendingJob.id, pending: true })
  }

  // Rate limit (per-user, per-endpoint) — protects Gemini spend from scripted loops.
  const withinLimit = await checkRateLimit(userId, 'ideas/generate-thumbnail')
  if (!withinLimit) {
    return NextResponse.json(
      { error: 'Too many requests. Please wait a moment and try again.' },
      { status: 429 },
    )
  }

  // Parse and validate request body
  let body: { photo_source?: PhotoSource; photo_data?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const { photo_source, photo_data } = body
  const validSources: PhotoSource[] = ['camera', 'upload', 'google_profile', 'no_photo']
  if (!photo_source || !validSources.includes(photo_source)) {
    return NextResponse.json({ error: 'photo_source must be one of: camera, upload, google_profile, no_photo' }, { status: 400 })
  }
  if ((photo_source === 'camera' || photo_source === 'upload') && !photo_data) {
    return NextResponse.json({ error: 'photo_data is required for camera and upload sources' }, { status: 400 })
  }

  // Body-size cap: reject oversized inline photos before touching Gemini.
  if (photo_data) {
    const decodedBytes = Math.floor((photo_data.length * 3) / 4)
    if (decodedBytes > MAX_PHOTO_DECODED_BYTES) {
      return NextResponse.json(
        { error: 'Photo is too large. Please use an image under 2MB.' },
        { status: 413 },
      )
    }
  }

  // Atomic quota reservation (plan gate + under-limit increment in one RPC). Released
  // in the background closure if generation fails, so a failure never burns quota.
  const quota = await reserveThumbnail(userId)
  if (!quota.allowed) {
    const resetDate = quota.quotaResetAt
      ? new Date(quota.quotaResetAt).toLocaleDateString('en-US', { month: 'long', day: 'numeric' })
      : null
    const errorMsg =
      quota.reason === 'upgrade_required'
        ? 'Upgrade to Starter to generate thumbnails.'
        : `You've used all ${quota.quotaLimit} thumbnails this month.${resetDate ? ` Resets ${resetDate}.` : ''}`
    return NextResponse.json(
      { error: errorMsg, reason: quota.reason, quotaUsed: quota.quotaUsed, quotaLimit: quota.quotaLimit, quotaResetAt: quota.quotaResetAt },
      { status: 403 },
    )
  }

  // For google_profile: fetch and convert to base64 server-side
  let resolvedPhotoBase64: string | null = photo_data ?? null
  let photoIsDefault = false

  if (photo_source === 'google_profile') {
    const { data: userRow } = await supabase
      .from('users')
      .select('image')
      .eq('id', userId)
      .single()

    const googleUrl = userRow?.image as string | null
    if (googleUrl) {
      photoIsDefault = isDefaultGoogleAvatar(googleUrl)
      try {
        const res = await fetch(googleUrl)
        const arrayBuffer = await res.arrayBuffer()
        resolvedPhotoBase64 = Buffer.from(arrayBuffer).toString('base64')
      } catch (err) {
        console.error('[generate-thumbnail] Failed to fetch Google profile photo:', err)
        resolvedPhotoBase64 = null
        photoIsDefault = true
      }
    } else {
      photoIsDefault = true
    }
  }

  // Create the job row (returns immediately)
  const jobId = await createThumbnailJob({ userId, ideaId })
  if (!jobId) {
    await releaseThumbnail(userId) // refund the reservation we just took
    void logError({ userId, route: 'api/ideas/[id]/generate-thumbnail', error: 'Failed to create thumbnail job', details: { idea_id: ideaId } })
    return NextResponse.json({ error: 'Failed to create thumbnail job' }, { status: 500 })
  }

  // Capture all needed values for the background closure
  const ideaTitle = idea.title as string
  const thumbnailBrief = idea.thumbnail_description as string
  const capturedPhotoBase64 = resolvedPhotoBase64
  const capturedPhotoIsDefault = photoIsDefault
  const capturedPhotoSource = photo_source

  // Run generation in background after response is sent (Fluid Compute — up to 60s)
  after(async () => {
    try {
      const result = await generateThumbnail({
        userPhotoBase64: capturedPhotoBase64,
        thumbnailBrief,
        ideaTitle,
        photoIsDefault: capturedPhotoIsDefault,
      })

      if ('error' in result) {
        console.error('[generate-thumbnail] Gemini error:', result.error)
        await releaseThumbnail(userId) // refund — generation failed
        await updateThumbnailJob(jobId, { status: 'failed', error_message: result.error })
        return
      }

      const rawBuffer = Buffer.from(result.imageBase64, 'base64')
      const paddedBuffer = await padToSixteenNine(rawBuffer)
      const paddedBase64 = paddedBuffer.toString('base64')
      const publicUrl = await uploadThumbnail({ userId, ideaId, imageBase64: paddedBase64 })

      if (!publicUrl) {
        await releaseThumbnail(userId) // refund — upload failed
        await updateThumbnailJob(jobId, { status: 'failed', error_message: 'Failed to upload generated image.' })
        return
      }

      // Persist thumbnail fields on the idea. Quota was already reserved atomically
      // up-front (reserveThumbnail) — no manual increment here.
      await supabase
        .from('ideas')
        .update({
          thumbnail_image_url: publicUrl,
          thumbnail_generated_at: new Date().toISOString(),
          thumbnail_source_type: capturedPhotoSource,
        })
        .eq('id', ideaId)

      await updateThumbnailJob(jobId, { status: 'completed', thumbnail_url: publicUrl })
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unexpected error'
      console.error('[generate-thumbnail] after() error:', msg)
      await releaseThumbnail(userId) // refund — unexpected failure
      await updateThumbnailJob(jobId, { status: 'failed', error_message: msg })
    }
  })

  return NextResponse.json({ job_id: jobId })
}
