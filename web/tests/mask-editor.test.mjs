import assert from "node:assert/strict";
import test from "node:test";
import { interpolateStroke } from "../lib/mask-editor.ts";

test("stroke interpolation fills long pointer-event gaps", () => {
  const points = interpolateStroke({ x: 0, y: 0 }, { x: 100, y: 0 }, 10);
  assert.ok(points.length > 10);
  assert.deepEqual(points.at(0), { x: 0, y: 0 });
  assert.deepEqual(points.at(-1), { x: 100, y: 0 });
});
