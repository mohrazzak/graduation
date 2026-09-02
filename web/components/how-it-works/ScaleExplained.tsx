// How-it-works: the four destruction classes in depth — each class's code and
// colour beside a description of its typical observable damage indicators.
import { useTranslations } from "next-intl";
import { DAMAGE_CLASSES } from "@/lib/damage-classes";

export function ScaleExplained() {
  const t = useTranslations();

  return (
    <section className="py-12">
      <h2 className="font-display text-2xl font-extrabold uppercase tracking-tight">
        {t("howItWorks.scale.title")}
      </h2>
      <p className="mt-2 max-w-2xl text-sm text-muted">{t("howItWorks.scale.intro")}</p>
      <ul className="mt-8 space-y-8">
        {DAMAGE_CLASSES.map((entry) => (
          <li key={entry.code} className="grid gap-3 sm:grid-cols-[7rem_1fr] sm:gap-8">
            <div className="flex items-center gap-3 self-start sm:pt-1">
              <span
                aria-hidden="true"
                className="block h-3 w-8"
                style={{ backgroundColor: entry.color }}
              />
              <span className="font-mono text-xs text-muted">{entry.code}</span>
            </div>
            <div>
              <h3 className="font-display text-base font-bold uppercase">
                {t(`damageClasses.${entry.key}.name`)}
              </h3>
              <p className="mt-1 max-w-2xl text-sm text-muted">{t(`damageClasses.${entry.key}.description`)}</p>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
