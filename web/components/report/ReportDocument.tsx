"use client";
// Print-only structural assessment report, portal-rendered onto <body> so the
// globals.css print block can isolate it. Light theme is intentional: reports
// print on paper; the on-screen app stays dark.
import { createPortal } from "react-dom";
import { useFormatter, useTranslations } from "next-intl";
import { TierStrip } from "@/components/ui/TierStrip";
import { DAMAGE_TIERS, getTier, type TierCode } from "@/lib/tiers";
import type { TierProbabilities } from "@/lib/types";

export interface ReportDocumentProps {
  imageSrc: string | null;
  heatmapSrc: string | null;
  tier: TierCode;
  confidence: number;
  probabilities: TierProbabilities;
  /** 0..100 */
  damagePercent: number;
  /** Which classifier produced this verdict — the report must be attributable. */
  modelName: string;
  reportId: string;
  createdAt: Date;
}

export function ReportDocument({
  imageSrc,
  heatmapSrc,
  tier: tierCode,
  confidence,
  probabilities,
  damagePercent,
  modelName,
  reportId,
  createdAt,
}: ReportDocumentProps) {
  const t = useTranslations();
  const format = useFormatter();
  const tier = getTier(tierCode);
  if (typeof document === "undefined") return null;

  return createPortal(
    <article className="report-doc p-10 font-body">
      <header className="border-b-2 border-black pb-4">
        <p className="font-display text-2xl font-black uppercase">{t("common.appName")}</p>
        <h1 className="mt-1 text-lg uppercase tracking-wider">{t("report.title")}</h1>
        <p className="mt-2 font-mono text-xs">
          {t("report.id")}: {reportId} · {t("report.date")}:{" "}
          {format.dateTime(createdAt, { dateStyle: "medium", timeStyle: "short" })}
        </p>
      </header>
      {imageSrc !== null ? (
        <div className="relative mt-6 w-72">
          {/* eslint-disable-next-line @next/next/no-img-element -- blob/signed URLs */}
          <img src={imageSrc} alt="" className="block w-full border border-black/20" />
          {heatmapSrc !== null ? (
            // eslint-disable-next-line @next/next/no-img-element -- data/signed URLs
            <img src={heatmapSrc} alt="" className="absolute inset-0 h-full w-full opacity-45" />
          ) : null}
        </div>
      ) : null}
      <section className="mt-6">
        <p className="text-xs uppercase tracking-wider">{t("report.verdict")}</p>
        <p className="mt-1 text-2xl font-bold">
          <span className="font-mono">{tier.code}</span> {t(`tiers.${tier.key}.name`)}
        </p>
        <TierStrip size="md" activeTier={tier.code} className="mt-3" />
        <p className="mt-3 font-mono text-sm">
          {t("report.damagePercent")}:{" "}
          {format.number(damagePercent / 100, {
            style: "percent",
            maximumFractionDigits: 1,
          })}
        </p>
        <p className="mt-1 font-mono text-sm">
          {t("report.confidence")}:{" "}
          {format.number(confidence, { style: "percent", maximumFractionDigits: 1 })}
        </p>
      </section>
      <section className="mt-6">
        <p className="text-xs uppercase tracking-wider">{t("report.probabilities")}</p>
        <ul className="mt-2 space-y-1.5">
          {DAMAGE_TIERS.map((entry) => (
            <li key={entry.code} className="flex items-center gap-2 text-xs">
              <span className="w-40 shrink-0">
                <span className="font-mono">{entry.code}</span>{" "}
                {t(`tiers.${entry.key}.name`)}
              </span>
              <span className="h-2 flex-1 border border-black/20">
                <span
                  className="block h-full"
                  style={{
                    backgroundColor: entry.color,
                    width: `${probabilities[entry.code] * 100}%`,
                  }}
                />
              </span>
              <span className="w-12 text-end font-mono">
                {format.number(probabilities[entry.code], {
                  style: "percent",
                  maximumFractionDigits: 1,
                })}
              </span>
            </li>
          ))}
        </ul>
      </section>
      <section className="mt-6">
        <p className="text-xs uppercase tracking-wider">{t("report.recommendation")}</p>
        <p className="mt-1 text-sm font-bold">
          {t(`tiers.${tier.key}.recommendation.title`)}
        </p>
        <ul className="mt-2 space-y-1 text-xs">
          {(t.raw(`tiers.${tier.key}.recommendation.items`) as string[]).map((item) => (
            <li key={item}>— {item}</li>
          ))}
        </ul>
      </section>
      <footer className="mt-10 border-t border-black/20 pt-3 text-[10px]">
        <p className="font-mono">
          {t("report.model")}: {modelName}
        </p>
        <p className="mt-1">{t("report.generatedBy")}</p>
      </footer>
    </article>,
    document.body,
  );
}
