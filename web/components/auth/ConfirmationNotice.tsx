"use client";
// Post-register success panel shown when Supabase email confirmation is ON:
// no session exists yet, so instead of navigating we tell the user what to do.
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";

export interface ConfirmationNoticeProps {
  /** Locale-stripped ?next= destination to keep alive across the confirm-then-login hop. */
  nextPath?: string;
}

export function ConfirmationNotice({ nextPath }: ConfirmationNoticeProps) {
  const t = useTranslations("auth.register");
  return (
    // Hazard, not alert: #FF3B30 is reserved for level-4/5 surfaces (spec section 8).
    <div
      role="status"
      className="flex flex-col items-start gap-3 rounded border border-hazard/40 bg-hazard/10 px-3 py-3"
    >
      <p className="text-xs text-text">{t("confirmationNotice")}</p>
      <Link
        href={
          nextPath !== undefined
            ? { pathname: "/login", query: { next: nextPath } }
            : "/login"
        }
        className="text-xs font-semibold text-hazard hover:underline"
      >
        {t("loginLink")}
      </Link>
    </div>
  );
}
