"use client";
// Print-only structural assessment report, portal-rendered onto <body> so the
// globals.css print block can isolate it (spec: premium-upgrade A4). Light
// theme is intentional: reports print on paper; the on-screen app stays dark.
import { createPortal } from "react-dom";
import { useFormatter, useTranslations } from "next-intl";
import { ScaleStrip } from "@/components/ui/ScaleStrip";
import { DAMAGE_LEVELS, getLevel } from "@/lib/levels";

export interface ReportDocumentProps {
  imageSrc: string | null;
  heatmapSrc: string | null;
  level: number;
  confidence: number;
  probabilities: number[];
  reportId: string;
  createdAt: Date;
}

export function ReportDocument({
  imageSrc,
  heatmapSrc,
  level: levelId,
  confidence,
  probabilities,
  reportId,
  createdAt,
}: ReportDocumentProps) {
  const t = useTranslations();
  const format = useFormatter();
  const level = getLevel(levelId);
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
          <span className="font-mono">{t("common.levelDigit", { id: String(level.id) })}</span>{" "}
          {t(`levels.${level.key}.name`)}
        </p>
        <ScaleStrip size="md" activeLevel={level.id} className="mt-3" />
        <p className="mt-3 font-mono text-sm">
          {t("report.confidence")}:{" "}
          {format.number(confidence, { style: "percent", maximumFractionDigits: 1 })}
        </p>
      </section>
      <section className="mt-6">
        <p className="text-xs uppercase tracking-wider">{t("report.probabilities")}</p>
        <ul className="mt-2 space-y-1.5">
          {DAMAGE_LEVELS.map((entry) => (
            <li key={entry.id} className="flex items-center gap-2 text-xs">
              <span className="w-40 shrink-0">
                <span className="font-mono">{t("common.levelDigit", { id: String(entry.id) })}</span>{" "}
                {t(`levels.${entry.key}.name`)}
              </span>
              <span className="h-2 flex-1 border border-black/20">
                <span
                  className="block h-full"
                  style={{
                    backgroundColor: entry.color,
                    width: `${(probabilities[entry.id] ?? 0) * 100}%`,
                  }}
                />
              </span>
              <span className="w-12 text-end font-mono">
                {format.number(probabilities[entry.id] ?? 0, {
                  style: "percent",
                  maximumFractionDigits: 1,
                })}
              </span>
            </li>
          ))}
        </ul>
      </section>
      <footer className="mt-10 border-t border-black/20 pt-3 text-[10px]">
        {t("report.generatedBy")}
      </footer>
    </article>,
    document.body,
  );
}
