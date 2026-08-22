"use client";
// The verdict: estimated damage percentage, tier name, THE SCALE highlighted,
// confidence, the probability bars, and which model produced it. GC gets the
// hazard banner.
import { type ReactNode } from "react";
import { useFormatter, useTranslations } from "next-intl";
import { DamageStrip } from "@/components/ui/DamageStrip";
import { CornerTicks } from "@/components/ui/CornerTicks";
import { getDamageClass, severityOf } from "@/lib/damage-classes";
import type { Prediction } from "@/lib/types";
import { ConfidenceBars } from "./ConfidenceBars";

export interface ResultPanelProps {
  prediction: Prediction;
  /** Action row (heatmap toggle, analyze another) supplied by the orchestrator. */
  children?: ReactNode;
}

export function ResultPanel({ prediction, children }: ResultPanelProps) {
  const t = useTranslations();
  const format = useFormatter();
  const entry = getDamageClass(prediction.class_code);
  const alert = prediction.class_code === "TD";

  return (
    <section
      className={`relative overflow-hidden rounded border bg-surface ${
        alert ? "border-alert/50" : "border-line"
      }`}
    >
      {/* The GC banner: the only hazard-stripe outside the primary CTA. */}
      {alert ? (
        <span aria-hidden="true" className="hazard-stripe absolute inset-x-0 top-0" />
      ) : null}
      <div className="relative p-5 sm:p-6">
        <CornerTicks />
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <span className="block text-xs uppercase tracking-wider text-muted">
              {t("analyze.severity")}
            </span>
            <span className="font-mono text-3xl font-semibold">
              {severityOf(prediction.class_code)}/4
            </span>
          </div>
          <div className="text-end">
            <span className="font-mono text-xs text-muted">{entry.code}</span>
            <h2
              className={`font-display text-2xl leading-tight font-extrabold uppercase tracking-tight ${
                alert ? "text-alert" : ""
              }`}
              style={alert ? undefined : { color: entry.color }}
            >
              {t(`damageClasses.${entry.key}.name`)}
            </h2>
          </div>
        </div>
        <DamageStrip active={entry.code} className="mt-5" />
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
          <ConfidenceBars scores={prediction.scores} />
          <p className="mt-2 text-xs text-muted">{t("analyze.scoresNote")}</p>
        </div>
        <p className="mt-5 flex flex-wrap items-baseline gap-2 border-t border-line pt-4 text-xs text-muted">
          <span className="uppercase tracking-wider">{t("analyze.modelUsed")}</span>
          <span className="font-mono">{prediction.model.name}</span>
          {prediction.model.accuracy !== null ? (
            <span className="font-mono">
              {t("models.accuracy", {
                value: format.number(prediction.model.accuracy, {
                  style: "percent",
                  maximumFractionDigits: 2,
                }),
              })}
            </span>
          ) : null}
        </p>
        {children !== undefined ? (
          <div className="mt-6 flex flex-wrap items-center gap-3">{children}</div>
        ) : null}
      </div>
    </section>
  );
}
