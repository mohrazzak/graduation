// How-it-works: the three collapse tiers in depth — each tier's one-liner plus
// a longer description of its typical observable damage indicators.
import { useTranslations } from "next-intl";
import { DAMAGE_TIERS } from "@/lib/tiers";

export function ScaleExplained() {
  const t = useTranslations();

  return (
    <section className="py-12">
      <h2 className="font-display text-2xl font-extrabold uppercase tracking-tight">
        {t("howItWorks.scale.title")}
      </h2>
      <p className="mt-2 max-w-2xl text-sm text-muted">{t("howItWorks.scale.intro")}</p>
      <ul className="mt-8 space-y-8">
        {DAMAGE_TIERS.map((tier) => (
          <li key={tier.code} className="grid gap-3 sm:grid-cols-[7rem_1fr] sm:gap-8">
            <div className="flex items-center gap-3 self-start sm:pt-1">
              <span
                aria-hidden="true"
                className="block h-3 w-8"
                style={{ backgroundColor: tier.color }}
              />
              <span className="font-mono text-xs text-muted">{tier.code}</span>
            </div>
            <div>
              <h3 className="font-display text-base font-bold uppercase">
                {t(`tiers.${tier.key}.name`)}
              </h3>
              <p className="mt-1 text-sm">{t(`tiers.${tier.key}.description`)}</p>
              <p className="mt-2 max-w-2xl text-sm text-muted">
                {t(`howItWorks.scale.details.${tier.key}`)}
              </p>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
