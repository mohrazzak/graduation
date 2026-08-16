"use client";
// Command-center strip above the history grid: total, average confidence,
// and a three-bar tier histogram in ramp colors.
import { motion, useReducedMotion } from "framer-motion";
import { useFormatter, useTranslations } from "next-intl";
import { CornerTicks } from "@/components/ui/CornerTicks";
import { DAMAGE_TIERS } from "@/lib/tiers";
import type { Analysis } from "@/lib/types";

export interface HistoryStatsProps {
  analyses: Analysis[];
}

const STAGGER_S = 0.06;

export function HistoryStats({ analyses }: HistoryStatsProps) {
  const t = useTranslations("history.stats");
  const format = useFormatter();
  const reduced = useReducedMotion() ?? false;
  const counts = DAMAGE_TIERS.map(
    (tier) => analyses.filter((analysis) => analysis.tier === tier.code).length,
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
            {DAMAGE_TIERS.map((tier, index) => {
              const count = counts[index] ?? 0;
              return (
                <li key={tier.code} className="flex h-full flex-1 flex-col gap-1">
                  {/* The track owns the percentage context; the label below never steals height. */}
                  <span className="relative block min-h-0 flex-1">
                    <motion.span
                      className="absolute inset-x-0 bottom-0 block"
                      style={{ backgroundColor: tier.color }}
                      initial={reduced ? false : { height: "0%" }}
                      animate={{ height: `${Math.max((count / max) * 100, 3)}%` }}
                      transition={
                        reduced ? { duration: 0 } : { duration: 0.4, delay: index * STAGGER_S }
                      }
                    />
                  </span>
                  <span className="text-center font-mono text-[10px] text-muted">
                    {tier.code} {format.number(count)}
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
