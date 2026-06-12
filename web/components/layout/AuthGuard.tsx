// Defense-in-depth auth gate: middleware is the primary guard; this catches
// direct RSC access and future routes that forget middleware coverage.
import type { ReactNode } from "react";
import { getLocale } from "next-intl/server";
import { redirect } from "@/i18n/navigation";
import { getServerUser } from "@/lib/supabase/server";

export interface AuthGuardProps {
  children: ReactNode;
  // The wrapping page's own locale-less route (e.g. "/analyze"), forwarded to
  // login as ?next= so the user lands back where they were headed.
  nextPath?: string;
}

export async function AuthGuard({
  children,
  nextPath,
}: AuthGuardProps): Promise<ReactNode> {
  const user = await getServerUser();

  if (user === null) {
    const locale = await getLocale();
    redirect({
      href: nextPath
        ? { pathname: "/login", query: { next: nextPath } }
        : { pathname: "/login" },
      locale,
    });
  }

  return children;
}
