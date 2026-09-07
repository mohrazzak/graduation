"use client";
// The detector's evidence drawn over the photo: one box per detection in its
// own class colour and label, under ONE badge carrying the whole-image verdict.
//
// The two layers answer different questions and must be read together. A box is
// a per-REGION class — a detector emits one per thing it finds, so a single
// photo can legitimately carry an ND box beside a TD box. The badge is the
// image-level verdict: the class of the single highest-confidence box among
// exactly these, stated in the same words and to the same precision as the
// result panel. Boxes show what was found and where; the badge shows which of
// them the detector was surest of, and only the badge carries the class CODE.
import { useFormatter, useTranslations } from "next-intl";
import { getDamageClass, type DamageCode } from "@/lib/damage-classes";
import { boxStyle, labelPlacement } from "@/lib/detectionGeometry";
import type { DamageDetection } from "@/lib/types";

export interface DetectionOverlayProps {
  detections: DamageDetection[];
  /** The aggregated whole-image class — never a single detection's class. */
  classCode: DamageCode;
  /** Confidence of the winning class, matching the result panel. */
  confidence: number;
}

export function DetectionOverlay({ detections, classCode, confidence }: DetectionOverlayProps) {
  const t = useTranslations();
  const format = useFormatter();
  const verdict = getDamageClass(classCode);

  return (
    // aria-hidden: the result panel states the verdict and the analyze page
    // announces it through a live region. Per-region boxes have no reading
    // order worth speaking, and repeating the verdict would read it twice.
    <div className="pointer-events-none absolute inset-0" aria-hidden="true">
      {detections.map((detection, index) => {
        const entry = getDamageClass(detection.class_code);
        const above = labelPlacement(detection.box) === "above";
        return (
          <span
            key={`${detection.class_code}-${index}`}
            className="absolute border-2"
            style={{ ...boxStyle(detection.box), borderColor: entry.color }}
          >
            {/* Logical `start-0` is right here: the label is chrome attached to
                the box, so it should hug the reading-start edge in both
                directions. Only the box GEOMETRY is physical. */}
            <span
              className={`absolute start-0 top-0 max-w-full truncate px-1.5 py-0.5 font-mono text-[10px] text-bg ${
                above ? "-translate-y-full" : ""
              }`}
              style={{ backgroundColor: entry.color }}
            >
              {t(`damageClasses.${entry.key}.name`)} ·{" "}
              {format.number(detection.confidence, {
                style: "percent",
                maximumFractionDigits: 0,
              })}
            </span>
          </span>
        );
      })}
      <span
        className="absolute bottom-0 start-0 m-2 flex max-w-[calc(100%-1rem)] items-baseline gap-2 px-2 py-1 text-bg"
        style={{ backgroundColor: verdict.color }}
      >
        <span className="font-mono text-[11px]">{verdict.code}</span>
        <span className="truncate font-display text-xs font-extrabold uppercase tracking-tight">
          {t(`damageClasses.${verdict.key}.name`)}
        </span>
        {/* One fraction digit, like ResultPanel and AnalysisModal: the badge IS
            the panel's verdict, so it must not round to a different number. */}
        <span className="font-mono text-[11px]">
          {format.number(confidence, { style: "percent", maximumFractionDigits: 1 })}
        </span>
      </span>
    </div>
  );
}
