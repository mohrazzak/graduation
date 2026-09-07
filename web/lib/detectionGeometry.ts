// Where a detection box and its label sit on the photo.
//
// Both rules below look like mistakes to a reader who does not know why they
// are there, so they live in one tested module rather than inline in the
// overlay: this is where "tidying" either of them back turns red.
import type { DetectionBox } from "./types";

/** A detection box as CSS, in PHYSICAL offsets. */
export interface BoxStyle {
  left: string;
  top: string;
  width: string;
  height: string;
}

/**
 * Minimum space above a box, as a fraction of image height, for its label to
 * clear the top of the figure.
 *
 * The chip is ~17px tall (10px text plus 0.125rem padding top and bottom). The
 * photo is shortest at a 390px viewport, where a 4:3 frame renders ~290px, so
 * 17/290 = 0.059 is the worst case; 0.08 clears it without burying labels that
 * had room.
 */
export const LABEL_CLEARANCE = 0.08;

const clamp = (value: number): number => Math.min(1, Math.max(0, value));

// Normalized coordinates are binary fractions: 0.1 * 100 is 10.000000000000002,
// which would ship as a CSS length with fifteen junk digits.
const percent = (value: number): string => `${Number((value * 100).toFixed(4))}%`;

/**
 * A stored box made safe to draw or print: clamped into the frame, corners ordered.
 *
 * Coordinates are clamped and ordered because `lib/supabase/analysisRow.ts`
 * type-checks a stored row's box without range-checking it: the history modal
 * can be handed values `/predict` itself would have rejected. This is the ONE
 * implementation — the overlay draws it and the printed report tabulates it,
 * so the numbers on paper are the box that was actually drawn, never the raw
 * row.
 */
export function normalizeBox(box: DetectionBox): DetectionBox {
  return {
    x1: clamp(Math.min(box.x1, box.x2)),
    y1: clamp(Math.min(box.y1, box.y2)),
    x2: clamp(Math.max(box.x1, box.x2)),
    y2: clamp(Math.max(box.y1, box.y2)),
  };
}

/**
 * Position a detection box over the photo.
 *
 * WHY physical `left`/`top` and not the repo's logical properties: those are
 * right for chrome, and a detection box is not chrome — it is a coordinate in
 * the image. Under `dir="rtl"` `inset-inline-start` resolves to `right` while
 * the `<img>` pixels do NOT mirror, so a logical offset puts every box on the
 * wrong side of the building in `/ar`. The verdict badge, which IS chrome,
 * keeps its logical offset and mirrors correctly.
 */
export function boxStyle(box: DetectionBox): BoxStyle {
  const { x1, y1, x2, y2 } = normalizeBox(box);
  return {
    left: percent(x1),
    top: percent(y1),
    width: percent(x2 - x1),
    height: percent(y2 - y1),
  };
}

/**
 * Draw a box's label above it, or inside its top edge.
 *
 * Not an edge case, it is the NORMAL one: `raed` returns near-full-frame boxes,
 * and all four demo samples detect at y1 < 0.04 (ND 0.032, SMD 0.002, HVD 0.000,
 * TD 0.001), so a label sitting above its box is clipped away entirely by the
 * figure's `overflow-hidden`.
 */
export function labelPlacement(box: DetectionBox): "above" | "inside" {
  return clamp(Math.min(box.y1, box.y2)) >= LABEL_CLEARANCE ? "above" : "inside";
}
