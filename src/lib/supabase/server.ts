import { createClient } from '@supabase/supabase-js';

/**
 * Server-side Supabase client with caching disabled.
 * Use this ONLY in Server Components / Route Handlers — never in client components.
 * The fetch override ensures Next.js never caches the responses from Supabase.
 */
export function createServerSupabaseClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://mock.supabase.co';
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'mock-key';

  return createClient(supabaseUrl, supabaseAnonKey, {
    global: {
      fetch: (url, options = {}) =>
        fetch(url, { ...options, cache: 'no-store' }),
    },
  });
}
