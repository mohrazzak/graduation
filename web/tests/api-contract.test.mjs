import assert from "node:assert/strict";
import test from "node:test";
import { DAMAGE_CLASSES, getDamageClass } from "../lib/damage-classes.ts";

const valid = {
  class_code: "HVD",
  confidence: 0.73,
  scores: { ND: 0, SMD: 0.82, HVD: 0.73, TD: 0 },
  detections: [
    { class_code: "HVD", confidence: 0.73, box: { x1: 0.1, y1: 0.2, x2: 0.8, y2: 0.9 } },
  ],
  model: { id: "raed", name: "YOLOv8s Building Damage Detector", accuracy: null },
};

test("active damage domain has the exact four-class order", () => {
  assert.deepEqual(DAMAGE_CLASSES.map(({ code }) => code), ["ND", "SMD", "HVD", "TD"]);
  assert.equal(getDamageClass(valid.class_code).code, "HVD");
});

test("unknown and legacy codes are rejected", () => {
  assert.throws(() => getDamageClass("GC"), /ND, SMD, HVD or TD/);
});
