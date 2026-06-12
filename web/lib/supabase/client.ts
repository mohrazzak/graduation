// Browser-side Supabase client, memoized in module scope so every client
// component shares one auth/session instance per tab.
import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";

let client: SupabaseClient<Database> | undefined;

export function getSupabaseBrowserClient(): SupabaseClient<Database> {
  // Fall back to placeholder values so the client is always constructible
  // before the user provisions Supabase; auth.ts gates real calls via
  // isSupabaseConfigured() and maps failures to stable error codes.
  client ??= createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? "https://placeholder.supabase.co",
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "placeholder-anon-key",
  );
  return client;
}
