"use client";
// THE SCALE — the four-segment brand strip, reused as the navbar logo (sm) and
// as the result / history / hero strip (md). It is the only strip in the app;
// the three-segment TierStrip it replaced belonged to the retired scale.
import { motion, useReducedMotion } from "framer-motion";
import { DAMAGE_CLASSES, type DamageCode } from "@/lib/damage-classes";

export type DamageStripSize = "sm" | "md";

const TRACK_CLASSES: Record<DamageStripSize, string> = {
  sm: "h-[3px] w-8 gap-px",
  md: "h-1.5 w-full gap-0.5",
};

const DIMMED_OPACITY = 0.25;

export interface DamageStripProps {
  /** Highlights this segment and dims the rest. */
  active?: DamageCode;
  size?: DamageStripSize;
  className?: string;
}

export function DamageStrip({ active, size = "md", className }: DamageStripProps) {
  const reduced = useReducedMotion() ?? false;

  return (
    <div className={`flex ${TRACK_CLASSES[size]} ${className ?? ""}`} aria-hidden="true">
      {DAMAGE_CLASSES.map((entry) => (
        <motion.span
          key={entry.code}
          className="flex-1"
          style={{ backgroundColor: entry.color }}
          initial={reduced ? false : { opacity: 0.15 }}
          animate={{ opacity: active && active !== entry.code ? DIMMED_OPACITY : 1 }}
          transition={{ duration: reduced ? 0 : 0.18 }}
        />
      ))}
    </div>
  );
}
