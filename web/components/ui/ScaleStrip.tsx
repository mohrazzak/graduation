"use client";
// THE SCALE — the 6-segment brand strip (spec section 8), reused as navbar logo (sm),
// result/history strip (md), and the animated landing hero scale (lg).
import { motion, useReducedMotion } from "framer-motion";
import { useEffect, useState } from "react";
import { DAMAGE_LEVELS, type DamageLevelId } from "@/lib/levels";

export type ScaleStripSize = "sm" | "md" | "lg";

export interface ScaleStripProps {
  size: ScaleStripSize;
  /** Highlights this segment and dims the rest. */
  activeLevel?: DamageLevelId;
  /** lg hero entrance: segments light up 0 -> 5 in sequence (reduced motion: all lit). */
  animateIn?: boolean;
  /** Exposes the strip to assistive tech; decorative (aria-hidden) when omitted. */
  label?: string;
  className?: string;
}

const TRACK_CLASSES: Record<ScaleStripSize, string> = {
  sm: "h-[3px] w-8 gap-px",
  md: "h-1.5 w-full gap-0.5",
  lg: "h-3 w-full gap-1",
};

const STAGGER_S = 0.12;
const DIMMED_OPACITY = 0.25;

export function ScaleStrip({
  size,
  activeLevel,
  animateIn = false,
  label,
  className,
}: ScaleStripProps) {
  const reduced = useReducedMotion() ?? false;
  const entrance = animateIn && !reduced;
  // Drop the entrance stagger once it has played so later activeLevel changes
  // (hero caption cycling, result reveal) respond with a plain fast fade.
  const [entered, setEntered] = useState(!entrance);
  useEffect(() => {
    if (!entrance) return undefined;
    const id = window.setTimeout(
      () => setEntered(true),
      (DAMAGE_LEVELS.length * STAGGER_S + 0.25) * 1000,
    );
    return () => window.clearTimeout(id);
  }, [entrance]);

  return (
    <div
      className={`flex ${TRACK_CLASSES[size]} ${className ?? ""}`}
      {...(label !== undefined
        ? { role: "img", "aria-label": label }
        : { "aria-hidden": true })}
    >
      {DAMAGE_LEVELS.map((level, index) => {
        const isActive = activeLevel === level.id;
        const dimmed = activeLevel !== undefined && !isActive;
        return (
          <motion.span
            key={level.id}
            className="flex-1"
            style={{
              backgroundColor: level.color,
              // Subtle self-colored glow marks the active segment.
              boxShadow: isActive ? `0 0 8px ${level.color}` : undefined,
            }}
            initial={entrance ? { opacity: 0.15 } : false}
            animate={{ opacity: dimmed ? DIMMED_OPACITY : 1 }}
            transition={
              reduced
                ? { duration: 0 }
                : entered
                  ? { duration: 0.18 }
                  : { delay: index * STAGGER_S, duration: 0.2 }
            }
          />
        );
      })}
    </div>
  );
}
