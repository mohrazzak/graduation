import assert from "node:assert/strict";
import { test } from "node:test";
import { curveScale, epochX, polylinePoints } from "../lib/curveGeometry.ts";

const BOX = { width: 200, height: 100, padY: 10 };

test("the scale spans every series it is given, not just the first", () => {
  assert.deepEqual(
    curveScale([
      [2, 3],
      [0.5, 9],
    ]),
    { min: 0.5, max: 9 },
  );
});

test("SVG y is inverted, so the largest loss draws at the top", () => {
  const points = polylinePoints([10, 0], { min: 0, max: 10 }, BOX).split(" ");
  assert.equal(points[0], "0,10");
  assert.equal(points[1], "200,90");
});

test("the curve spans the full plot width regardless of epoch count", () => {
  for (const n of [2, 7, 55]) {
    const values = Array.from({ length: n }, (_, i) => i);
    const points = polylinePoints(values, { min: 0, max: n - 1 }, BOX).split(" ");
    assert.equal(points.length, n);
    assert.ok(points[0].startsWith("0,"), `n=${n} starts at the left edge`);
    assert.ok(points[n - 1].startsWith("200,"), `n=${n} ends at the right edge`);
  }
});

// A loss that never moved would divide by zero and emit "NaN" into the DOM,
// which renders as an invisible-but-broken chart rather than an error.
test("a flat series draws down the middle instead of dividing by zero", () => {
  const points = polylinePoints([4, 4, 4], { min: 4, max: 4 }, BOX).split(" ");
  assert.deepEqual(points, ["0,50", "100,50", "200,50"]);
});

test("a single point cannot span a width, so it pins to the left edge", () => {
  assert.equal(polylinePoints([1], { min: 0, max: 2 }, BOX), "0,50");
});

test("epoch marks are 1-indexed and land on the plot edges", () => {
  assert.equal(epochX(1, 55, 200), 0);
  assert.equal(epochX(55, 55, 200), 200);
  assert.equal(epochX(28, 55, 200), 100);
});
