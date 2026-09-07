"use client";
// The printed record of one saved assessment: a single A4 page, portalled onto
// <body> so the globals.css print block can isolate it
// (`body:has(.report-doc) > *:not(.report-doc)`). It is display:none on screen
// and light on paper — the app stays dark, reports do not.
//
// Every band below is fixed-height except the evidence grid, which absorbs the
// slack. That is what makes "one page" a property of the layout rather than a
// hope: nothing here can grow except a photograph and a regions table, and both
// cap themselves.
import { createPortal } from "react-dom";
import { useFormatter, useTranslations } from "next-intl";
import type { Analysis } from "@/lib/types";
import { ReportEvidence } from "./ReportEvidence";
import { ReportLegend } from "./ReportLegend";
import { ReportMetaList, type ReportMetaEntry } from "./ReportMetaList";
import { ReportRecommendation } from "./ReportRecommendation";
import { ReportRegions } from "./ReportRegions";
import { ReportScores } from "./ReportScores";
import { ReportVerdict } from "./ReportVerdict";

export interface ReportDocumentProps {
  analysis: Analysis;
  /** Signed photo URL; null when signing failed — the report prints without it. */
  imageSrc: string | null;
  /** Signed restored PNG, only once it is ready; null renders no second figure. */
  restoredSrc: string | null;
  /** Localized model name — never the English `model.name` that /predict returns. */
  modelName: string;
}

export function ReportDocument({
  analysis,
  imageSrc,
  restoredSrc,
  modelName,
}: ReportDocumentProps) {
  const t = useTranslations();
  const format = useFormatter();
  if (typeof document === "undefined") return null;

  // Only outputs this row actually carries are named, so a report can never
  // imply a restoration or a 3D model that was never generated.
  const outputs = [
    analysis.repaired_path !== null ? t("report.outputsValues.repaired") : null,
    analysis.model3d_path !== null ? t("report.outputsValues.model3d") : null,
    analysis.model3d_before_path !== null ? t("report.outputsValues.model3dBefore") : null,
  ].filter((output): output is string => output !== null);

  const identity: ReportMetaEntry[] = [
    { label: t("report.id"), value: analysis.id },
    {
      label: t("report.date"),
      value: format.dateTime(new Date(analysis.created_at), {
        dateStyle: "medium",
        timeStyle: "short",
      }),
    },
  ];
  const provenance: ReportMetaEntry[] = [
    { label: t("report.model"), value: modelName },
    { label: t("report.scaleVersion"), value: analysis.scale_version },
    {
      label: t("report.outputs"),
      // "·" is punctuation between already-translated names, not UI copy.
      value: outputs.length > 0 ? outputs.join(" · ") : t("report.outputsValues.none"),
    },
  ];

  return createPortal(
    // 273mm, not 275: @page leaves 11mm top and bottom of A4's 297mm, and the
    // 2mm it gives back is what stops a sub-millimetre rounding difference from
    // spilling a second, near-empty sheet. overflow-hidden is the backstop for
    // the case that still manages it — clip, never reflow onto page two.
    <article className="report-doc h-[273mm] w-full overflow-hidden font-body text-[9pt] leading-snug">
      <header className="flex items-end justify-between gap-6 border-b-2 border-[color:var(--report-ink)] pb-2">
        <div>
          <p className="font-display text-[15pt] leading-none font-black uppercase tracking-tight">
            {t("common.appName")}
          </p>
          <h1 className="mt-1 font-display text-[10pt] uppercase tracking-wider">
            {t("report.title")}
          </h1>
          <p className="text-[7.5pt] text-[color:var(--report-ink-soft)]">
            {t("report.subtitle")}
          </p>
        </div>
        <ReportMetaList entries={identity} className="shrink-0" />
      </header>

      <ReportVerdict
        classCode={analysis.class_code}
        confidence={analysis.confidence}
        className="mt-3"
      />

      {/* Sized by its content, NOT stretched to fill. Stretching it opened a
          hole in the middle of the page whenever the photograph was short —
          content, then a void, then the recommendation. Letting the bands stack
          from the top and pinning only the footer collects every millimetre of
          slack into one bottom margin, which reads as a document that ended. */}
      <div className="mt-3 grid grid-cols-[1.45fr_1fr] gap-4">
        {/* min-w-0 on both columns: a grid track's default `auto` minimum is the
            content's intrinsic width, so one wide photograph or one long Arabic
            class name would push the other column off the sheet. */}
        <ReportEvidence
          imageSrc={imageSrc}
          restoredSrc={restoredSrc}
          detections={analysis.detections}
          classCode={analysis.class_code}
          confidence={analysis.confidence}
          className="min-w-0"
        />
        <div className="min-w-0">
          <ReportScores scores={analysis.scores} />
          <ReportRegions detections={analysis.detections} className="mt-4" />
          <ReportLegend activeCode={analysis.class_code} className="mt-4" />
        </div>
      </div>

      <ReportRecommendation classCode={analysis.class_code} className="mt-3" />

      <footer className="mt-auto flex items-end justify-between gap-6 border-t-2 border-[color:var(--report-ink)] pt-2">
        <div className="text-[7.5pt]">
          <p className="text-[color:var(--report-ink-soft)]">{t("report.disclaimer")}</p>
          <p className="mt-0.5">{t("report.generatedBy")}</p>
        </div>
        <ReportMetaList entries={provenance} className="shrink-0" />
      </footer>
    </article>,
    document.body,
  );
}
