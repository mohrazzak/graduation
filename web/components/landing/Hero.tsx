"use client";
// Landing hero: display headline, CTA, and THE SCALE animating in while the six
// level captions cycle. Reduced motion swaps the cycling for a static legend.
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/Button";
import { ScaleStrip } from "@/components/ui/ScaleStrip";
import { DAMAGE_LEVELS, getLevel, type DamageLevel } from "@/lib/levels";

const CYCLE_MS = 2500;
// Let the strip's 0 -> 5 light-up finish before the captions start.
const ENTRANCE_MS = 1100;

export function Hero() {
  const t = useTranslations();
  const reduced = useReducedMotion() ?? false;
  const [active, setActive] = useState<DamageLevel | null>(null);

  useEffect(() => {
    if (reduced) return undefined;
    let intervalId: number | undefined;
    const timeoutId = window.setTimeout(() => {
      setActive(getLevel(0));
      intervalId = window.setInterval(() => {
        setActive((current) => getLevel(((current?.id ?? 5) + 1) % DAMAGE_LEVELS.length));
      }, CYCLE_MS);
    }, ENTRANCE_MS);
    return () => {
      window.clearTimeout(timeoutId);
      if (intervalId !== undefined) window.clearInterval(intervalId);
    };
  }, [reduced]);

  return (
    <section className="mx-auto w-full max-w-6xl px-4 py-16 sm:py-24">
      <h1 className="max-w-4xl font-display text-4xl font-black uppercase tracking-tight sm:text-6xl lg:text-7xl">
        {t("landing.heroTitle")}
      </h1>
      <p className="mt-4 max-w-xl text-base text-muted sm:text-lg">{t("landing.heroSub")}</p>
      <div className="mt-8">
        <Button href="/analyze" variant="primary" size="lg">
          {t("common.actions.tryDemo")}
        </Button>
      </div>

      <div className="mt-16 sm:mt-20">
        <ScaleStrip size="lg" animateIn activeLevel={reduced ? undefined : active?.id} />
        {reduced ? (
          // Static legend: same information as the cycle, without motion.
          <ul className="mt-6 grid gap-3 sm:grid-cols-2">
            {DAMAGE_LEVELS.map((level) => (
              <li key={level.id} className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                <span className="font-mono text-xs" style={{ color: level.color }}>
                  {t("common.levelDigit", { id: String(level.id) })}
                </span>
                <span className="font-display text-sm font-bold uppercase">
                  {t(`levels.${level.key}.name`)}
                </span>
                <span className="text-sm text-muted">{t(`levels.${level.key}.description`)}</span>
              </li>
            ))}
          </ul>
        ) : (
          <div className="mt-6 min-h-16">
            <AnimatePresence mode="wait">
              {active !== null ? (
                <motion.p
                  key={active.id}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.18 }}
                  className="flex flex-wrap items-baseline gap-x-3 gap-y-1"
                >
                  <span className="font-mono text-sm" style={{ color: active.color }}>
                    {t("common.levelDigit", { id: String(active.id) })}
                  </span>
                  <span className="font-display text-lg font-bold uppercase">
                    {t(`levels.${active.key}.name`)}
                  </span>
                  <span className="text-sm text-muted">
                    {t(`levels.${active.key}.description`)}
                  </span>
                </motion.p>
              ) : null}
            </AnimatePresence>
          </div>
        )}
      </div>
    </section>
  );
}
