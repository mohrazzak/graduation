// The photographic evidence column of the printed report: the assessed photo
// under the same detection overlay the screen draws and, once one exists, the
// restored image beneath it. Every height here is in mm — the one-page fit
// depends on them.
import { useTranslations } from "next-intl";
import { DetectionOverlay } from "@/components/analyze/DetectionOverlay";
import { getDamageClass, type DamageCode } from "@/lib/damage-classes";
import type { DamageDetection } from "@/lib/types";

export interface ReportEvidenceProps {
  /** Signed photo URL; null when signing failed — the report still prints. */
  imageSrc: string | null;
  /** Signed restored PNG, only once it is ready; null renders no second figure. */
  restoredSrc: string | null;
  detections: DamageDetection[];
  classCode: DamageCode;
  confidence: number;
  className?: string;
}

// How big a printed photograph gets, measured, not guessed:
//
// `min-width` is what makes the photo fill its column. Without it a small
// source (the demo samples are 224px, the detector's own training crop) prints
// at its natural 59mm and leaves the column half empty — `max-width` alone can
// only shrink. `min-width` scales UP and the browser recomputes the height, so
// the aspect ratio survives.
//
// `max-height` is the guard for the other extreme, a phone portrait: at 9:16 a
// column-wide photo is ~160mm tall, and the band has ~170mm. The cap sits above
// that on purpose — the two constraints only ever fight for something taller
// than about 1:1.7, and when they do the browser resolves it by squashing the
// image. Better a 3% squash on a freak aspect than a photo clipped mid-frame.
//
// Both figures share the column when a restored image exists, so both shrink.
const PHOTO_MIN_MM = 100;
const PHOTO_MAX_H_MM = 158;
const PAIR_MIN_MM = 48;
const PAIR_MAX_H_MM = 92;

// THE SIZING RULE. DetectionOverlay is absolutely positioned against its
// container, so the container's box must be exactly the rendered image's box —
// a frame wider or taller than the image (letterboxing) would slide every
// detection off the building. So: an inline-block wrapper shrink-wraps a block
// <img> that scales with w-auto/h-auto under a max-w-full and an mm max-height.
// align-top is load-bearing too: an overflow-hidden inline-block sits its
// baseline on its bottom edge, so the figure's strut would otherwise print a
// descender gap under the frame.
const FRAME =
  "relative inline-block max-w-full overflow-hidden border border-[color:var(--report-rule)] align-top";
const IMAGE = "block h-auto w-auto max-w-full";
const CAPTION =
  "mb-[1mm] text-[7.5pt] leading-tight uppercase tracking-wider text-[color:var(--report-ink-soft)]";

export function ReportEvidence({
  imageSrc,
  restoredSrc,
  detections,
  classCode,
  confidence,
  className,
}: ReportEvidenceProps) {
  const t = useTranslations();
  const entry = getDamageClass(classCode);
  const paired = restoredSrc !== null;
  // Inline, not `min-w-[…mm]`: Tailwind's scanner cannot see a class assembled
  // from a constant, so a utility built from PHOTO_MIN_MM would silently not exist.
  const photoCap = paired
    ? { minWidth: `${PAIR_MIN_MM}mm`, maxHeight: `${PAIR_MAX_H_MM}mm` }
    : { minWidth: `${PHOTO_MIN_MM}mm`, maxHeight: `${PHOTO_MAX_H_MM}mm` };

  return (
    // Side by side once there are two: stacking a before and an after would
    // cost twice the page height to say the same thing, and a restoration is
    // read as a comparison anyway.
    <div className={`${paired ? "grid grid-cols-2 gap-[3mm]" : ""}${className ? ` ${className}` : ""}`}>
      <figure className="min-w-0">
        <figcaption className={CAPTION}>{t("report.evidence")}</figcaption>
        {imageSrc !== null ? (
          <div className={FRAME}>
            {/* Plain <img>: blob object URLs and short-lived signed URLs gain
                nothing from next/image optimization. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={imageSrc}
              alt={t(`damageClasses.${entry.key}.name`)}
              className={IMAGE}
              style={photoCap}
            />
            {/* The screen's overlay, not a reimplementation: it is what keeps
                the printed evidence identical to the analyze page, and its
                physical left/top geometry is what keeps the boxes on the
                building in /ar. */}
            <DetectionOverlay
              detections={detections}
              classCode={classCode}
              confidence={confidence}
            />
          </div>
        ) : (
          // Same fallback as AnalysisModal: the code in a bordered frame says
          // the photo could not be loaded, where an empty column would read as
          // a report that never had one.
          <div
            aria-hidden="true"
            className="flex aspect-[4/3] w-full items-center justify-center border border-[color:var(--report-rule)] font-mono text-[16pt] text-[color:var(--report-ink-soft)]"
            style={photoCap}
          >
            {entry.code}
          </div>
        )}
      </figure>
      {restoredSrc !== null ? (
        <figure className="min-w-0">
          <figcaption className={CAPTION}>{t("report.restored")}</figcaption>
          {/* No overlay here: the boxes describe the assessed photograph, not
              the generated one. */}
          <div className={FRAME}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={restoredSrc} alt={t("report.restored")} className={IMAGE} style={photoCap} />
          </div>
        </figure>
      ) : null}
    </div>
  );
}
