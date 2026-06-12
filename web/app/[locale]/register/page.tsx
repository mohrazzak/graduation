// Register route: centered card shell around the client AuthForm (mode "register").
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { AuthForm } from "@/components/auth/AuthForm";
import { PageBackdrop } from "@/components/layout/PageBackdrop";
import { Card } from "@/components/ui/Card";
import { sanitizeNextPath } from "@/lib/validation";

interface RegisterPageProps {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function RegisterPage({
  params,
  searchParams,
}: RegisterPageProps) {
  const { locale } = await params;
  setRequestLocale(locale);
  // sanitizeNextPath: only validated same-app paths may steer the post-auth
  // redirect — echoing a raw ?next= would be an open-redirect hole.
  const { next } = await searchParams;
  const nextPath = sanitizeNextPath(next) ?? undefined;
  const t = await getTranslations("auth.register");

  return (
    <div className="flex flex-1 items-center justify-center px-4 py-12">
      <PageBackdrop src="/backgrounds/auth.jpg" />
      <Card ticks className="w-full max-w-sm">
        <h1 className="font-display text-lg font-extrabold uppercase tracking-tight">
          {t("title")}
        </h1>
        <div className="mt-5">
          <AuthForm mode="register" nextPath={nextPath} />
        </div>
        <p className="mt-5 text-center text-xs text-muted">
          {t("haveAccount")}{" "}
          <Link
            // Keep the pending destination alive if the user switches forms.
            href={
              nextPath !== undefined
                ? { pathname: "/login", query: { next: nextPath } }
                : "/login"
            }
            className="text-hazard hover:underline"
          >
            {t("loginLink")}
          </Link>
        </p>
      </Card>
    </div>
  );
}
