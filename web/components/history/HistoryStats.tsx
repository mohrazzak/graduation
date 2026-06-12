"use client";
// Command-center strip above the history grid: total, average confidence,
// and a six-bar level histogram in ramp colors (spec: premium-upgrade A5).
import { motion, useReducedMotion } from "framer-motion";
import { useFormatter, useTranslations } from "next-intl";
import { CornerTicks } from "@/components/ui/CornerTicks";
import { DAMAGE_LEVELS } from "@/lib/levels";
import type { Analysis } from "@/lib/types";

export interface HistoryStatsProps {
  analyses: Analysis[];
}

const STAGGER_S = 0.06;

export function HistoryStats({ analyses }: HistoryStatsProps) {
  const t = useTranslations("history.stats");
  const tCommon = useTranslations("common");
  const format = useFormatter();
  const reduced = useReducedMotion() ?? false;
  const counts = DAMAGE_LEVELS.map(
    (level) => analyses.filter((analysis) => analysis.level === level.id).length,
  );
  const max = Math.max(...counts, 1);
  const average =
    analyses.reduce((sum, analysis) => sum + analysis.confidence, 0) / analyses.length;

  return (
    <section className="relative mb-8 rounded border border-line bg-surface p-5">
      <CornerTicks />
      <div className="flex flex-wrap items-end gap-x-10 gap-y-6">
        <div>
          <p className="text-xs uppercase tracking-wider text-muted">{t("total")}</p>
          <p className="mt-1 font-mono text-4xl font-bold leading-none">
            {format.number(analyses.length)}
          </p>
        </div>
        <div>
          <p className="text-xs uppercase tracking-wider text-muted">{t("avgConfidence")}</p>
          <p className="mt-1 font-mono text-4xl font-bold leading-none">
            {format.number(average, { style: "percent", maximumFractionDigits: 1 })}
          </p>
        </div>
        <div className="min-w-48 flex-1">
          <p className="text-xs uppercase tracking-wider text-muted">{t("distribution")}</p>
          <ul className="mt-2 flex h-16 items-end gap-1.5">
            {DAMAGE_LEVELS.map((level, index) => {
              const count = counts[level.id] ?? 0;
              return (
                <li key={level.id} className="flex h-full flex-1 flex-col justify-end gap-1">
                  <motion.span
                    className="block w-full"
                    style={{ backgroundColor: level.color }}
                    initial={reduced ? false : { height: "0%" }}
                    animate={{ height: `${Math.max((count / max) * 100, 3)}%` }}
                    transition={
                      reduced ? { duration: 0 } : { duration: 0.4, delay: index * STAGGER_S }
                    }
                  />
                  <span className="text-center font-mono text-[10px] text-muted">
                    {tCommon("levelDigit", { id: String(level.id) })}
                    {" "}
                    {format.number(count)}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </section>
  );
}
