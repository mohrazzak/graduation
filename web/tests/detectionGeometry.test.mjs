import assert from "node:assert/strict";
import test from "node:test";
import { LABEL_CLEARANCE, boxStyle, labelPlacement, normalizeBox } from "../lib/detectionGeometry.ts";

const box = (x1, y1, x2, y2) => ({ x1, y1, x2, y2 });

test("a box is positioned in PHYSICAL offsets, never logical ones", () => {
  const style = boxStyle(box(0.1, 0.2, 0.8, 0.9));
  // The repo rule is logical properties only, and it is right for chrome. A
  // detection box is not chrome: `inset-inline-start` resolves to `right`
  // under dir="rtl" while the <img> pixels do NOT mirror, so a logical offset
  // lands every box on the wrong side of the building in /ar. If this key ever
  // becomes insetInlineStart again, Arabic silently shows wrong boxes.
  assert.deepEqual(Object.keys(style).sort(), ["height", "left", "top", "width"]);
  assert.equal(style.left, "10%");
  assert.equal(style.top, "20%");
  assert.equal(style.width, "70%");
  assert.equal(style.height, "70%");
});

test("a stored row's out-of-range box cannot escape the photo", () => {
  // lib/supabase/analysisRow.ts type-checks these numbers but does NOT range
  // check them, so the history modal can be handed values /predict would have
  // rejected. Clamping here is what keeps the overlay inside the figure.
  const style = boxStyle(box(-0.5, -2, 1.5, 3));
  assert.equal(style.left, "0%");
  assert.equal(style.top, "0%");
  assert.equal(style.width, "100%");
  assert.equal(style.height, "100%");
});

test("a reversed box becomes a positive-size box, not a negative one", () => {
  const style = boxStyle(box(0.8, 0.9, 0.2, 0.4));
  assert.equal(style.left, "20%");
  assert.equal(style.top, "40%");
  assert.equal(style.width, "60%");
  assert.equal(style.height, "50%");
});

test("a label with no room above it is drawn inside the box", () => {
  // Not an edge case, it is the normal one: raed returns near-full-frame boxes
  // and ALL FOUR demo samples detect at y1 < 0.04 (ND 0.032, SMD 0.002,
  // HVD 0.000, TD 0.001), so a label translated above its box is clipped by the
  // figure's overflow-hidden.
  for (const y1 of [0, 0.001, 0.002, 0.032]) {
    assert.equal(labelPlacement(box(0.02, y1, 1, 1)), "inside", `y1=${y1}`);
  }
});

test("a label with room above it stays above the box", () => {
  // The second TD detection sits at y1=0.207 and has room to spare.
  assert.equal(labelPlacement(box(0.004, 0.207, 0.977, 0.996)), "above");
  assert.equal(labelPlacement(box(0.1, LABEL_CLEARANCE, 0.9, 0.9)), "above");
});

test("the clearance covers the shortest photo the layout can render", () => {
  // The chip is ~17px tall (10px text + 0.125rem padding top and bottom). The
  // photo is shortest at 390px, where a 4:3 frame is ~290px, so 17/290 = 0.059
  // is the worst case this threshold has to clear.
  assert.ok(LABEL_CLEARANCE > 17 / 290, "clearance must exceed the 390px worst case");
  assert.ok(LABEL_CLEARANCE < 0.15, "an over-wide clearance buries every label inside");
});

test("normalizeBox clamps a stored row's out-of-range box into the frame", () => {
  // The printed report tabulates these numbers. A raw row can carry -2 or 3
  // (type-checked, never range-checked), and a table stating "-200%" would
  // describe a box the overlay never drew.
  assert.deepEqual(normalizeBox(box(-0.5, -2, 1.5, 3)), box(0, 0, 1, 1));
});

test("normalizeBox orders a reversed box so width and height stay positive", () => {
  assert.deepEqual(normalizeBox(box(0.8, 0.9, 0.2, 0.4)), box(0.2, 0.4, 0.8, 0.9));
});

test("normalizeBox leaves an in-range, well-ordered box untouched", () => {
  // /predict already emits ordered, in-range boxes; normalizing must be a
  // no-op on them or the report would disagree with the API by a rounding.
  const stored = box(0.004, 0.207, 0.977, 0.996);
  assert.deepEqual(normalizeBox(stored), stored);
});

test("the overlay draws exactly the box the report prints", () => {
  // boxStyle and the report table must share ONE normalization, otherwise a
  // stored row can be drawn one way and printed another. Quarters are exact
  // in binary, so the comparison is about geometry, not the CSS formatter's
  // rounding.
  const raw = box(1.5, -0.25, 0.25, 0.75);
  const n = normalizeBox(raw);
  const style = boxStyle(raw);
  assert.equal(style.left, `${n.x1 * 100}%`);
  assert.equal(style.top, `${n.y1 * 100}%`);
  assert.equal(style.width, `${(n.x2 - n.x1) * 100}%`);
  assert.equal(style.height, `${(n.y2 - n.y1) * 100}%`);
});
