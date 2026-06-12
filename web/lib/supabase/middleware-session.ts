// Session-refresh seam for middleware.ts (Task 2.2): next-intl builds the
// response first, then this refreshes Supabase auth cookies onto it and
// reports the user so the middleware can guard /analyze and /history.
import { createServerClient } from "@supabase/ssr";
import type { User } from "@supabase/supabase-js";
import type { NextRequest, NextResponse } from "next/server";
import type { Database } from "./database.types";

export async function updateSession(
  request: NextRequest,
  response: NextResponse,
): Promise<{ user: User | null }> {
  try {
    const supabase = createServerClient<Database>(
      process.env.NEXT_PUBLIC_SUPABASE_URL ?? "https://placeholder.supabase.co",
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "placeholder-anon-key",
      {
        cookies: {
          getAll() {
            return request.cookies.getAll();
          },
          setAll(cookiesToSet, headers) {
            // Per the @supabase/ssr middleware pattern, write refreshed tokens
            // to BOTH sides: the request (so code running later in this same
            // invocation reads fresh tokens) and the response (so the browser
            // persists them). The extra headers mark the response uncacheable
            // — Set-Cookie responses must never be served from a CDN cache.
            cookiesToSet.forEach(({ name, value }) =>
              request.cookies.set(name, value),
            );
            cookiesToSet.forEach(({ name, value, options }) =>
              response.cookies.set(name, value, options),
            );
            Object.entries(headers).forEach(([key, value]) =>
              response.headers.set(key, value),
            );
          },
        },
      },
    );

    const { data, error } = await supabase.auth.getUser();
    if (error) {
      return { user: null };
    }
    return { user: data.user };
  } catch {
    // Placeholder/unreachable Supabase must degrade to "signed out" — the
    // middleware must keep routing every request no matter what.
    return { user: null };
  }
}
