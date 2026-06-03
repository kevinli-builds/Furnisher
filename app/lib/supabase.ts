import { createClient } from '@supabase/supabase-js'

// Optional cloud backend. If the env vars aren't set, the app runs fully local
// (login + cloud save just stay hidden) — nothing else breaks.
const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

export const supabaseEnabled = !!(url && anon)

export const supabase = supabaseEnabled
  ? createClient(url as string, anon as string, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    })
  : null
