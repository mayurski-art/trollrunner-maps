import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Same Supabase project as trollrunner.net (Decision 2 in docs/DESIGN.md) —
 * one account works across every TrollRunner subdomain. The anon key is
 * public by design; every privilege is enforced by Postgres RLS.
 */
const SUPABASE_URL = "https://tjsyhfplxjtakdfkpdtg.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRqc3loZnBseGp0YWtkZmtwZHRnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYzOTc0ODksImV4cCI6MjA5MTk3MzQ4OX0.xLUcPUUguRBQttNwiIRWJHxjJjLqrQDMu4Ubsk5yZoQ";

let client: SupabaseClient | null = null;

export function getClient(): SupabaseClient {
  if (client) return client;
  client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
      storageKey: "trollrunner-accounts-auth",
    },
  });
  return client;
}
