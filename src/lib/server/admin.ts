import { createClient as createSupabase } from "@supabase/supabase-js";

// Server-side client. Uses the service-role key when provided (needed for cron
// jobs that read across all users); otherwise falls back to the anon key.
export function createAdminClient() {
  return createSupabase(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false } }
  );
}
