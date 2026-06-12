// How-it-works: public methodology page — the scale in depth, dataset/model/metrics
// placeholders structured for real numbers after training, and the Grad-CAM explainer.
import { getTranslations, setRequestLocale } from "next-intl/server";
import { PageBackdrop } from "@/components/layout/PageBackdrop";
import { DatasetSection } from "@/components/how-it-works/DatasetSection";
import { GradCamSection } from "@/components/how-it-works/GradCamSection";
import { MetricsSection } from "@/components/how-it-works/MetricsSection";
import { ModelSection } from "@/components/how-it-works/ModelSection";
import { ScaleExplained } from "@/components/how-it-works/ScaleExplained";

interface HowItWorksPageProps {
  params: Promise<{ locale: string }>;
}

export default async function HowItWorksPage({ params }: HowItWorksPageProps) {
  const { locale } = await params;
  // Opts the page into static rendering despite next-intl's request access.
  setRequestLocale(locale);
  const t = await getTranslations("howItWorks");

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-10">
      <PageBackdrop src="/backgrounds/how-it-works.jpg" />
      <h1 className="font-display text-3xl font-black uppercase tracking-tight">
        {t("title")}
      </h1>
      {/* Hairline dividers between sections — quiet technical rhythm, no cards. */}
      <div className="mt-4 divide-y divide-line">
        <ScaleExplained />
        <DatasetSection />
        <ModelSection />
        <MetricsSection />
        <GradCamSection />
      </div>
    </div>
  );
}
