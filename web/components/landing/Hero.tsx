"use client";
// Landing hero: display headline, CTA, and THE SCALE animating in while the
// three tier captions cycle. Reduced motion swaps the cycling for a static legend.
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import Image from "next/image";
import { Button } from "@/components/ui/Button";
import { TierStrip } from "@/components/ui/TierStrip";
import { DAMAGE_TIERS, type DamageTier } from "@/lib/tiers";

const CYCLE_MS = 2500;
// Let the strip's NC -> GC light-up finish before the captions start.
const ENTRANCE_MS = 1100;

export function Hero() {
  const t = useTranslations();
  const reduced = useReducedMotion() ?? false;
  const [index, setIndex] = useState<number | null>(null);
  const active: DamageTier | null = index === null ? null : (DAMAGE_TIERS[index] ?? null);

  useEffect(() => {
    if (reduced) return undefined;
    let intervalId: number | undefined;
    const timeoutId = window.setTimeout(() => {
      setIndex(0);
      intervalId = window.setInterval(() => {
        setIndex((current) => ((current ?? 0) + 1) % DAMAGE_TIERS.length);
      }, CYCLE_MS);
    }, ENTRANCE_MS);
    return () => {
      window.clearTimeout(timeoutId);
      if (intervalId !== undefined) window.clearInterval(intervalId);
    };
  }, [reduced]);

  return (
    <section className="relative isolate overflow-hidden border-b border-line">
      {/* Decorative backdrop: meaning stays in the headline, so alt="" + aria-hidden. */}
      <Image
        src="/landing/hero.jpg"
        alt=""
        aria-hidden="true"
        fill
        priority
        sizes="100vw"
        className="object-cover grayscale brightness-[0.3]"
      />
      {/* Flat scrim, NOT a gradient (spec §8 bans gradients): guarantees AA contrast
          for text over any photo region. */}
      <div aria-hidden="true" className="absolute inset-0 bg-bg/70" />
      <div className="relative mx-auto w-full max-w-6xl px-4 py-16 sm:py-24">
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
          <TierStrip size="lg" animateIn activeTier={reduced ? undefined : active?.code} />
          {reduced ? (
            // Static legend: same information as the cycle, without motion.
            <ul className="mt-6 grid gap-3 sm:grid-cols-2">
              {DAMAGE_TIERS.map((tier) => (
                <li key={tier.code} className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                  <span className="font-mono text-xs" style={{ color: tier.color }}>
                    {tier.code}
                  </span>
                  <span className="font-display text-sm font-bold uppercase">
                    {t(`tiers.${tier.key}.name`)}
                  </span>
                  <span className="text-sm text-muted">{t(`tiers.${tier.key}.description`)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <div className="mt-6 min-h-16">
              <AnimatePresence mode="wait">
                {active !== null ? (
                  <motion.p
                    key={active.code}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.18 }}
                    className="flex flex-wrap items-baseline gap-x-3 gap-y-1"
                  >
                    <span className="font-mono text-sm" style={{ color: active.color }}>
                      {active.code}
                    </span>
                    <span className="font-display text-lg font-bold uppercase">
                      {t(`tiers.${active.key}.name`)}
                    </span>
                    <span className="text-sm text-muted">
                      {t(`tiers.${active.key}.description`)}
                    </span>
                  </motion.p>
                ) : null}
              </AnimatePresence>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
