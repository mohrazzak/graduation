import assert from "node:assert/strict";
import { test } from "node:test";

import {
  SignedArtifactController,
  loadSignedArtifact,
} from "../lib/signedArtifact.mts";

const deferred = () => {
  let resolve;
  const promise = new Promise((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
};

test("returns a ready artifact for a successful signed URL", async () => {
  const artifact = await loadSignedArtifact("user/repair.png", async () => ({
    data: "https://storage.example/repair.png",
    error: null,
  }));

  assert.deepEqual(artifact, {
    status: "ready",
    url: "https://storage.example/repair.png",
  });
});

test("returns a failed artifact when signing does not produce a URL", async () => {
  const responses = [
    { data: null, error: "url_failed" },
    { data: null, error: null },
  ];

  for (const response of responses) {
    const artifact = await loadSignedArtifact("user/model.glb", async () => response);
    assert.deepEqual(artifact, { status: "failed" });
  }
});

test("returns a failed artifact when signing throws", async () => {
  const artifact = await loadSignedArtifact("user/model.glb", async () => {
    throw new Error("network unavailable");
  });

  assert.deepEqual(artifact, { status: "failed" });
});

test("only the latest signing generation can publish a result", async () => {
  const controller = new SignedArtifactController();
  const first = deferred();
  const second = deferred();
  const published = [];
  const publish = (artifact) => published.push(artifact);

  const firstLoad = controller.load("repaired:analysis-1", "old.png", () => first.promise, publish);
  const secondLoad = controller.load(
    "repaired:analysis-1",
    "new.png",
    () => second.promise,
    publish,
  );
  second.resolve({ data: "https://storage.example/new.png", error: null });
  await secondLoad;
  first.resolve({ data: null, error: "late failure" });
  await firstLoad;

  assert.deepEqual(published.at(-1), {
    status: "ready",
    url: "https://storage.example/new.png",
  });
});

test("a media load error stays failed until a fresh signing retry completes", async () => {
  const controller = new SignedArtifactController();
  const stale = deferred();
  const retry = deferred();
  const published = [];
  const publish = (artifact) => published.push(artifact);
  const key = "model:analysis-1";

  const staleLoad = controller.load(key, "model.glb", () => stale.promise, publish);
  controller.fail(key, publish);
  stale.resolve({ data: "https://storage.example/stale.glb", error: null });
  await staleLoad;
  assert.deepEqual(published.at(-1), { status: "failed" });

  const retryLoad = controller.load(key, "model.glb", () => retry.promise, publish);
  retry.resolve({ data: "https://storage.example/fresh.glb", error: null });
  await retryLoad;
  assert.deepEqual(published.at(-1), {
    status: "ready",
    url: "https://storage.example/fresh.glb",
  });
});
