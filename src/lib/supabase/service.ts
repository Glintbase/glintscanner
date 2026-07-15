import { createClient } from '@supabase/supabase-js';

/**
 * Admin Supabase client using the Service Role Key.
 * Bypasses Row-Level Security (RLS) entirely.
 * Use this ONLY in Server Routes/Handlers, never expose to the client.
 */
export function createAdminSupabaseClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://mock.supabase.co';
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!serviceRoleKey) {
    throw new Error('Missing SUPABASE_SERVICE_ROLE_KEY in server environment.');
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}
