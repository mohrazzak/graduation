// Sticky top app bar, auth-aware: reads the Supabase user on the server and
// swaps between signed-out (How-it-works + Login) and signed-in (app links +
// identity + logout) chrome. AuthForm/LogoutButton call router.refresh() so
// this server component re-renders after every auth change.
import { Suspense } from "react";
import { getTranslations } from "next-intl/server";
import type { User } from "@supabase/supabase-js";
import { Link } from "@/i18n/navigation";
import { LogoutButton } from "@/components/auth/LogoutButton";
import { LocaleSwitcher } from "@/components/layout/LocaleSwitcher";
import { Button } from "@/components/ui/Button";
import { TierStrip } from "@/components/ui/TierStrip";
import { getServerUser } from "@/lib/supabase/server";

// user_metadata is an untyped bag — narrow before trusting display_name.
function displayNameOf(user: User): string {
  const raw: unknown = user.user_metadata["display_name"];
  if (typeof raw === "string" && raw.trim() !== "") {
    return raw;
  }
  return user.email ?? "";
}

const NAV_LINK_CLASSES =
  "hidden text-sm text-muted transition-colors hover:text-text sm:block";

export async function Navbar() {
  const [t, user] = await Promise.all([getTranslations(), getServerUser()]);

  return (
    <header className="sticky top-0 z-40 border-b border-line bg-bg">
      <div className="mx-auto flex h-14 w-full max-w-6xl items-center justify-between gap-4 px-4">
        {/* aria-label keeps the home link named on signed-in mobile, where the
            wordmark is display:none and the strip is decorative. */}
        <Link
          href="/"
          aria-label={t("common.appName")}
          className="flex shrink-0 items-center gap-2.5"
        >
          <TierStrip size="sm" />
          {/* Signed-in mobile bars carry two buttons; dropping the wordmark
              (the strip alone is the brand mark) keeps 390px from overflowing. */}
          <span
            className={`font-display text-sm font-extrabold uppercase tracking-tight ${
              user !== null ? "hidden sm:block" : ""
            }`}
          >
            {t("common.appName")}
          </span>
        </Link>
        <nav className="flex items-center gap-3 sm:gap-5">
          {/* Mobile keeps only the essential controls; no hamburger needed. */}
          {user !== null ? (
            <>
              <Link href="/analyze" className={NAV_LINK_CLASSES}>
                {t("nav.analyze")}
              </Link>
              <Link href="/history" className={NAV_LINK_CLASSES}>
                {t("nav.history")}
              </Link>
              {/* WHY Suspense: the switcher reads useSearchParams (to preserve
                  the query when switching), which static prerenders require to
                  sit under a boundary. It hydrates instantly on the client. */}
              <Suspense>
                <LocaleSwitcher />
              </Suspense>
              <span
                className="hidden max-w-[16ch] truncate text-sm text-muted lg:block"
                title={displayNameOf(user)}
              >
                {displayNameOf(user)}
              </span>
              <LogoutButton />
            </>
          ) : (
            <>
              <Link href="/how-it-works" className={NAV_LINK_CLASSES}>
                {t("nav.howItWorks")}
              </Link>
              {/* Same Suspense rationale as the signed-in branch above. */}
              <Suspense>
                <LocaleSwitcher />
              </Suspense>
              <div className="hidden sm:block">
                <Button href="/login" variant="ghost" size="md">
                  {t("common.actions.login")}
                </Button>
              </div>
            </>
          )}
          <Button href="/analyze" variant="primary" size="md">
            {t("common.actions.openApp")}
          </Button>
        </nav>
      </div>
    </header>
  );
}
