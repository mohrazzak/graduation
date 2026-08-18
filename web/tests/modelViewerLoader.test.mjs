import assert from "node:assert/strict";
import { test } from "node:test";

import { loadModelViewerModule } from "../lib/modelViewerLoader.mts";

const deferred = () => {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
};

test("lazy import failure invokes the latest error handler unless loading was cancelled", async () => {
  const failedImport = deferred();
  const calls = [];
  let currentOnError = () => calls.push("stale");
  loadModelViewerModule(
    () => failedImport.promise,
    () => calls.push("ready"),
    () => currentOnError(),
  );

  currentOnError = () => calls.push("current");
  failedImport.reject(new Error("module unavailable"));
  await assert.rejects(failedImport.promise, /module unavailable/);
  await Promise.resolve();
  assert.deepEqual(calls, ["current"]);

  const cancelledImport = deferred();
  const cancel = loadModelViewerModule(
    () => cancelledImport.promise,
    () => calls.push("cancelled-ready"),
    () => calls.push("cancelled-error"),
  );
  cancel();
  cancelledImport.reject(new Error("late rejection"));
  await assert.rejects(cancelledImport.promise, /late rejection/);
  await Promise.resolve();
  assert.deepEqual(calls, ["current"]);

  const cancelledSuccess = deferred();
  const cancelSuccess = loadModelViewerModule(
    () => cancelledSuccess.promise,
    () => calls.push("cancelled-ready"),
    () => calls.push("cancelled-error"),
  );
  cancelSuccess();
  cancelledSuccess.resolve();
  await cancelledSuccess.promise;
  await Promise.resolve();
  assert.deepEqual(calls, ["current"]);
});
