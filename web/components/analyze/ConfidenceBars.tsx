"use client";
// Three probability rows in ramp colors, stagger-filling 60ms apart on mount.
import { motion, useReducedMotion } from "framer-motion";
import { useFormatter, useTranslations } from "next-intl";
import { DAMAGE_TIERS } from "@/lib/tiers";
import type { TierProbabilities } from "@/lib/types";

export interface ConfidenceBarsProps {
  probabilities: TierProbabilities;
}

const STAGGER_S = 0.06;
const FILL_S = 0.4;

export function ConfidenceBars({ probabilities }: ConfidenceBarsProps) {
  const t = useTranslations();
  const format = useFormatter();
  const reduced = useReducedMotion() ?? false;

  return (
    <ul className="space-y-2">
      {DAMAGE_TIERS.map((tier, index) => {
        const probability = probabilities[tier.code];
        return (
          <li key={tier.code} className="flex items-center gap-3">
            <span className="flex w-36 shrink-0 items-baseline gap-2">
              <span className="font-mono text-xs text-muted">{tier.code}</span>
              <span className="truncate text-xs">{t(`tiers.${tier.key}.name`)}</span>
            </span>
            <span className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-none bg-line">
              {/* Width (not scaleX) so the fill grows from the start edge in RTL too. */}
              <motion.span
                className="block h-full"
                style={{ backgroundColor: tier.color }}
                initial={reduced ? false : { width: "0%" }}
                animate={{ width: `${probability * 100}%` }}
                transition={
                  reduced
                    ? { duration: 0 }
                    : { duration: FILL_S, delay: index * STAGGER_S }
                }
              />
            </span>
            <span className="w-14 shrink-0 text-end font-mono text-xs">
              {format.number(probability, {
                style: "percent",
                maximumFractionDigits: 1,
              })}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
