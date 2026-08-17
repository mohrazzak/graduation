import assert from "node:assert/strict";
import { test } from "node:test";

import {
  ArtifactPersistenceController,
  fetchArtifactBlob,
} from "../lib/artifactPersistence.mts";

const target = (overrides = {}) => ({
  analysisId: "analysis-1",
  analysisStatus: "saved",
  jobId: "repair-1",
  ready: true,
  kind: "repaired",
  ...overrides,
});

const deferred = () => {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
};

test("waits for the base analysis id before saving a ready artifact", () => {
  const saveCalls = [];
  const controller = new ArtifactPersistenceController(async (...args) => {
    saveCalls.push(args);
    return true;
  });

  controller.update({
    analysisId: null,
    analysisStatus: "saving",
    jobId: "repair-1",
    ready: true,
    kind: "repaired",
  });
  assert.equal(controller.getSnapshot().status, "waiting");

  controller.update({
    analysisId: "analysis-1",
    analysisStatus: "saved",
    jobId: "repair-1",
    ready: true,
    kind: "repaired",
  });
  assert.equal(controller.getSnapshot().status, "saving");
  assert.equal(saveCalls.length, 1);
  assert.deepEqual(saveCalls[0], ["analysis-1", "repaired", "repair-1"]);
  controller.dispose();
});

test("does not start the same target twice and ignores a stale completion", async () => {
  const first = deferred();
  const second = deferred();
  const saveCalls = [];
  const controller = new ArtifactPersistenceController((...args) => {
    saveCalls.push(args);
    return saveCalls.length === 1 ? first.promise : second.promise;
  });

  controller.update(target());
  controller.update(target());
  assert.equal(saveCalls.length, 1);

  controller.update(target({ jobId: "repair-2" }));
  assert.equal(saveCalls.length, 2);
  assert.equal(controller.getSnapshot().status, "saving");

  first.resolve(true);
  await first.promise;
  assert.equal(controller.getSnapshot().status, "saving");

  second.resolve(true);
  await second.promise;
  assert.equal(controller.getSnapshot().status, "saved");
  controller.dispose();
});

test("reports saver success and failure, and retry starts one new attempt", async () => {
  const attempts = [deferred(), deferred()];
  let calls = 0;
  const controller = new ArtifactPersistenceController(() => attempts[calls++].promise);

  controller.update(target());
  attempts[0].resolve(false);
  await attempts[0].promise;
  assert.equal(controller.getSnapshot().status, "failed");

  controller.retry();
  controller.retry();
  assert.equal(calls, 2);
  assert.equal(controller.getSnapshot().status, "saving");
  attempts[1].resolve(true);
  await attempts[1].promise;
  assert.equal(controller.getSnapshot().status, "saved");
  controller.dispose();
});

test("resets to idle when the artifact is no longer ready", async () => {
  const pending = deferred();
  const controller = new ArtifactPersistenceController(() => pending.promise);
  controller.update(target());
  controller.update(target({ ready: false }));
  assert.deepEqual(controller.getSnapshot(), { status: "idle", targetKey: null });

  pending.resolve(true);
  await pending.promise;
  assert.deepEqual(controller.getSnapshot(), { status: "idle", targetKey: null });
  controller.dispose();
});

test("blocks artifact persistence when the base analysis failed without an id", () => {
  const saveCalls = [];
  const controller = new ArtifactPersistenceController(async (...args) => {
    saveCalls.push(args);
    return true;
  });

  controller.update(target({ analysisId: null, analysisStatus: "failed" }));
  assert.equal(controller.getSnapshot().status, "blocked");
  assert.equal(saveCalls.length, 0);
  controller.dispose();
});

test("does not emit a snapshot when neither status nor target changes", () => {
  const controller = new ArtifactPersistenceController(async () => true);
  let emissions = 0;
  controller.subscribe(() => emissions++);

  controller.update(target());
  controller.update(target());
  assert.equal(emissions, 1);
  controller.dispose();
});

test("rejects non-success artifact responses", async () => {
  await assert.rejects(
    fetchArtifactBlob("/jobs/1/artifact/repaired", "image/png", async () =>
      new Response("missing", {
        status: 404,
        headers: { "content-type": "text/plain" },
      }),
    ),
  );
});

test("rejects empty artifact bodies", async () => {
  await assert.rejects(
    fetchArtifactBlob("/jobs/1/artifact/repaired", "image/png", async () =>
      new Response(new Uint8Array(), {
        status: 200,
        headers: { "content-type": "image/png" },
      }),
    ),
  );
});

test("rejects artifact bodies with the wrong media type", async () => {
  await assert.rejects(
    fetchArtifactBlob("/jobs/1/artifact/repaired", "image/png", async () =>
      new Response("not a png", {
        status: 200,
        headers: { "content-type": "text/plain" },
      }),
    ),
  );
});

test("normalizes response media types and returns non-empty blobs", async () => {
  const png = await fetchArtifactBlob(
    "/jobs/1/artifact/repaired",
    "image/png",
    async () =>
      new Response(new Uint8Array([137, 80, 78, 71]), {
        status: 200,
        headers: { "content-type": "image/png; charset=binary" },
      }),
  );
  assert.equal(png.size, 4);

  const glb = await fetchArtifactBlob(
    "/jobs/1/artifact/model",
    "model/gltf-binary",
    async () =>
      new Response(new Uint8Array([1, 2, 3]), {
        status: 200,
        headers: { "content-type": "model/gltf-binary" },
      }),
  );
  assert.equal(glb.size, 3);
});
