import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { getThumbnailJob } from '@/lib/db'

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ jobId: string }> },
) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { jobId } = await params
  const job = await getThumbnailJob(jobId, session.user.id)

  if (!job) {
    return NextResponse.json({ error: 'Job not found' }, { status: 404 })
  }

  return NextResponse.json({
    status: job.status,
    thumbnail_url: job.thumbnail_url,
    error_message: job.error_message,
    created_at: job.created_at,
    completed_at: job.completed_at,
  })
}
