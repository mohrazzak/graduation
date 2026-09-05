// Landing scale section: all four damage classes as ticked cards, driven by
// DAMAGE_CLASSES. One photo per class, named by class code — the map that used
// to fan four classes onto three retired-tier photos showed SMD and HVD the
// same image, which read as a three-level scale.
import { getLocale, getTranslations } from "next-intl/server";
import Image from "next/image";
import { Card } from "@/components/ui/Card";
import { DAMAGE_CLASSES } from "@/lib/damage-classes";

export async function DamageClassGrid() {
  const locale = await getLocale();
  // Each card shows the Arabic AND English class name. The secondary name comes
  // from the OTHER locale's catalog, loaded explicitly.
  const otherLocale = locale === "ar" ? "en" : "ar";
  const [t, tOther] = await Promise.all([
    getTranslations(),
    getTranslations({ locale: otherLocale, namespace: "damageClasses" }),
  ]);

  return (
    <section className="mx-auto w-full max-w-6xl px-4 py-16">
      <h2 className="font-display text-2xl font-extrabold uppercase tracking-tight">
        {t("landing.levelsTitle")}
      </h2>
      <p className="mt-2 max-w-xl text-sm text-muted">{t("landing.levelsSub")}</p>
      <ul className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {DAMAGE_CLASSES.map((tier) => (
          <li key={tier.code}>
            <Card ticks className="h-full">
              <div className="relative mb-4 aspect-3/2 overflow-hidden rounded border border-line">
                <Image
                  src={`/landing/tier-${tier.code}.jpg`}
                  alt={t("landing.levelPhotoAlt", { name: t(`damageClasses.${tier.key}.name`) })}
                  fill
                  sizes="(min-width: 1024px) 360px, (min-width: 640px) 50vw, 100vw"
                  className="object-cover grayscale-60"
                />
              </div>
              <div className="flex items-center gap-3">
                <span
                  aria-hidden="true"
                  className="block h-3 w-8"
                  style={{ backgroundColor: tier.color }}
                />
                <span className="font-mono text-xs text-muted">{tier.code}</span>
              </div>
              <h3 className="mt-3 font-display text-base font-bold uppercase">
                {t(`damageClasses.${tier.key}.name`)}
              </h3>
              <p className="mt-0.5 text-xs text-muted">
                {/* Inline span keeps the card's start-alignment while lang+dir
                    give the other-locale name correct bidi shaping + AT voice. */}
                <span lang={otherLocale} dir={otherLocale === "ar" ? "rtl" : "ltr"}>
                  {tOther(`${tier.key}.name`)}
                </span>
              </p>
              <p className="mt-2 text-sm text-muted">{t(`damageClasses.${tier.key}.description`)}</p>
            </Card>
          </li>
        ))}
      </ul>
    </section>
  );
}
