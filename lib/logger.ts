import { createServiceClient } from '@/lib/supabase'

export async function logError(params: {
  userId?: string | null
  route: string
  error: string
  details?: Record<string, unknown>
  severity?: 'error' | 'warn' | 'info'
}): Promise<void> {
  const { userId, route, error, details, severity = 'error' } = params
  try {
    const supabase = createServiceClient()
    await supabase.from('error_logs').insert({
      user_id: userId ?? null,
      route,
      error_message: error,
      error_details: details ?? null,
      severity,
    })
  } catch (loggingErr) {
    console.error('[logger] Failed to write error log:', loggingErr)
  }
}

export async function logSyncAttempt(params: {
  userId?: string | null
  email?: string | null
  status: number
  message?: string
  durationMs?: number
  ip?: string | null
  country?: string | null
  city?: string | null
  userAgent?: string | null
  channelId?: string | null
  videosSynced?: number | null
}): Promise<void> {
  const {
    userId,
    email,
    status,
    message,
    durationMs,
    ip,
    country,
    city,
    userAgent,
    channelId,
    videosSynced,
  } = params
  try {
    const supabase = createServiceClient()
    await supabase.from('sync_logs').insert({
      user_id: userId ?? null,
      email: email ?? null,
      status,
      message: message ?? null,
      duration_ms: durationMs ?? null,
      ip: ip ?? null,
      country: country ?? null,
      city: city ?? null,
      user_agent: userAgent ?? null,
      channel_id: channelId ?? null,
      videos_synced: videosSynced ?? null,
    })
  } catch (loggingErr) {
    console.error('[logger] Failed to write sync log:', loggingErr)
  }
}
