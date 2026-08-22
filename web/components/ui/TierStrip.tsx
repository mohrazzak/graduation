"use client";
// THE SCALE — the 3-segment brand strip, reused as navbar logo (sm),
// result/history strip (md), and the animated landing hero scale (lg).
import { motion, useReducedMotion } from "framer-motion";
import { useEffect, useState } from "react";
import { DAMAGE_TIERS, type TierCode } from "@/lib/tiers";
import { DAMAGE_CLASSES, type DamageCode } from "@/lib/damage-classes";

export type TierStripSize = "sm" | "md" | "lg";

export interface TierStripProps {
  size: TierStripSize;
  /** Highlights this segment and dims the rest. */
  activeTier?: TierCode | DamageCode;
  /** lg hero entrance: segments light up NC -> GC in sequence (reduced motion: all lit). */
  animateIn?: boolean;
  /** Exposes the strip to assistive tech; decorative (aria-hidden) when omitted. */
  label?: string;
  className?: string;
}

const TRACK_CLASSES: Record<TierStripSize, string> = {
  sm: "h-[3px] w-8 gap-px",
  md: "h-1.5 w-full gap-0.5",
  lg: "h-3 w-full gap-1",
};

const STAGGER_S = 0.12;
const DIMMED_OPACITY = 0.25;

export function TierStrip({
  size,
  activeTier,
  animateIn = false,
  label,
  className,
}: TierStripProps) {
  const reduced = useReducedMotion() ?? false;
  const entries = activeTier && ["NC", "PC", "GC"].includes(activeTier)
    ? DAMAGE_TIERS
    : DAMAGE_CLASSES;
  const entrance = animateIn && !reduced;
  // Drop the entrance stagger once it has played so later activeTier changes
  // (hero caption cycling, result reveal) respond with a plain fast fade.
  const [entered, setEntered] = useState(!entrance);
  useEffect(() => {
    if (!entrance) return undefined;
    const id = window.setTimeout(
      () => setEntered(true),
      (entries.length * STAGGER_S + 0.25) * 1000,
    );
    return () => window.clearTimeout(id);
  }, [entrance, entries.length]);

  return (
    <div
      className={`flex ${TRACK_CLASSES[size]} ${className ?? ""}`}
      {...(label !== undefined
        ? { role: "img", "aria-label": label }
        : { "aria-hidden": true })}
    >
      {entries.map((tier, index) => {
        const isActive = activeTier === tier.code;
        const dimmed = activeTier !== undefined && !isActive;
        return (
          <motion.span
            key={tier.code}
            className="flex-1"
            style={{
              backgroundColor: tier.color,
              // Subtle self-colored glow marks the active segment.
              boxShadow: isActive ? `0 0 8px ${tier.color}` : undefined,
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
