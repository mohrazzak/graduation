// Sticky top app bar: brand strip + wordmark, How-it-works link, locale switcher,
// Login / Open-app CTAs (auth-aware variants arrive in Phase 2).
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { LocaleSwitcher } from "@/components/layout/LocaleSwitcher";
import { Button } from "@/components/ui/Button";
import { ScaleStrip } from "@/components/ui/ScaleStrip";

export function Navbar() {
  const t = useTranslations();

  return (
    <header className="sticky top-0 z-40 border-b border-line bg-bg">
      <div className="mx-auto flex h-14 w-full max-w-6xl items-center justify-between gap-4 px-4">
        <Link href="/" className="flex shrink-0 items-center gap-2.5">
          <ScaleStrip size="sm" />
          <span className="font-display text-sm font-extrabold uppercase tracking-tight">
            {t("common.appName")}
          </span>
        </Link>
        <nav className="flex items-center gap-3 sm:gap-5">
          {/* Mobile keeps only logo + locale switcher + Open app; no hamburger needed. */}
          <Link
            href="/how-it-works"
            className="hidden text-sm text-muted transition-colors hover:text-text sm:block"
          >
            {t("nav.howItWorks")}
          </Link>
          <LocaleSwitcher />
          <div className="hidden sm:block">
            <Button href="/login" variant="ghost" size="md">
              {t("common.actions.login")}
            </Button>
          </div>
          <Button href="/analyze" variant="primary" size="md">
            {t("common.actions.openApp")}
          </Button>
        </nav>
      </div>
    </header>
  );
}
