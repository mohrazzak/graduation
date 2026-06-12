// Pure form/path validation helpers shared by the auth pages and AuthForm.
// Returned codes are suffixes of the auth.errors.* message keys.
import { routing } from "@/i18n/routing";

export type FieldErrorCode = "required" | "invalidEmail" | "weakPassword";

// Mirrors Supabase's default minimum so client validation and the server's
// weak_password rejection agree.
export const MIN_PASSWORD_LENGTH = 8;

// Loose shape check (something@something.tld) — the authority on validity is
// Supabase; this only catches obvious typos before a round trip.
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateDisplayName(value: string): FieldErrorCode | null {
  return value.trim() === "" ? "required" : null;
}

export function validateEmail(value: string): FieldErrorCode | null {
  if (value.trim() === "") {
    return "required";
  }
  return EMAIL_PATTERN.test(value.trim()) ? null : "invalidEmail";
}

export function validatePassword(value: string): FieldErrorCode | null {
  if (value === "") {
    return "required";
  }
  return value.length >= MIN_PASSWORD_LENGTH ? null : "weakPassword";
}

// Derived from routing.ts so the locale list stays defined in exactly one place.
const LOCALE_PREFIX = new RegExp(`^/(?:${routing.locales.join("|")})(?=/|$)`);

// Open-redirect prevention: a raw ?next= echoed into router.replace would let
// crafted links bounce users to attacker sites ("//evil.com" is scheme-relative,
// "\" is normalized to "/" by browsers). Only same-app paths survive — the
// guards run both before AND after the locale strip, because stripping can
// itself manufacture a scheme-relative path ("/en//evil.com" -> "//evil.com").
export function sanitizeNextPath(
  raw: string | string[] | undefined,
): string | null {
  const candidate = Array.isArray(raw) ? raw[0] : raw;
  if (
    candidate === undefined ||
    !candidate.startsWith("/") ||
    candidate.startsWith("//") ||
    candidate.includes("\\")
  ) {
    return null;
  }
  // Middleware sends locale-prefixed paths ("/en/analyze") but the i18n router
  // expects locale-less hrefs and re-adds the active locale itself.
  const stripped = candidate.replace(LOCALE_PREFIX, "");
  if (stripped.startsWith("//") || stripped.includes("\\")) {
    return null;
  }
  return stripped === "" ? "/" : stripped;
}
