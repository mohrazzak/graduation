"use client";
// The photo + Grad-CAM overlay pattern shared by the analyze flow and the
// history detail modal: heatmap fades in over the image at 45% opacity.
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import type { ReactNode } from "react";

export interface ImageWithHeatmapProps {
  src: string;
  alt: string;
  /** data: URL (analyze) or signed URL (history); null hides the overlay slot. */
  heatmapSrc: string | null;
  heatmapAlt: string;
  heatmapVisible: boolean;
  /** Extra layers positioned over the image (e.g. the scan overlay). */
  children?: ReactNode;
  className?: string;
}

// Spec section 9: the heatmap overlays the photo at 45% opacity.
const HEATMAP_OPACITY = 0.45;

export function ImageWithHeatmap({
  src,
  alt,
  heatmapSrc,
  heatmapAlt,
  heatmapVisible,
  children,
  className,
}: ImageWithHeatmapProps) {
  const reduced = useReducedMotion() ?? false;

  return (
    <figure
      className={`relative overflow-hidden rounded border border-line bg-surface ${className ?? ""}`}
    >
      {/* Plain <img>: blob object URLs and short-lived signed URLs gain nothing
          from next/image optimization. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt={alt} className="block w-full" />
      <AnimatePresence>
        {heatmapVisible && heatmapSrc !== null ? (
          <motion.img
            key="heatmap"
            src={heatmapSrc}
            alt={heatmapAlt}
            initial={reduced ? false : { opacity: 0 }}
            animate={{ opacity: HEATMAP_OPACITY }}
            exit={{ opacity: 0 }}
            transition={{ duration: reduced ? 0 : 0.2 }}
            className="absolute inset-0 h-full w-full"
          />
        ) : null}
      </AnimatePresence>
      {children}
    </figure>
  );
}
