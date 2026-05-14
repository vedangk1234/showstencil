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
