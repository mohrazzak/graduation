// Root layout (there is no app/layout.tsx — every route lives under [locale]):
// owns <html> with locale-driven lang/dir and provides messages to client components.
import type { Metadata } from "next";
import { hasLocale, NextIntlClientProvider } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { routing } from "@/i18n/routing";
import { Footer } from "@/components/layout/Footer";
import { Navbar } from "@/components/layout/Navbar";
import { archivo, cairo, inter, jetbrainsMono } from "@/lib/fonts";
import "../globals.css";

interface LocaleLayoutProps {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}

export function generateStaticParams(): Array<{ locale: string }> {
  return routing.locales.map((locale) => ({ locale }));
}

export async function generateMetadata({
  params,
}: Omit<LocaleLayoutProps, "children">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "common" });
  return { title: t("appName") };
}

export default async function LocaleLayout({
  children,
  params,
}: LocaleLayoutProps) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }
  // Opts the subtree into static rendering despite next-intl's request access.
  setRequestLocale(locale);

  return (
    // Font variables live on <html> so the html[dir="rtl"] role remap in
    // globals.css can resolve var(--font-arabic) at the element it is declared on.
    <html
      lang={locale}
      dir={locale === "ar" ? "rtl" : "ltr"}
      className={`${archivo.variable} ${inter.variable} ${jetbrainsMono.variable} ${cairo.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col bg-bg text-text">
        <NextIntlClientProvider>
          <Navbar />
          {/* flex-1 in the body column gives the landmark its viewport-filling min-height. */}
          <main className="flex flex-1 flex-col">{children}</main>
          <Footer />
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
