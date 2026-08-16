"use client";
// The headline number: estimated damage percentage, counting up on mount.
// A weighted expectation over class probabilities — the copy must never let it
// read as a measured survey figure.
import { useReducedMotion } from "framer-motion";
import { useFormatter, useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import type { TierCode } from "@/lib/tiers";
import { getTier } from "@/lib/tiers";

export interface DamageGaugeProps {
  /** 0..100 */
  value: number;
  tier: TierCode;
}

const COUNT_UP_MS = 800;
const FRAME_MS = 32;

export function DamageGauge({ value, tier }: DamageGaugeProps) {
  const t = useTranslations();
  const format = useFormatter();
  const reduced = useReducedMotion() ?? false;
  const color = getTier(tier).color;
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (reduced) return undefined;
    const started = Date.now();
    const id = window.setInterval(() => {
      const progress = Math.min((Date.now() - started) / COUNT_UP_MS, 1);
      setCount(value * progress);
      if (progress >= 1) window.clearInterval(id);
    }, FRAME_MS);
    return () => window.clearInterval(id);
  }, [reduced, value]);

  const shown = reduced ? value : count;

  return (
    <div>
      <p className="text-xs uppercase tracking-wider text-muted">
        {t("analyze.damagePercent.label")}
      </p>
      <p
        className="font-mono text-6xl leading-none font-bold sm:text-7xl"
        style={{ color }}
        // The animated value churns; announce only the settled figure.
        aria-label={t("analyze.damagePercent.aria", {
          value: format.number(value / 100, {
            style: "percent",
            maximumFractionDigits: 1,
          }),
        })}
      >
        <span aria-hidden="true">
          {format.number(shown / 100, {
            style: "percent",
            maximumFractionDigits: 1,
          })}
        </span>
      </p>
      <p className="mt-2 text-xs text-muted">{t("analyze.damagePercent.note")}</p>
    </div>
  );
}
