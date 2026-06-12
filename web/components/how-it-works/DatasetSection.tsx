// How-it-works: dataset sources + labeling protocol — explicitly tagged
// placeholders the student fills in after data collection (spec section 9).
import { useTranslations } from "next-intl";
import { PlaceholderTag } from "./PlaceholderTag";

const BLOCKS = ["sources", "labeling"] as const;

export function DatasetSection() {
  const t = useTranslations("howItWorks.dataset");

  return (
    <section className="py-12">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="font-display text-2xl font-extrabold uppercase tracking-tight">
          {t("title")}
        </h2>
        <PlaceholderTag label={t("placeholderTag")} />
      </div>
      <div className="mt-8 grid gap-8 sm:grid-cols-2">
        {BLOCKS.map((block) => (
          <div key={block}>
            <h3 className="font-display text-base font-bold uppercase">{t(`${block}Title`)}</h3>
            <p className="mt-2 text-sm text-muted">{t(`${block}Body`)}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
