"use client";
// Analyzing-state overlay: a hazard scan line sweeps the photo top -> bottom on
// a 1.2s loop while the mono status line pulses. Reduced motion: static text.
import { motion, useReducedMotion } from "framer-motion";
import { useTranslations } from "next-intl";
import { Spinner } from "@/components/ui/Spinner";

const SWEEP_S = 1.2;

export function ScanOverlay() {
  const t = useTranslations("analyze");
  const reduced = useReducedMotion() ?? false;

  return (
    <div role="status" className="absolute inset-0 overflow-hidden bg-bg/40">
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
