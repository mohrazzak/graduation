// Analyze route: auth-gated server shell — heading plus the client flow.
import { getTranslations, setRequestLocale } from "next-intl/server";
import { AnalyzeClient } from "@/components/analyze/AnalyzeClient";
import { AuthGuard } from "@/components/layout/AuthGuard";
import { PageBackdrop } from "@/components/layout/PageBackdrop";

interface AnalyzePageProps {
  params: Promise<{ locale: string }>;
}

export default async function AnalyzePage({ params }: AnalyzePageProps) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("analyze");

  return (
    <AuthGuard nextPath="/analyze">
      <PageBackdrop src="/backgrounds/analyze.jpg" />
      <div className="mx-auto w-full max-w-6xl px-4 py-10">
        <h1 className="font-display text-3xl font-black uppercase tracking-tight">
          {t("title")}
        </h1>
        <div className="mt-8">
          <AnalyzeClient />
        </div>
      </div>
    </AuthGuard>
  );
}
