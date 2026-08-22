"use client";

import { motion, useReducedMotion } from "framer-motion";
import { DAMAGE_CLASSES, type DamageCode } from "@/lib/damage-classes";

export function DamageStrip({
  active,
  className,
}: {
  active?: DamageCode;
  className?: string;
}) {
  const reduced = useReducedMotion() ?? false;
  return (
    <div className={`flex h-1.5 w-full gap-0.5 ${className ?? ""}`} aria-hidden="true">
      {DAMAGE_CLASSES.map((entry) => (
        <motion.span
          key={entry.code}
          className="flex-1"
          style={{ backgroundColor: entry.color }}
          initial={reduced ? false : { opacity: 0.15 }}
          animate={{ opacity: active && active !== entry.code ? 0.25 : 1 }}
          transition={{ duration: reduced ? 0 : 0.18 }}
        />
      ))}
    </div>
  );
}
