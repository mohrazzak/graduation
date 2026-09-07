import assert from "node:assert/strict";
import { test } from "node:test";
import {
  PRIMARY_EVALUATION,
  TRAINING_RUN,
  VALIDATION_LOSSES,
  bestEpochIndex,
} from "../lib/evaluation.ts";

// The published panel must never drift from the checkpoint it claims to
// describe. These constants are `train_metrics` as recorded inside
// raed_yolov8s_4class.pt — the only authority for what the served weights
// scored. The weights live outside the repo, so this test is where a typo or
// a hopeful edit gets caught instead of reaching a defense slide.
const CHECKPOINT_METRICS = {
  map50: 0.31478,
  map5095: 0.19023,
  precision: 0.34975,
  recall: 0.46396,
};
const CHECKPOINT_LOSSES = { box: 1.49777, cls: 2.25688, dfl: 2.14396 };

test("published metrics are exactly the checkpoint's recorded values", () => {
  for (const [key, expected] of Object.entries(CHECKPOINT_METRICS)) {
    const metric = PRIMARY_EVALUATION.metrics.find((entry) => entry.key === key);
    assert.ok(metric, `metric ${key} is not published`);
    assert.equal(metric.value, expected, `${key} drifted from the checkpoint`);
  }
  assert.equal(PRIMARY_EVALUATION.metrics.length, Object.keys(CHECKPOINT_METRICS).length);
});

test("exactly one metric is the headline", () => {
  const headline = PRIMARY_EVALUATION.metrics.filter((entry) => entry.headline);
  assert.equal(headline.length, 1);
  assert.equal(headline[0].key, "map50");
});

// The losses are DERIVED from the curve rather than retyped, so this asserts
// the curve itself carries the right row — the same guarantee, one step deeper.
test("validation losses are the curve's own best-epoch row", () => {
  assert.equal(VALIDATION_LOSSES.length, 3);
  for (const { key, value } of VALIDATION_LOSSES) {
    assert.equal(value, CHECKPOINT_LOSSES[key], `val/${key}_loss drifted`);
  }
});

test("every loss series covers the whole run, train and validation alike", () => {
  assert.equal(TRAINING_RUN.losses.length, 3);
  for (const series of TRAINING_RUN.losses) {
    assert.equal(series.train.length, TRAINING_RUN.epochs, `${series.key} train length`);
    assert.equal(series.validation.length, TRAINING_RUN.epochs, `${series.key} val length`);
    for (const value of [...series.train, ...series.validation]) {
      assert.ok(Number.isFinite(value) && value > 0, `${series.key} has a non-positive loss`);
    }
  }
  assert.equal(TRAINING_RUN.fitness.length, TRAINING_RUN.epochs);
});

// Ultralytics keeps the epoch with the best fitness, and for this run fitness
// IS mAP@50-95. If the shipped bestEpoch were not that argmax, the panel would
// be captioned with weights the trainer did not actually save.
test("the best epoch is the fitness argmax, which is why those weights ship", () => {
  const best = TRAINING_RUN.fitness.indexOf(Math.max(...TRAINING_RUN.fitness));
  assert.equal(bestEpochIndex(), best);
  assert.equal(TRAINING_RUN.bestEpoch, best + 1);
  assert.equal(TRAINING_RUN.fitness[best], CHECKPOINT_METRICS.map5095);
});

// The page used to publish "150 epochs", which was the configured ceiling and
// not what happened: early stopping ended the run at 55.
test("the run stopped early, so planned epochs are not the run's length", () => {
  assert.equal(TRAINING_RUN.plannedEpochs, 150);
  assert.equal(TRAINING_RUN.epochs, 55);
  assert.ok(TRAINING_RUN.epochs < TRAINING_RUN.plannedEpochs);
  assert.equal(TRAINING_RUN.epochs, TRAINING_RUN.bestEpoch + TRAINING_RUN.patience);
});
