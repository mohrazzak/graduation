// Fixed decorative photo backdrop for content pages: grayscale, darkened far
// below the landing hero, flat scrim — content cards stay opaque bg-surface
// (spec: premium-upgrade design A1).
import Image from "next/image";

export interface PageBackdropProps {
  /** Path under public/, e.g. "/backgrounds/analyze.jpg". */
  src: string;
}

export function PageBackdrop({ src }: PageBackdropProps) {
  return (
    // -z-10 sits below the film grain (body::before, z -1) and all content,
    // but still above the propagated body background.
    <div aria-hidden="true" className="fixed inset-0 -z-10">
      <Image
        src={src}
        alt=""
        fill
        sizes="100vw"
        className="object-cover grayscale brightness-[0.18]"
      />
      {/* Flat scrim, NOT a gradient (master spec §8): guarantees AA contrast. */}
      <div className="absolute inset-0 bg-bg/85" />
    </div>
  );
}
