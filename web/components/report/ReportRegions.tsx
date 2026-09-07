// The per-region evidence table: the tabular counterpart of the boxes drawn on
// the photograph, one row per detection, capped so the page cannot grow.
import { useFormatter, useTranslations } from "next-intl";
import { getDamageClass } from "@/lib/damage-classes";
import { normalizeBox } from "@/lib/detectionGeometry";
import type { DamageDetection } from "@/lib/types";

export interface ReportRegionsProps {
  detections: DamageDetection[];
  className?: string;
}

// WHY a cap: the sheet is a fixed 273mm and every other band on it is
// fixed-height, so this table is the one thing that could push the
// recommendation and footer onto a second page — a detector is free to return
// twenty regions. Rows past the cap are COUNTED, never dropped in silence: an
// evidence table that quietly omits evidence is worse than one that says how
// much it left out.
const MAX_ROWS = 8;

export function ReportRegions({ detections, className }: ReportRegionsProps) {
  const t = useTranslations();
  const format = useFormatter();
  const rows = detections.slice(0, MAX_ROWS);
  const omitted = detections.length - rows.length;
  // The "%" lives in the column header, so a cell is four bare integers.
  const coordinate = (value: number): string =>
    format.number(value * 100, { maximumFractionDigits: 0 });

  return (
    <section className={className}>
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-[7.5pt] leading-tight uppercase tracking-wider text-[color:var(--report-ink-soft)]">
          {t("report.regions")}
        </h2>
        <span className="font-mono text-[7.5pt] leading-tight">
          {format.number(detections.length)}
        </span>
      </div>

      {detections.length === 0 ? (
        <p className="mt-[1.5mm] text-[8pt]">{t("report.noRegions")}</p>
      ) : (
        /* Fixed layout, not auto: under auto layout a nowrap cell's minimum
           width IS its full text, so `truncate` never fires and a long Arabic
           class name widens the table past the column instead. Fixed layout
           makes each cell's width definite, so the name shortens with an
           ellipsis and the row stays one line. Only the class column flexes. */
        <table className="mt-[1.5mm] w-full table-fixed border-collapse text-[7.5pt] leading-tight">
          <colgroup>
            <col />
            <col className="w-[11mm]" />
            <col className="w-[28mm]" />
          </colgroup>
          <thead>
            <tr className="border-b border-[color:var(--report-rule)] text-[color:var(--report-ink-soft)]">
              <th scope="col" className="pb-[0.5mm] text-start align-bottom font-normal">
                {t("report.columns.class")}
              </th>
              <th scope="col" className="ps-[1.5mm] pb-[0.5mm] text-end align-bottom font-normal">
                {t("report.columns.confidence")}
              </th>
              {/* Left free to wrap: under fixed layout a nowrap header would
                  spill past its cell, and the Arabic label is two lines wide. */}
              <th scope="col" className="ps-[1.5mm] pb-[0.5mm] text-end align-bottom font-normal">
                {t("report.columns.region")}
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((detection, index) => {
              const entry = getDamageClass(detection.class_code);
              // The box the overlay DREW, not the one the row stored — see
              // normalizeBox for why the two can differ.
              const { x1, y1, x2, y2 } = normalizeBox(detection.box);
              return (
                <tr
                  key={`${detection.class_code}-${index}`}
                  className="border-b border-[color:var(--report-rule)]"
                >
                  <td className="py-[0.5mm]">
                    <span className="flex items-center gap-[1.5mm]">
                      <span
                        aria-hidden="true"
                        className="h-[2mm] w-[2mm] shrink-0"
                        style={{ backgroundColor: entry.color }}
                      />
                      <span className="shrink-0 font-mono">{entry.code}</span>
                      <span className="min-w-0 truncate">
                        {t(`damageClasses.${entry.key}.name`)}
                      </span>
                    </span>
                  </td>
                  <td className="ps-[1.5mm] py-[0.5mm] text-end font-mono whitespace-nowrap">
                    {format.number(detection.confidence, {
                      style: "percent",
                      maximumFractionDigits: 1,
                    })}
                  </td>
                  <td className="ps-[1.5mm] py-[0.5mm] text-end font-mono whitespace-nowrap">
                    {coordinate(x1)}, {coordinate(y1)} · {coordinate(x2 - x1)} ×{" "}
                    {coordinate(y2 - y1)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      {omitted > 0 ? (
        <p className="mt-[1mm] text-[7pt] leading-tight text-[color:var(--report-ink-soft)]">
          {t("report.regionsMore", { count: omitted })}
        </p>
      ) : null}
    </section>
  );
}
