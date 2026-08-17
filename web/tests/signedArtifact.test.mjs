import assert from "node:assert/strict";
import { test } from "node:test";

import { loadSignedArtifact } from "../lib/signedArtifact.mts";

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
