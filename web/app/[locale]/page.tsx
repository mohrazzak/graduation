// Placeholder landing page so /en and /ar are testable end-to-end.
// Replaced by the real landing in Task 1.6.
import { getTranslations, setRequestLocale } from "next-intl/server";

interface LandingPageProps {
  params: Promise<{ locale: string }>;
}

export default async function LandingPage({ params }: LandingPageProps) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("landing");

  return (
    <main className="flex flex-1 items-center justify-center p-8">
      <h1 className="text-center text-4xl font-extrabold uppercase tracking-tight">
        {t("heroTitle")}
      </h1>
    </main>
  );
}
