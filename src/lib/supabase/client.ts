import { createClient } from '@supabase/supabase-js';

// Initialize the Supabase client
// This checks for the environment variables; falls back to dummy if not present for local dev
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://mock.supabase.co';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'mock-key';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
