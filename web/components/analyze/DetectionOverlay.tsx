"use client";

import { useFormatter, useTranslations } from "next-intl";
import { getDamageClass } from "@/lib/damage-classes";
import type { DamageDetection } from "@/lib/types";

export function DetectionOverlay({ detections }: { detections: DamageDetection[] }) {
  const t = useTranslations();
  const format = useFormatter();
  return (
    <div className="pointer-events-none absolute inset-0" aria-hidden="true">
      {detections.map((detection, index) => {
        const entry = getDamageClass(detection.class_code);
        return (
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
          >
            <span
              className="absolute start-0 top-0 max-w-full -translate-y-full truncate px-1.5 py-0.5 font-mono text-[10px] text-bg"
              style={{ backgroundColor: entry.color }}
            >
              {t(`damageClasses.${entry.key}.name`)} · {format.number(detection.confidence, { style: "percent", maximumFractionDigits: 0 })}
            </span>
          </span>
        );
      })}
    </div>
  );
}
