"use client";
// ONE verdict drawn over the photo.
//
// Both active models are localization models — they emit a class per region,
// not per image — so the boxes stay as visible evidence that a building was
// found. What they do NOT carry is a per-box label: the image-level class is a
// single conservative most-severe-wins summary, and N differently-labelled
// boxes read as N competing answers to a question that has one.
import { useFormatter, useTranslations } from "next-intl";
import { getDamageClass, type DamageCode } from "@/lib/damage-classes";
import type { DamageDetection } from "@/lib/types";

export interface VerdictOverlayProps {
  detections: DamageDetection[];
  /** The aggregated whole-image class — never a single detection's class. */
  classCode: DamageCode;
  /** Confidence of the winning class, matching the result panel. */
  confidence: number;
}

export function VerdictOverlay({ detections, classCode, confidence }: VerdictOverlayProps) {
  const t = useTranslations();
  const format = useFormatter();
  const entry = getDamageClass(classCode);

  return (
    // aria-hidden: the verdict is already announced by the result panel, so
    // repeating it here would read it twice to a screen reader.
    <div className="pointer-events-none absolute inset-0" aria-hidden="true">
      {detections.map((detection, index) => (
        <span
          key={`${detection.class_code}-${index}`}
          className="absolute border-2"
          style={{
            insetInlineStart: `${detection.box.x1 * 100}%`,
            top: `${detection.box.y1 * 100}%`,
            width: `${(detection.box.x2 - detection.box.x1) * 100}%`,
            height: `${(detection.box.y2 - detection.box.y1) * 100}%`,
            borderColor: entry.color,
          }}
        />
      ))}
      <span
        className="absolute bottom-0 start-0 m-2 flex max-w-[calc(100%-1rem)] items-baseline gap-2 px-2 py-1 text-bg"
        style={{ backgroundColor: entry.color }}
      >
        <span className="font-mono text-[11px]">{entry.code}</span>
        <span className="truncate font-display text-xs font-extrabold uppercase tracking-tight">
          {t(`damageClasses.${entry.key}.name`)}
        </span>
        <span className="font-mono text-[11px]">
          {format.number(confidence, { style: "percent", maximumFractionDigits: 0 })}
        </span>
      </span>
    </div>
  );
}
