// Landing: hero with the animated SCALE, the three-step process, and the four classes.
import { setRequestLocale } from "next-intl/server";
import { Hero } from "@/components/landing/Hero";
import { HowItWorksSection } from "@/components/landing/HowItWorksSection";
import { DamageClassGrid } from "@/components/landing/DamageClassGrid";

interface LandingPageProps {
  params: Promise<{ locale: string }>;
}

export default async function LandingPage({ params }: LandingPageProps) {
  const { locale } = await params;
  // Opts the page into static rendering despite next-intl's request access.
  setRequestLocale(locale);

  return (
    <>
      <Hero />
      <HowItWorksSection />
      <DamageClassGrid />
    </>
  );
}
