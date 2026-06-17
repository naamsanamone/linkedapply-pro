/* ============================================================
   LinkedApply Pro — Supabase Admin Client (Lazy)
   Creates the Supabase client lazily at request time to avoid
   build-time errors when env vars aren't available.
   ============================================================ */

import { createClient, SupabaseClient } from "@supabase/supabase-js";

let _supabase: SupabaseClient | null = null;

/**
 * Get the Supabase admin client (service role key).
 * Lazy-initialized on first call to avoid build-time env errors.
 */
export function getSupabaseAdmin(): SupabaseClient {
  if (!_supabase) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!url || !key) {
      throw new Error(
        "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY"
      );
    }

    _supabase = createClient(url, key);
  }
  return _supabase;
}
