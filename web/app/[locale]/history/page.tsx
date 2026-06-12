// History route: auth-gated server shell — heading plus the client history view.
import { getTranslations, setRequestLocale } from "next-intl/server";
import { HistoryClient } from "@/components/history/HistoryClient";
import { AuthGuard } from "@/components/layout/AuthGuard";
import { PageBackdrop } from "@/components/layout/PageBackdrop";

interface HistoryPageProps {
  params: Promise<{ locale: string }>;
}

export default async function HistoryPage({ params }: HistoryPageProps) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("history");

  return (
    <AuthGuard nextPath="/history">
      <PageBackdrop src="/backgrounds/history.jpg" />
      <div className="mx-auto w-full max-w-6xl px-4 py-10">
        <h1 className="font-display text-3xl font-black uppercase tracking-tight">
          {t("title")}
        </h1>
        <div className="mt-8">
          <HistoryClient />
        </div>
      </div>
    </AuthGuard>
  );
}
