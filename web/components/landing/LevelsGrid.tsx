// Landing levels section: all six damage levels as ticked cards, driven by DAMAGE_LEVELS.
import { useTranslations } from "next-intl";
import { Card } from "@/components/ui/Card";
import { DAMAGE_LEVELS } from "@/lib/levels";

export function LevelsGrid() {
  const t = useTranslations();

  return (
    <section className="mx-auto w-full max-w-6xl px-4 py-16">
      <h2 className="font-display text-2xl font-extrabold uppercase tracking-tight">
        {t("landing.levelsTitle")}
      </h2>
      <p className="mt-2 max-w-xl text-sm text-muted">{t("landing.levelsSub")}</p>
      <ul className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {DAMAGE_LEVELS.map((level) => (
          <li key={level.id}>
            <Card ticks className="h-full">
              <div className="flex items-center gap-3">
                <span
                  aria-hidden="true"
                  className="block h-3 w-8"
                  style={{ backgroundColor: level.color }}
                />
                <span className="font-mono text-xs text-muted">
                  {t("common.levelDigit", { id: String(level.id) })}
                </span>
              </div>
              <h3 className="mt-3 font-display text-base font-bold uppercase">
                {t(`levels.${level.key}.name`)}
              </h3>
              <p className="mt-1 text-sm text-muted">{t(`levels.${level.key}.description`)}</p>
            </Card>
          </li>
        ))}
      </ul>
    </section>
  );
}
