// Locale negotiation + /en | /ar prefix redirects. Supabase session refresh and
// the /analyze + /history auth guard (Phase 2) will compose with this handler here.
import createMiddleware from "next-intl/middleware";
import { routing } from "./i18n/routing";

export default createMiddleware(routing);

export const config = {
  // Skip /api proxies, Next internals, and any path with a file extension (static assets).
  matcher: "/((?!api|_next|_vercel|.*\\..*).*)",
};
