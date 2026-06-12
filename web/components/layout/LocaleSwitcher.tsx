"use client";
// "EN | ع" locale toggle — re-renders the current route in the other locale.
import { Fragment } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { Link, usePathname } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";

export function LocaleSwitcher() {
  const t = useTranslations("localeSwitcher");
  const locale = useLocale();
  // usePathname is locale-unprefixed, so the same href works for both targets.
  const pathname = usePathname();
  // Spec section 7: switching locales preserves the CURRENT route — including
  // the query string (e.g. /login?next=...), which usePathname alone drops.
  const searchParams = useSearchParams();
  const query = Object.fromEntries(searchParams.entries());

  return (
    <div
      role="group"
      aria-label={t("ariaLabel")}
      className="flex items-center gap-2 font-mono text-xs"
    >
      {routing.locales.map((target, index) => (
        <Fragment key={target}>
          {index > 0 ? <span aria-hidden="true" className="h-3 w-px bg-line" /> : null}
          <Link
            href={{ pathname, query }}
            locale={target}
            aria-current={target === locale ? "true" : undefined}
            className={
              target === locale ? "text-text" : "text-muted transition-colors hover:text-text"
            }
          >
            {t(target)}
          </Link>
        </Fragment>
      ))}
    </div>
  );
}
