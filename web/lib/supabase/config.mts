// Whether the Supabase environment points at a usable project. Kept free of
// any Supabase client import so auth, queries, and tests can all read it
// without pulling the browser SDK into scope.

// Loopback hosts are the only place plaintext http is acceptable: that is the
// local `supabase start` stack, where traffic never leaves the machine.
const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);

/**
 * True only when env points at a real Supabase project, letting the auth forms
 * and queries fail fast with "not_configured" before one is provisioned.
 *
 * A remote project MUST be https; only a loopback stack may be plain http.
 */
export function isSupabaseConfigured(): boolean {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key || url.includes("placeholder") || key.includes("placeholder")) {
    return false;
  }
  try {
    const parsed = new URL(url);
    if (parsed.protocol === "https:") {
      return true;
    }
    return parsed.protocol === "http:" && LOOPBACK_HOSTS.has(parsed.hostname);
  } catch {
    return false;
  }
}
