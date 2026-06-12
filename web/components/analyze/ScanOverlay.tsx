"use client";
// Analyzing-state overlay: hazard scan line sweeps on a loop, the mono status
// line pulses, and a terminal-style log types out inspection steps (spec:
// premium-upgrade A3). Reduced motion: static text, full log, no sweep.
import { motion, useReducedMotion } from "framer-motion";
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Spinner } from "@/components/ui/Spinner";

const SWEEP_S = 1.2;
const LINE_MS = 380; // 5 lines ≈ 1.9s, inside the 2.4s scan floor

export function ScanOverlay() {
  const t = useTranslations("analyze");
  const reduced = useReducedMotion() ?? false;
  // t.raw: scanLog is an array message — typed access via cast, no `any` binding.
  const lines = t.raw("scanLog") as string[];
  const [shown, setShown] = useState(reduced ? lines.length : 1);

  useEffect(() => {
    if (reduced) return undefined;
    const id = window.setInterval(() => {
      setShown((count) => Math.min(count + 1, lines.length));
    }, LINE_MS);
    return () => window.clearInterval(id);
  }, [reduced, lines.length]);

  return (
    <div role="status" className="absolute inset-0 overflow-hidden bg-bg/40">
      <ul className="absolute start-3 top-3 space-y-1 font-mono text-[10px] leading-tight text-hazard/90">
        {lines.slice(0, shown).map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
      {reduced ? (
        <div className="flex h-full items-center justify-center gap-3">
          <Spinner />
          <span className="font-mono text-xs uppercase tracking-widest">{t("analyzing")}</span>
        </div>
      ) : (
        <>
          {/* translateY(-100%) keeps the trail behind (above) the line, so the
              sweep enters at the top edge and exits exactly at the bottom. */}
          <motion.div
            aria-hidden="true"
            className="absolute inset-x-0 -translate-y-full"
            initial={{ top: "0%" }}
            animate={{ top: "100%" }}
            transition={{ duration: SWEEP_S, repeat: Infinity, ease: "linear" }}
          >
            <div className="h-16 bg-linear-to-b from-transparent to-hazard/20" />
            <div className="h-0.5 bg-hazard shadow-[0_0_12px_var(--color-hazard)]" />
          </motion.div>
          <motion.span
            className="absolute inset-x-0 bottom-4 text-center font-mono text-xs uppercase tracking-widest text-hazard"
            animate={{ opacity: [1, 0.35, 1] }}
            transition={{ duration: SWEEP_S, repeat: Infinity, ease: "easeInOut" }}
          >
            {t("analyzing")}
          </motion.span>
        </>
      )}
    </div>
  );
}
