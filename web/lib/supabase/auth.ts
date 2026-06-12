// Auth actions over the browser Supabase client, safe to call from "use
// client" components. Failures map to a stable AuthErrorCode union so UI copy
// stays in messages/*.json instead of leaking raw Supabase messages.
import {
  AuthError,
  isAuthRetryableFetchError,
} from "@supabase/supabase-js";
import { getSupabaseBrowserClient } from "./client";

export type AuthErrorCode =
  | "invalid_credentials"
  | "email_taken"
  | "weak_password"
  | "network"
  | "not_configured"
  | "unknown";

export interface AuthResult {
  error: AuthErrorCode | null;
}

// True only when env points at a real https Supabase project — lets the auth
// forms fail fast with "not_configured" before the user provisions Supabase.
export function isSupabaseConfigured(): boolean {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key || url.includes("placeholder") || key.includes("placeholder")) {
    return false;
  }
  try {
    return new URL(url).protocol === "https:";
  } catch {
    return false;
  }
}

function mapAuthError(error: unknown): AuthErrorCode {
  if (error instanceof AuthError) {
    // Supabase couldn't be reached at all (offline, DNS, bad URL) — the SDK
    // wraps fetch failures in a retryable error rather than rejecting.
    if (isAuthRetryableFetchError(error)) {
      return "network";
    }
    // error.code is the stable machine identifier (error messages are not
    // contractual); both legacy and current "email taken" codes map together.
    switch (error.code) {
      case "invalid_credentials":
        return "invalid_credentials";
      case "user_already_exists":
      case "email_exists":
        return "email_taken";
      case "weak_password":
        return "weak_password";
      default:
        return "unknown";
    }
  }
  // A thrown TypeError is the platform's raw "fetch failed" signal.
  if (error instanceof TypeError) {
    return "network";
  }
  return "unknown";
}

export async function signUp(
  email: string,
  password: string,
  displayName: string,
): Promise<AuthResult> {
  if (!isSupabaseConfigured()) {
    return { error: "not_configured" };
  }
  try {
    const supabase = getSupabaseBrowserClient();
    const { error } = await supabase.auth.signUp({
      email,
      password,
      // user_metadata per spec section 9 — read back as user.user_metadata.
      options: { data: { display_name: displayName } },
    });
    return { error: error ? mapAuthError(error) : null };
  } catch (caught) {
    return { error: mapAuthError(caught) };
  }
}

export async function signIn(
  email: string,
  password: string,
): Promise<AuthResult> {
  if (!isSupabaseConfigured()) {
    return { error: "not_configured" };
  }
  try {
    const supabase = getSupabaseBrowserClient();
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    return { error: error ? mapAuthError(error) : null };
  } catch (caught) {
    return { error: mapAuthError(caught) };
  }
}

export async function signOut(): Promise<AuthResult> {
  if (!isSupabaseConfigured()) {
    return { error: "not_configured" };
  }
  try {
    const supabase = getSupabaseBrowserClient();
    const { error } = await supabase.auth.signOut();
    return { error: error ? mapAuthError(error) : null };
  } catch (caught) {
    return { error: mapAuthError(caught) };
  }
}
