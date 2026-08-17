import assert from "node:assert/strict";
import { test } from "node:test";

import { attachArtifactWithOperations } from "../lib/supabase/artifactAttachment.mts";

const path = "user/analysis_repaired.png";
const blob = new Blob(["png"], { type: "image/png" });

function createOperations(overrides = {}) {
  const calls = [];
  return {
    calls,
    operations: {
      readCurrentPath: async () => {
        calls.push("read");
        return { ok: true, path: null };
      },
      upload: async () => {
        calls.push("upload");
        return true;
      },
      updatePath: async () => {
        calls.push("update");
        return true;
      },
      remove: async (removedPath) => {
        calls.push(["remove", removedPath]);
      },
      ...overrides,
    },
  };
}

function attach(operations) {
  return attachArtifactWithOperations({
    path,
    blob,
    contentType: "image/png",
    operations,
  });
}

test("stops before upload when the analysis cannot be read", async () => {
  const { calls, operations } = createOperations({
    readCurrentPath: async () => {
      calls.push("read");
      return { ok: false };
    },
  });

  assert.deepEqual(await attach(operations), { ok: false, stage: "read" });
  assert.deepEqual(calls, ["read"]);
});

test("stops before updating when upload fails", async () => {
  const { calls, operations } = createOperations({
    upload: async () => {
      calls.push("upload");
      return false;
    },
  });

  assert.deepEqual(await attach(operations), { ok: false, stage: "upload" });
  assert.deepEqual(calls, ["read", "upload"]);
});

test("treats an update that returned no row as a failed update", async () => {
  const { calls, operations } = createOperations({
    updatePath: async () => {
      calls.push("update");
      return false;
    },
    remove: async (removedPath) => {
      calls.push(["remove", removedPath]);
      throw new Error("cleanup failed");
    },
  });

  assert.deepEqual(await attach(operations), { ok: false, stage: "update" });
  assert.deepEqual(calls, ["read", "upload", "update", ["remove", path]]);
});

test("removes a first attachment when updating its path fails", async () => {
  const { calls, operations } = createOperations({
    updatePath: async () => {
      calls.push("update");
      return false;
    },
  });

  await attach(operations);
  assert.deepEqual(calls.at(-1), ["remove", path]);
});

test("does not remove an already referenced path when its update fails", async () => {
  const { calls, operations } = createOperations({
    readCurrentPath: async () => {
      calls.push("read");
      return { ok: true, path };
    },
    updatePath: async () => {
      calls.push("update");
      return false;
    },
  });

  assert.deepEqual(await attach(operations), { ok: false, stage: "update" });
  assert.deepEqual(calls, ["read", "upload", "update"]);
});

test("returns the deterministic path after uploading and updating", async () => {
  const { calls, operations } = createOperations();

  assert.deepEqual(await attach(operations), { ok: true, path });
  assert.deepEqual(calls, ["read", "upload", "update"]);
});
