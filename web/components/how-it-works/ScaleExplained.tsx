// How-it-works: the 0-5 scale in depth — every level's one-liner plus a longer
// description of its typical observable damage indicators.
import { useTranslations } from "next-intl";
import { DAMAGE_LEVELS } from "@/lib/levels";

export function ScaleExplained() {
  const t = useTranslations();

  return (
    <section className="py-12">
      <h2 className="font-display text-2xl font-extrabold uppercase tracking-tight">
        {t("howItWorks.scale.title")}
      </h2>
      <p className="mt-2 max-w-2xl text-sm text-muted">{t("howItWorks.scale.intro")}</p>
      <ul className="mt-8 space-y-8">
        {DAMAGE_LEVELS.map((level) => (
          <li key={level.id} className="grid gap-3 sm:grid-cols-[7rem_1fr] sm:gap-8">
            <div className="flex items-center gap-3 self-start sm:pt-1">
              <span
                aria-hidden="true"
                className="block h-3 w-8"
                style={{ backgroundColor: level.color }}
              />
              <span className="font-mono text-xs text-muted">
                {t("common.levelDigit", { id: String(level.id) })}
              </span>
            </div>
            <div>
              <h3 className="font-display text-base font-bold uppercase">
                {t(`levels.${level.key}.name`)}
              </h3>
              <p className="mt-1 text-sm">{t(`levels.${level.key}.description`)}</p>
              <p className="mt-2 max-w-2xl text-sm text-muted">
                {t(`howItWorks.scale.details.${level.key}`)}
              </p>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
