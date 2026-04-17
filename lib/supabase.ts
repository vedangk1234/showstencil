import { createClient as createSupabaseClient } from '@supabase/supabase-js';

/**
 * Client-side Supabase client (uses anon key, safe to expose).
 * Use this in Client Components and browser-side code.
 */
export function createClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}

/**
 * Server-side Supabase client (uses service role key, bypasses RLS).
 * Use this only in Server Components, API routes, and cron handlers.
 * Never expose this to the client.
 */
export function createServiceClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    },
  );
}
