// Login route: centered card shell around the client AuthForm (mode "login").
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { AuthForm } from "@/components/auth/AuthForm";
import { Card } from "@/components/ui/Card";
import { sanitizeNextPath } from "@/lib/validation";

interface LoginPageProps {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function LoginPage({
  params,
  searchParams,
}: LoginPageProps) {
  const { locale } = await params;
  setRequestLocale(locale);
  // sanitizeNextPath: only validated same-app paths may steer the post-auth
  // redirect — echoing a raw ?next= would be an open-redirect hole.
  const { next } = await searchParams;
  const nextPath = sanitizeNextPath(next) ?? undefined;
  const t = await getTranslations("auth.login");

  return (
    <div className="flex flex-1 items-center justify-center px-4 py-12">
      <Card ticks className="w-full max-w-sm">
        <h1 className="font-display text-lg font-extrabold uppercase tracking-tight">
          {t("title")}
        </h1>
        <div className="mt-5">
          <AuthForm mode="login" nextPath={nextPath} />
        </div>
        <p className="mt-5 text-center text-xs text-muted">
          {t("noAccount")}{" "}
          <Link
            // Keep the pending destination alive if the user switches forms.
            href={
              nextPath !== undefined
                ? { pathname: "/register", query: { next: nextPath } }
                : "/register"
            }
            className="text-hazard hover:underline"
          >
            {t("registerLink")}
          </Link>
        </p>
      </Card>
    </div>
  );
}
