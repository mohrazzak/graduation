"use client";
// Six probability rows in ramp colors, stagger-filling 60ms apart on mount.
import { motion, useReducedMotion } from "framer-motion";
import { useFormatter, useTranslations } from "next-intl";
import { DAMAGE_LEVELS } from "@/lib/levels";

export interface ConfidenceBarsProps {
  probabilities: number[];
}

const STAGGER_S = 0.06;
const FILL_S = 0.4;

export function ConfidenceBars({ probabilities }: ConfidenceBarsProps) {
  const t = useTranslations();
  const format = useFormatter();
  const reduced = useReducedMotion() ?? false;

  return (
    <ul className="space-y-2">
      {DAMAGE_LEVELS.map((level, index) => {
        const probability = probabilities[level.id] ?? 0;
        return (
          <li key={level.id} className="flex items-center gap-3">
            <span className="flex w-36 shrink-0 items-baseline gap-2">
              <span className="font-mono text-xs text-muted">
                {t("common.levelDigit", { id: String(level.id) })}
              </span>
              <span className="truncate text-xs">{t(`levels.${level.key}.name`)}</span>
            </span>
            <span className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-none bg-line">
              {/* Width (not scaleX) so the fill grows from the start edge in RTL too. */}
              <motion.span
                className="block h-full"
                style={{ backgroundColor: level.color }}
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
              {format.number(probability, { style: "percent", maximumFractionDigits: 1 })}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
