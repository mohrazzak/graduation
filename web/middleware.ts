// Locale negotiation + Supabase session refresh + auth guard for /analyze and
// /history. Kept as middleware.ts (not Next 16's proxy.ts) — the spec mandates
// this filename and it still works; the deprecation warning is accepted.
import createMiddleware from "next-intl/middleware";
import { NextResponse, type NextRequest } from "next/server";
import { routing } from "./i18n/routing";
import { updateSession } from "./lib/supabase/middleware-session";
import { sanitizeNextPath } from "./lib/validation";

const handleI18nRouting = createMiddleware(routing);

// Locale-stripped route prefixes that require a signed-in user (spec section 9).
const PROTECTED_PATHS = ["/analyze", "/history"];

// Locale-stripped auth pages a signed-in user gets bounced away from (inverse guard).
const AUTH_PATHS = ["/login", "/register"];

function matchesAny(pathWithoutLocale: string, prefixes: string[]): boolean {
  return prefixes.some(
    (path) =>
      pathWithoutLocale === path || pathWithoutLocale.startsWith(`${path}/`),
  );
}

// Derived from routing.ts so the locale list stays defined in exactly one place.
const LOCALE_PREFIX = new RegExp(`^/(${routing.locales.join("|")})(?=/|$)`);

export default async function middleware(
  request: NextRequest,
): Promise<NextResponse> {
  // next-intl builds the response first so refreshed Supabase auth cookies
  // ride on whatever response (render, rewrite, locale redirect) ships.
  const response = handleI18nRouting(request);
  const { user } = await updateSession(request, response);

  const { pathname } = request.nextUrl;
  const localeMatch = pathname.match(LOCALE_PREFIX);

  // Guard only locale-prefixed URLs: a bare /analyze gets next-intl's locale
  // redirect first (it owns negotiation), then this guard catches the retry.
  if (localeMatch?.[1]) {
    const locale = localeMatch[1];
    const pathWithoutLocale = pathname.slice(localeMatch[0].length) || "/";

    if (user === null && matchesAny(pathWithoutLocale, PROTECTED_PATHS)) {
      const loginUrl = request.nextUrl.clone();
      loginUrl.pathname = `/${locale}/login`;
      loginUrl.search = "";
      // next carries the locale-prefixed original path so login can bounce back.
      loginUrl.searchParams.set("next", pathname);

      const redirect = NextResponse.redirect(loginUrl, 307);
      // Re-attach cookies refreshed by updateSession — they were written onto
      // the intl response, which this redirect replaces.
      response.cookies
        .getAll()
        .forEach((cookie) => redirect.cookies.set(cookie));
      return redirect;
    }

    // Inverse guard: a signed-in user has no business on the auth forms — honor
    // a sanitized ?next= (locale-less by contract) or fall back to /analyze. A
    // next pointing back at an auth page is ignored: it would redirect-loop.
    if (user !== null && matchesAny(pathWithoutLocale, AUTH_PATHS)) {
      const next = sanitizeNextPath(
        request.nextUrl.searchParams.get("next") ?? undefined,
      );
      const target =
        next !== null && !matchesAny(next, AUTH_PATHS) ? next : "/analyze";

      const destinationUrl = request.nextUrl.clone();
      destinationUrl.pathname =
        target === "/" ? `/${locale}` : `/${locale}${target}`;
      destinationUrl.search = "";

      const redirect = NextResponse.redirect(destinationUrl, 307);
      // Re-attach cookies refreshed by updateSession — they were written onto
      // the intl response, which this redirect replaces.
      response.cookies
        .getAll()
        .forEach((cookie) => redirect.cookies.set(cookie));
      return redirect;
    }
  }

  return response;
}

export const config = {
  // Skip /api proxies, Next internals, and any path with a file extension (static assets).
  matcher: "/((?!api|_next|_vercel|.*\\..*).*)",
};
