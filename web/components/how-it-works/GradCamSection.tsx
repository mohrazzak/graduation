// How-it-works: plain-language Grad-CAM explainer, tied to the analyze page's
// heatmap toggle so readers can see it on a real result.
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";

export function GradCamSection() {
  const t = useTranslations("howItWorks.gradcam");

  return (
    <section className="py-12">
      <h2 className="font-display text-2xl font-extrabold uppercase tracking-tight">
        {t("title")}
      </h2>
      <p className="mt-4 max-w-2xl text-sm text-muted">{t("body")}</p>
      <p className="mt-3 max-w-2xl text-sm">
        {t.rich("tryNote", {
          link: (chunks) => (
            <Link href="/analyze" className="text-hazard hover:underline">
              {chunks}
            </Link>
          ),
        })}
      </p>
    </section>
  );
}
