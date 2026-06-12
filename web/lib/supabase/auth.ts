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
  | "email_not_confirmed"
  | "email_taken"
  | "weak_password"
  | "rate_limited"
  | "network"
  | "not_configured"
  | "unknown";

export interface AuthResult {
  error: AuthErrorCode | null;
}

export interface SignUpResult extends AuthResult {
  /** Email confirmation is ON and no session exists yet — show a notice, don't navigate. */
  confirmationRequired?: boolean;
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
      case "email_not_confirmed":
        return "email_not_confirmed";
      case "user_already_exists":
      case "email_exists":
        return "email_taken";
      case "weak_password":
        return "weak_password";
      case "over_email_send_rate_limit":
        return "rate_limited";
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
): Promise<SignUpResult> {
  if (!isSupabaseConfigured()) {
    return { error: "not_configured" };
  }
  try {
    const supabase = getSupabaseBrowserClient();
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      // user_metadata per spec section 9 — read back as user.user_metadata.
      options: { data: { display_name: displayName } },
    });
    if (error) {
      return { error: mapAuthError(error) };
    }
    // With email confirmation ON, Supabase obfuscates duplicate signups as a
    // fake success whose user carries an EMPTY identities array (a real new
    // user has one). identities can be absent entirely — only present-and-empty
    // means duplicate. Checked before confirmationRequired: the fake response
    // also lacks a session and would otherwise read as "confirm your email".
    if (data.user?.identities?.length === 0) {
      return { error: "email_taken" };
    }
    // A user without a session means Supabase is holding the account until the
    // email is confirmed — the UI must say so instead of bouncing to login.
    if (data.user && !data.session) {
      return { error: null, confirmationRequired: true };
    }
    return { error: null };
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
