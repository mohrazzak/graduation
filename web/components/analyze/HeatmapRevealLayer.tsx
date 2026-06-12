"use client";
// Heatmap overlay + reveal slider: a real range input sweeps the heatmap
// across the photo via clip-path (spec: premium-upgrade A2). Mounted only
// while the heatmap is visible, so reveal state resets to 100 on each show.
import { motion } from "framer-motion";
import { useState } from "react";
import { useTranslations } from "next-intl";

export interface HeatmapRevealLayerProps {
  src: string;
  alt: string;
  /** Overlay opacity, supplied by ImageWithHeatmap (spec section 9: 0.45). */
  opacity: number;
  fadeDuration: number;
}

export function HeatmapRevealLayer({ src, alt, opacity, fadeDuration }: HeatmapRevealLayerProps) {
  const t = useTranslations("analyze");
  const [reveal, setReveal] = useState(100);
  const hidden = 100 - reveal;
  // clip-path has no logical-property form; mirror the inset side by dir.
  // SSR-safe: at reveal=100 both branches compute to a no-op clip, so the
  // first client paint is identical either way (and the layer only ever
  // mounts client-side).
  const rtl = typeof document !== "undefined" && document.dir === "rtl";
  const clipPath = rtl ? `inset(0 0 0 ${hidden}%)` : `inset(0 ${hidden}% 0 0)`;

  return (
    <motion.div
      initial={fadeDuration === 0 ? false : { opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: fadeDuration }}
      className="absolute inset-0"
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- blob/signed URLs gain nothing from next/image */}
      <img src={src} alt={alt} style={{ opacity, clipPath }} className="h-full w-full" />
      {/* Divider at the clip boundary; the range input below owns interaction. */}
      {reveal > 0 && reveal < 100 ? (
        <span
          aria-hidden="true"
          style={{ insetInlineStart: `${reveal}%` }}
          className="pointer-events-none absolute inset-y-0 w-0.5 bg-hazard shadow-[0_0_8px_var(--color-hazard)]"
        />
      ) : null}
      <input
        type="range"
        min={0}
        max={100}
        value={reveal}
        aria-label={t("heatmapReveal")}
        onChange={(event) => setReveal(Number(event.target.value))}
        className="absolute inset-x-0 bottom-2 h-6 cursor-ew-resize appearance-none bg-transparent [&::-webkit-slider-runnable-track]:h-1 [&::-webkit-slider-runnable-track]:bg-line [&::-webkit-slider-thumb]:-mt-1.5 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:w-2 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-none [&::-webkit-slider-thumb]:bg-hazard [&::-moz-range-track]:h-1 [&::-moz-range-track]:bg-line [&::-moz-range-thumb]:h-4 [&::-moz-range-thumb]:w-2 [&::-moz-range-thumb]:rounded-none [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:bg-hazard"
      />
    </motion.div>
  );
}
