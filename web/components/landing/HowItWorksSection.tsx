// Landing "How assessment works": three quiet steps separated by hairline dividers.
import { useTranslations } from "next-intl";

const STEPS = ["upload", "analyze", "save"] as const;

export function HowItWorksSection() {
  const t = useTranslations("landing");

  return (
    <section className="mx-auto w-full max-w-6xl px-4 py-16">
      <h2 className="font-display text-2xl font-extrabold uppercase tracking-tight">
        {t("howTitle")}
      </h2>
      <ol className="mt-8 divide-y divide-line border-y border-line">
        {STEPS.map((step, index) => (
          <li
            key={step}
            className="flex flex-col gap-2 py-6 sm:flex-row sm:items-baseline sm:gap-8"
          >
            {/* Decorative duplicate of the <ol> ordering, styled as instrument readout. */}
            <span aria-hidden="true" className="font-mono text-sm text-muted">
              {String(index + 1).padStart(2, "0")}
            </span>
            <h3 className="min-w-32 font-display text-lg font-bold uppercase">
              {t(`steps.${step}.title`)}
            </h3>
            <p className="max-w-xl text-sm text-muted">{t(`steps.${step}.description`)}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}
