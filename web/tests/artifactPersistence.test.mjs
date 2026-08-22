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

const settle = () => new Promise((resolve) => setImmediate(resolve));

const validPng = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64",
);

const jsonChunkType = 0x4e4f534a;
const binChunkType = 0x004e4942;

const paddedJson = (value) => {
  const bytes = Buffer.from(value, "utf8");
  const padding = (4 - (bytes.length % 4)) % 4;
  return Buffer.concat([bytes, Buffer.alloc(padding, 0x20)]);
};

const glbBody = (body) => {
  const bytes = Buffer.alloc(12 + body.length);
  bytes.write("glTF", 0, "ascii");
  bytes.writeUInt32LE(2, 4);
  bytes.writeUInt32LE(bytes.length, 8);
  body.copy(bytes, 12);
  return bytes;
};

const glbChunks = (...chunks) =>
  glbBody(
    Buffer.concat(
      chunks.map(([type, payload]) => {
        const chunk = Buffer.alloc(8 + payload.length);
        chunk.writeUInt32LE(payload.length, 0);
        chunk.writeUInt32LE(type, 4);
        payload.copy(chunk, 8);
        return chunk;
      }),
    ),
  );

const validGlb = glbChunks([
  jsonChunkType,
  paddedJson('{"asset":{"version":"2.0"}}'),
]);
const validGlbWithBin = glbChunks(
  [jsonChunkType, paddedJson('{"asset":{"version":"2.0"}}')],
  [binChunkType, Buffer.from([1, 2, 3, 0])],
);

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
  assert.deepEqual(saveCalls[0].slice(0, 3), ["analysis-1", "repaired", "repair-1"]);
  controller.dispose();
});

test("saves a ready artifact when the base-save notice was dismissed after retaining its id", () => {
  const saveCalls = [];
  const controller = new ArtifactPersistenceController(async (...args) => {
    saveCalls.push(args);
    return true;
  });

  controller.update(target({ analysisStatus: "idle" }));

  assert.equal(controller.getSnapshot().status, "saving");
  assert.deepEqual(saveCalls.map((call) => call.slice(0, 3)), [
    ["analysis-1", "repaired", "repair-1"],
  ]);
  controller.dispose();
});

test("before and after 3D targets remain independent", async () => {
  const calls = [];
  const controller = new ArtifactPersistenceController(async (...args) => {
    calls.push(args.slice(0, 3));
    return true;
  });
  controller.update(target({ kind: "model3d_before", jobId: "before-1" }));
  await settle();
  controller.update(target({ kind: "model3d_after", jobId: "after-1" }));
  await settle();
  assert.deepEqual(calls, [
    ["analysis-1", "model3d_before", "before-1"],
    ["analysis-1", "model3d_after", "after-1"],
  ]);
  controller.dispose();
});

test("replay-safe disposal ignores a Strict Mode effect replay and disposes on real unmount", async () => {
  const persistence = await import("../lib/artifactPersistence.mts");
  assert.equal(typeof persistence.createReplaySafeDisposal, "function");

  let disposals = 0;
  const lifecycle = persistence.createReplaySafeDisposal(() => disposals++);
  const replayCleanup = lifecycle.mount();
  replayCleanup();
  const mountedCleanup = lifecycle.mount();
  await new Promise((resolve) => queueMicrotask(resolve));
  assert.equal(disposals, 0);

  mountedCleanup();
  await new Promise((resolve) => queueMicrotask(resolve));
  assert.equal(disposals, 1);
});

test("real teardown lets an already-started persistence attempt finish", async () => {
  const pending = deferred();
  let completed = false;
  let saverSignal;
  const controller = new ArtifactPersistenceController(async (_id, _kind, _jobId, signal) => {
    saverSignal = signal;
    await pending.promise;
    completed = true;
    return true;
  });

  controller.update(target());
  assert.ok(saverSignal);

  controller.dispose();
  assert.equal(saverSignal.aborted, false);

  pending.resolve();
  await pending.promise;
  await settle();
  assert.equal(completed, true);
});

test("aborts obsolete work and serializes writers so the newest job finishes last", async () => {
  const first = deferred();
  const second = deferred();
  const calls = [];
  const writes = [];
  const controller = new ArtifactPersistenceController((...args) => {
    const [analysisId, kind, jobId, signal] = args;
    calls.push({ analysisId, kind, jobId, signal });
    const pending = jobId === "repair-1" ? first : second;
    return pending.promise.then(() => {
      writes.push(jobId);
      return true;
    });
  });

  controller.update(target());
  controller.update(target({ jobId: "repair-2" }));

  assert.equal(calls.length, 1);
  assert.equal(calls[0].signal.aborted, true);

  first.resolve();
  await first.promise;
  await settle();
  assert.equal(calls.length, 2);

  second.resolve();
  await second.promise;
  await settle();
  assert.deepEqual(writes, ["repair-1", "repair-2"]);
  assert.equal(controller.getSnapshot().status, "saved");
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
  assert.equal(saveCalls.length, 1);
  first.resolve(true);
  await first.promise;
  await settle();
  assert.equal(saveCalls.length, 2);
  assert.equal(controller.getSnapshot().status, "saving");

  second.resolve(true);
  await second.promise;
  await settle();
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
  await settle();
  assert.equal(calls, 2);
  assert.equal(controller.getSnapshot().status, "saving");
  attempts[1].resolve(true);
  await attempts[1].promise;
  await settle();
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
      new Response(validPng, {
        status: 200,
        headers: { "content-type": "image/png; charset=binary" },
      }),
  );
  assert.deepEqual(Buffer.from(await png.arrayBuffer()), validPng);

  const glb = await fetchArtifactBlob(
    "/jobs/1/artifact/model",
    "model/gltf-binary",
    async () =>
      new Response(validGlb, {
        status: 200,
        headers: { "content-type": "model/gltf-binary" },
      }),
  );
  assert.deepEqual(Buffer.from(await glb.arrayBuffer()), validGlb);
});

test("accepts the permitted GLB v2 JSON and optional BIN chunk order", async () => {
  for (const expected of [validGlb, validGlbWithBin]) {
    const glb = await fetchArtifactBlob(
      "/jobs/1/artifact/model",
      "model/gltf-binary",
      async () =>
        new Response(expected, {
          headers: { "content-type": "model/gltf-binary" },
        }),
    );
    assert.deepEqual(Buffer.from(await glb.arrayBuffer()), expected);
  }
});

test("rejects invalid GLB v2 container framing, JSON, and chunk ordering", async () => {
  const truncatedChunkHeader = Buffer.concat([
    validGlb,
    Buffer.from([0, 0, 0, 0]),
  ]);
  truncatedChunkHeader.writeUInt32LE(truncatedChunkHeader.length, 8);

  const invalidContainers = [
    ["header only", glbBody(Buffer.alloc(0))],
    ["truncated chunk header", truncatedChunkHeader],
    [
      "chunk data overrun",
      glbBody(Buffer.concat([
        Buffer.from([8, 0, 0, 0, 0x4a, 0x53, 0x4f, 0x4e]),
        Buffer.from("{}  ", "ascii"),
      ])),
    ],
    [
      "unaligned chunk",
      glbBody(Buffer.concat([
        Buffer.from([3, 0, 0, 0, 0x4a, 0x53, 0x4f, 0x4e]),
        Buffer.from("{} ", "ascii"),
      ])),
    ],
    ["invalid UTF-8 JSON", glbChunks([jsonChunkType, Buffer.from([0x22, 0xff, 0x22, 0x20])])],
    ["invalid JSON", glbChunks([jsonChunkType, Buffer.from("{]  ", "ascii")])],
    [
      "BIN before JSON",
      glbChunks(
        [binChunkType, Buffer.alloc(4)],
        [jsonChunkType, paddedJson("{}")],
      ),
    ],
    [
      "duplicate JSON",
      glbChunks(
        [jsonChunkType, paddedJson("{}")],
        [jsonChunkType, paddedJson("{}")],
      ),
    ],
    [
      "unknown chunk",
      glbChunks(
        [jsonChunkType, paddedJson("{}")],
        [0x12345678, Buffer.alloc(4)],
      ),
    ],
    [
      "extra BIN chunk",
      glbChunks(
        [jsonChunkType, paddedJson("{}")],
        [binChunkType, Buffer.alloc(4)],
        [binChunkType, Buffer.alloc(4)],
      ),
    ],
  ];

  for (const [description, bytes] of invalidContainers) {
    await assert.rejects(
      fetchArtifactBlob("/jobs/1/artifact/model", "model/gltf-binary", async () =>
        new Response(bytes, {
          headers: { "content-type": "model/gltf-binary" },
        }),
      ),
      /valid GLB/,
      description,
    );
  }
});

test("rejects corrupt artifacts even when their media type is correct", async () => {
  const corruptedPng = Buffer.from(validPng);
  corruptedPng[corruptedPng.length - 1] ^= 0xff;
  const wrongGlbLength = Buffer.from(validGlb);
  wrongGlbLength.writeUInt32LE(wrongGlbLength.length + 4, 8);

  await assert.rejects(
    fetchArtifactBlob("/jobs/1/artifact/repaired", "image/png", async () =>
      new Response(corruptedPng, {
        headers: { "content-type": "image/png" },
      }),
    ),
    /valid PNG/,
  );
  await assert.rejects(
    fetchArtifactBlob("/jobs/1/artifact/model", "model/gltf-binary", async () =>
      new Response(wrongGlbLength, {
        headers: { "content-type": "model/gltf-binary" },
      }),
    ),
    /valid GLB/,
  );
});

test("rejects a declared artifact size above its media limit before reading", async () => {
  await assert.rejects(
    fetchArtifactBlob("/jobs/1/artifact/model", "model/gltf-binary", async () =>
      new Response(validGlb, {
        headers: {
          "content-type": "model/gltf-binary",
          "content-length": String(32 * 1024 * 1024 + 1),
        },
      }),
    ),
    /too large/,
  );
});

test("rejects an actual artifact body above its media limit without a length header", async () => {
  await assert.rejects(
    fetchArtifactBlob("/jobs/1/artifact/repaired", "image/png", async () =>
      new Response(new Uint8Array(25 * 1024 * 1024 + 1), {
        headers: { "content-type": "image/png" },
      }),
    ),
    /too large/,
  );
});

test("passes the abort signal to artifact fetches", async () => {
  const abort = new AbortController();
  let receivedSignal;
  await fetchArtifactBlob(
    "/jobs/1/artifact/repaired",
    "image/png",
    async (_url, init) => {
      receivedSignal = init.signal;
      return new Response(validPng, {
        status: 200,
        headers: { "content-type": "image/png" },
      });
    },
    abort.signal,
  );
  assert.equal(receivedSignal, abort.signal);
});
