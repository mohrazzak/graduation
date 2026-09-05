import assert from "node:assert/strict";
import test from "node:test";
import { DAMAGE_CLASSES, getDamageClass, strayScaleKeys } from "../lib/damage-classes.ts";

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

// --- the scale is a CLOSED set ------------------------------------------
// Iterating DAMAGE_CLASSES proves the four codes are PRESENT, not that nothing
// else is. strayScaleKeys is the shared guard both boundaries use — lib/apiContract.ts
// (the /predict body) and lib/supabase/analysisRow.ts (a stored row) — so a payload
// still on the retired NC/PC/GC scale is refused instead of being silently
// narrowed to four keys and rendered as a healthy four-class result.

test("the exact four-class key set has no stray keys", () => {
  assert.deepEqual(strayScaleKeys(Object.keys(valid.scores)), []);
  assert.deepEqual(strayScaleKeys(DAMAGE_CLASSES.map(({ code }) => code)), []);
});

test("retired three-tier keys are reported as stray", () => {
  assert.deepEqual(strayScaleKeys(["NC", "PC", "GC"]).sort(), ["GC", "NC", "PC"]);
  assert.deepEqual(strayScaleKeys([...Object.keys(valid.scores), "PC"]), ["PC"]);
});

test("six-level keys are reported as stray", () => {
  const sixLevel = ["0", "1", "2", "3", "4", "5"];
  assert.deepEqual(strayScaleKeys(sixLevel), sixLevel);
});

test("a fifth class cannot slip in unnoticed", () => {
  assert.deepEqual(strayScaleKeys([...DAMAGE_CLASSES.map((c) => c.code), "XD"]), ["XD"]);
});
