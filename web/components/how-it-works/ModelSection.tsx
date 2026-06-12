// How-it-works: model architecture placeholder — transfer-learning CNN narrative,
// the deliberately deferred framework choice, and today's mock-endpoint note.
import { useTranslations } from "next-intl";
import { PlaceholderTag } from "./PlaceholderTag";

export function ModelSection() {
  const t = useTranslations("howItWorks.model");

  return (
    <section className="py-12">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="font-display text-2xl font-extrabold uppercase tracking-tight">
          {t("title")}
        </h2>
        <PlaceholderTag label={t("placeholderTag")} />
      </div>
      <p className="mt-4 max-w-2xl text-sm text-muted">{t("body")}</p>
      <p className="mt-3 max-w-2xl text-sm text-muted">{t("frameworkNote")}</p>
      {/* Full text color: this is the one statement about the demo as it runs today. */}
      <p className="mt-3 max-w-2xl text-sm">{t("mockNote")}</p>
    </section>
  );
}
