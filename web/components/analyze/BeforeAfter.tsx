"use client";
// Before/after wipe for the restoration result.
//
// Reuses HeatmapRevealLayer rather than writing a second slider: it is already
// a real keyboard-operable range input and already mirrors correctly in RTL.
// It expects a positioned parent and paints the overlay at full opacity here,
// since a restored building should read as an image, not a tint.
import { HeatmapRevealLayer } from "./HeatmapRevealLayer";

export interface BeforeAfterProps {
  baseSrc: string;
  overlaySrc: string;
  overlayAlt: string;
  onOverlayError?: () => void;
}

export function BeforeAfter({
  baseSrc,
  overlaySrc,
  overlayAlt,
  onOverlayError,
}: BeforeAfterProps) {
  return (
    <span className="relative block overflow-hidden rounded border border-line">
      {/* eslint-disable-next-line @next/next/no-img-element -- blob/API URLs */}
      <img src={baseSrc} alt="" className="block w-full" />
      <HeatmapRevealLayer
        src={overlaySrc}
        alt={overlayAlt}
        opacity={1}
        fadeDuration={0}
        onError={onOverlayError}
      />
    </span>
  );
}
