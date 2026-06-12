// Landing levels section: all six damage levels as ticked cards, driven by DAMAGE_LEVELS.
import { getLocale, getTranslations } from "next-intl/server";
import { Card } from "@/components/ui/Card";
import { DAMAGE_LEVELS } from "@/lib/levels";

export async function LevelsGrid() {
  const locale = await getLocale();
  // Spec section 9: each card shows the Arabic AND English level name. The
  // secondary name comes from the OTHER locale's catalog, loaded explicitly.
  const otherLocale = locale === "ar" ? "en" : "ar";
  const [t, tOther] = await Promise.all([
    getTranslations(),
    getTranslations({ locale: otherLocale, namespace: "levels" }),
  ]);

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
              <p className="mt-0.5 text-xs text-muted">
                {/* Inline span keeps the card's start-alignment while lang+dir
                    give the other-locale name correct bidi shaping + AT voice. */}
                <span lang={otherLocale} dir={otherLocale === "ar" ? "rtl" : "ltr"}>
                  {tOther(`${level.key}.name`)}
                </span>
              </p>
              <p className="mt-2 text-sm text-muted">{t(`levels.${level.key}.description`)}</p>
            </Card>
          </li>
        ))}
      </ul>
    </section>
  );
}
