"use client";
// The verdict: giant counting level digit, level name, THE SCALE highlighted,
// confidence, and the probability bars. Levels 4-5 get the hazard banner.
import { useReducedMotion } from "framer-motion";
import { useEffect, useState, type ReactNode } from "react";
import { useFormatter, useTranslations } from "next-intl";
import { ScaleStrip } from "@/components/ui/ScaleStrip";
import { CornerTicks } from "@/components/ui/CornerTicks";
import { getLevel, isAlertLevel } from "@/lib/levels";
import type { Prediction } from "@/lib/types";
import { ConfidenceBars } from "./ConfidenceBars";

export interface ResultPanelProps {
  prediction: Prediction;
  /** Action row (heatmap toggle, analyze another) supplied by the orchestrator. */
  children?: ReactNode;
}

const COUNT_UP_MS = 800;

export function ResultPanel({ prediction, children }: ResultPanelProps) {
  const t = useTranslations();
  const format = useFormatter();
  const reduced = useReducedMotion() ?? false;
  const level = getLevel(prediction.level);
  const alert = isAlertLevel(level.id);
  // Count-up 0..N once on mount: state only tracks the animated count; the
  // rendered digit derives from it so reduced motion shows the final digit
  // with no setState outside the timer callback.
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (reduced || level.id === 0) return undefined;
    let current = 0;
    const id = window.setInterval(() => {
      current += 1;
      setCount(Math.min(current, level.id));
      if (current >= level.id) window.clearInterval(id);
    }, COUNT_UP_MS / level.id);
    return () => window.clearInterval(id);
  }, [reduced, level.id]);

  const digit = reduced ? level.id : count;

  return (
    <section
      className={`relative overflow-hidden rounded border bg-surface ${
        alert ? "border-alert/50" : "border-line"
      }`}
    >
      {/* The level-4/5 banner: the only hazard-stripe outside the primary CTA. */}
      {alert ? <span aria-hidden="true" className="hazard-stripe absolute inset-x-0 top-0" /> : null}
      <div className="relative p-5 sm:p-6">
        <CornerTicks />
        <div className="flex items-end gap-4">
          <span
            className="font-mono text-7xl leading-none font-bold"
            style={{ color: level.color }}
          >
            {t("common.levelDigit", { id: String(digit) })}
          </span>
          <h2
            className={`pb-1 font-display text-2xl leading-tight font-extrabold uppercase tracking-tight ${
              alert ? "text-alert" : ""
            }`}
          >
            {t(`levels.${level.key}.name`)}
          </h2>
        </div>
        <ScaleStrip size="md" activeLevel={level.id} className="mt-5" />
        <p className="mt-5 flex items-baseline gap-3">
          <span className="text-xs uppercase tracking-wider text-muted">
            {t("analyze.confidence")}
          </span>
          <span className="font-mono text-lg">
            {format.number(prediction.confidence, {
              style: "percent",
              maximumFractionDigits: 1,
            })}
          </span>
        </p>
        <div className="mt-5">
          <ConfidenceBars probabilities={prediction.probabilities} />
        </div>
        {children !== undefined ? (
          <div className="mt-6 flex flex-wrap items-center gap-3">{children}</div>
        ) : null}
      </div>
    </section>
  );
}
