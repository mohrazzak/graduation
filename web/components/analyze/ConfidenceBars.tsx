"use client";
// Four detector-score rows. Scores are independent maxima, not probabilities.
import { motion, useReducedMotion } from "framer-motion";
import { useFormatter, useTranslations } from "next-intl";
import { DAMAGE_CLASSES } from "@/lib/damage-classes";
import type { DamageScores } from "@/lib/types";

export interface ConfidenceBarsProps {
  scores: DamageScores;
}

const STAGGER_S = 0.06;
const FILL_S = 0.4;

export function ConfidenceBars({ scores }: ConfidenceBarsProps) {
  const t = useTranslations();
  const format = useFormatter();
  const reduced = useReducedMotion() ?? false;

  return (
    <ul className="space-y-2">
      {DAMAGE_CLASSES.map((entry, index) => {
        const score = scores[entry.code];
        return (
          <li key={entry.code} className="flex items-center gap-3">
            <span className="flex w-36 shrink-0 items-baseline gap-2">
              <span className="font-mono text-xs text-muted">{entry.code}</span>
              <span className="truncate text-xs">{t(`damageClasses.${entry.key}.name`)}</span>
            </span>
            <span className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-none bg-line">
              {/* Width (not scaleX) so the fill grows from the start edge in RTL too. */}
              <motion.span
                className="block h-full"
                style={{ backgroundColor: entry.color }}
                initial={reduced ? false : { width: "0%" }}
                animate={{ width: `${score * 100}%` }}
                transition={
                  reduced
                    ? { duration: 0 }
                    : { duration: FILL_S, delay: index * STAGGER_S }
                }
              />
            </span>
            <span className="w-14 shrink-0 text-end font-mono text-xs">
              {format.number(score, {
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
