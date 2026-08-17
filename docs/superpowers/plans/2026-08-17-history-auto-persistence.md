# History Auto-Persistence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Automatically persist each successful live repair and 3D result on the analysis row, then reopen that complete result from History with honest retryable loading states.

**Architecture:** A small framework-independent controller owns one artifact save lifecycle (`idle`, `waiting`, `blocked`, `saving`, `saved`, `failed`) and is exposed to React through a thin `useSyncExternalStore` hook. Artifact fetching validates status, body size, and media type before the existing Supabase data layer uploads it. Supabase attachment reads the owned row first and verifies the update returned one row; History represents signed artifact URLs as explicit loading/ready/failed states.

**Tech Stack:** Next.js 16, React 19, TypeScript 5, Supabase browser client, next-intl, Node 22 built-in test runner.

## Global Constraints

- Persist only successful live `repaired` PNG and `model` GLB job artifacts; never persist pre-generated fixtures.
- Keep exactly one deterministic repaired path and one deterministic GLB path per analysis; reruns replace the prior object.
- Do not persist masks, edges, diffs, prompts, stages, progress, or fixture provenance.
- Do not move persistence into FastAPI and do not add service-role credentials.
- Keep English and Arabic message leaf keys exactly aligned.
- Preserve the existing responsive History grid, one detail modal, RTL behavior, keyboard behavior, and reduced-motion behavior.
- Do not stage or commit `.gitignore`, `CLAUDE.md`, `.claude/`, `demo/`, `session-recover.yaml`, or the reference repository.

---

### Task 1: Framework-independent artifact save lifecycle

**Files:**
- Create: `web/lib/artifactPersistence.mts`
- Create: `web/tests/artifactPersistence.test.mjs`
- Modify: `web/package.json`

**Interfaces:**
- Consumes: `analysisId`, base analysis save status, job id, artifact kind, artifact name, and artifact-ready boolean.
- Produces: `ArtifactPersistenceController`, `ArtifactPersistenceSnapshot`, `fetchArtifactBlob(url, expectedContentType, fetchImpl)`, and the `npm test` command used by all later tasks.

- [ ] **Step 1: Add the Node test command and write failing lifecycle tests**

Add this script to `web/package.json`:

```json
"test": "node --test tests/*.test.mjs"
```

Create tests using `node:test` and `node:assert/strict`. A deferred fake saver must prove these exact transitions:

```ts
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
```

Also cover: the same target cannot start twice; success becomes `saved`; failure becomes `failed`; `retry()` starts exactly one new attempt; `ready: false` resets to `idle`; a different job starts a new save; a late completion from a replaced job is ignored; and `analysisStatus: "failed"` with no id becomes `blocked`.

- [ ] **Step 2: Write failing artifact-response validation tests**

Use Node's global `Response` and fake fetch functions to assert:

```ts
await assert.rejects(
  fetchArtifactBlob("/jobs/1/artifact/repaired", "image/png", async () =>
    new Response("missing", { status: 404, headers: { "content-type": "text/plain" } }),
  ),
);
```

Cover non-2xx, zero-byte, and wrong-media bodies. Prove `image/png; charset=binary` is normalized and accepted, and prove a non-empty `model/gltf-binary` response returns its blob.

- [ ] **Step 3: Run the tests and confirm RED**

Run: `cd web && npm test`

Expected: FAIL because `artifactPersistence.mts` and its exports do not exist.

- [ ] **Step 4: Implement the controller and response validator**

Use these public types:

```ts
export type AnalysisPersistenceStatus = "idle" | "saving" | "saved" | "failed";
export type ArtifactPersistenceStatus =
  | "idle"
  | "waiting"
  | "blocked"
  | "saving"
  | "saved"
  | "failed";

export interface ArtifactPersistenceTarget {
  analysisId: string | null;
  analysisStatus: AnalysisPersistenceStatus;
  jobId: string | null;
  ready: boolean;
  kind: "repaired" | "model3d";
}

export interface ArtifactPersistenceSnapshot {
  status: ArtifactPersistenceStatus;
  targetKey: string | null;
}
```

`ArtifactPersistenceController` accepts one async saver `(analysisId, kind, jobId) => Promise<boolean>`, exposes stable `subscribe`, `getSnapshot`, `update`, `retry`, and `dispose` methods, and uses a monotonically increasing generation to ignore stale completions. Do not emit a new immutable snapshot when neither `status` nor `targetKey` changed.

`fetchArtifactBlob()` must require `response.ok`, normalize `content-type` before `;`, require an exact expected type, await the body, and reject `blob.size === 0`.

- [ ] **Step 5: Run the tests and confirm GREEN**

Run: `cd web && npm test`

Expected: all lifecycle and response-validation tests pass.

- [ ] **Step 6: Commit the unit**

```bash
git add web/package.json web/lib/artifactPersistence.mts web/tests/artifactPersistence.test.mjs
git commit -m "feat(web): add generated artifact save lifecycle"
```

---

### Task 2: Verified Supabase artifact attachment

**Files:**
- Create: `web/lib/supabase/artifactAttachment.mts`
- Create: `web/tests/artifactAttachment.test.mjs`
- Create: `web/tests/storagePolicy.integration.test.mjs`
- Modify: `web/lib/supabase/queries.ts`
- Verify: `supabase/schema.sql`
- Verify: `supabase/migrations/2026-08-17-storage-update.sql`

**Interfaces:**
- Consumes: the existing `attachArtifact(analysisId, kind, blob)` public API and deterministic path conventions.
- Produces: a tested `attachArtifactWithOperations()` transaction-like workflow; `attachArtifact()` continues to return `Result<string>` to component callers.

- [ ] **Step 1: Write failing operation-level tests**

Define fake operations for `readCurrentPath`, `upload`, `updatePath`, and `remove`. Assert:

```ts
const result = await attachArtifactWithOperations({
  path: "user/analysis_repaired.png",
  blob: new Blob(["png"], { type: "image/png" }),
  contentType: "image/png",
  operations,
});
```

The tests must prove: an unreadable or missing analysis stops before upload; upload failure stops before update; update returning no row is failure; a first attachment removes the new object when update fails; replacing an object already referenced at the same path does not remove that path on update failure; and success returns the deterministic path.

- [ ] **Step 2: Run the focused test and confirm RED**

Run: `cd web && node --test tests/artifactAttachment.test.mjs`

Expected: FAIL because the operation workflow does not exist.

- [ ] **Step 3: Implement the minimal operation workflow**

Export these shapes from `artifactAttachment.mts`:

```ts
export interface ArtifactAttachmentOperations {
  readCurrentPath: () => Promise<{ ok: true; path: string | null } | { ok: false }>;
  upload: (path: string, blob: Blob, contentType: string) => Promise<boolean>;
  updatePath: (path: string) => Promise<boolean>;
  remove: (path: string) => Promise<void>;
}

export async function attachArtifactWithOperations(input: {
  path: string;
  blob: Blob;
  contentType: string;
  operations: ArtifactAttachmentOperations;
}): Promise<{ ok: true; path: string } | { ok: false; stage: "read" | "upload" | "update" }>;
```

On update failure, call `remove(path)` only when `currentPath !== path`; swallow cleanup failure while preserving the primary `update` failure.

- [ ] **Step 4: Adapt `attachArtifact()` to real Supabase operations**

Before upload, select `repaired_path, model3d_path` from `analyses`, filter by both `id` and authenticated `user_id`, and require `.maybeSingle()` to return a row. Upload with `upsert: true`. Update the correct typed column and use `.select("id").single()` so zero matched rows fail. Map read/update failures to `save_failed` and upload failures to `upload_failed`.

- [ ] **Step 5: Add a behavioral owner-policy integration test**

Create `storagePolicy.integration.test.mjs` using two independent Supabase clients and environment-provided owner/non-owner credentials. The owner uploads an object under `{owner_id}/...`, replaces it with `upsert: true`, downloads it, and asserts the second body is present. The non-owner then attempts to replace that exact owner path and must receive a Storage error. Always let the owner remove the temporary object in `finally`.

Require `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_TEST_OWNER_EMAIL`, `SUPABASE_TEST_OWNER_PASSWORD`, `SUPABASE_TEST_OTHER_EMAIL`, and `SUPABASE_TEST_OTHER_PASSWORD`. Mark this one integration test skipped when any are absent, with a precise reason; never hardcode credentials. Default `npm test` therefore reports the missing external proof honestly instead of replacing it with a source-text assertion.

- [ ] **Step 6: Run tests and static gates**

Run:

```bash
cd web && npm test
cd web && npx tsc --noEmit
cd web && npm run lint
```

Expected: all pass.

- [ ] **Step 7: Commit the unit**

```bash
git add web/lib/supabase/artifactAttachment.mts web/lib/supabase/queries.ts web/tests/artifactAttachment.test.mjs web/tests/storagePolicy.integration.test.mjs
git commit -m "fix(web): verify generated artifact attachment"
```

---

### Task 3: Automatic repair and 3D save UX

**Files:**
- Create: `web/components/analyze/useArtifactPersistence.ts`
- Create: `web/components/analyze/ArtifactPersistenceNote.tsx`
- Modify: `web/components/analyze/AnalyzeClient.tsx`
- Modify: `web/components/analyze/ServiceRail.tsx`
- Modify: `web/components/analyze/RepairPanel.tsx`
- Modify: `web/components/analyze/ModelPanel.tsx`
- Modify: `web/messages/en.json`
- Modify: `web/messages/ar.json`

**Interfaces:**
- Consumes: Task 1's controller and validator, `artifactUrl(jobId, name)`, Task 2's existing `attachArtifact()`, and `SaveStatus` from `useSaveAnalysis`.
- Produces: `useArtifactPersistence({ analysisId, analysisStatus, jobId, ready, kind })` returning `{ status, retry }`; both live panels render the same status component.

- [ ] **Step 1: Implement the thin React hook around the tested controller**

The hook's saver maps kinds as follows:

```ts
const spec = kind === "repaired"
  ? { artifactName: "repaired", mediaType: "image/png" }
  : { artifactName: "model", mediaType: "model/gltf-binary" };

const blob = await fetchArtifactBlob(
  artifactUrl(jobId, spec.artifactName),
  spec.mediaType,
);
const result = await attachArtifact(analysisId, kind, blob);
return result.error === null;
```

Create the controller once with `useRef`, subscribe with `useSyncExternalStore` (using the same stable snapshot getter for the server snapshot), call `controller.update()` from an effect when inputs change, and call `dispose()` on unmount. The hook must not persist anything while `ready` is false, so a fixture-only error cannot be saved.

- [ ] **Step 2: Build the shared translated status note**

`ArtifactPersistenceNote` renders nothing for `idle`, renders a polite `role="status"` message for `waiting`, `saving`, and `saved`, renders the base-save-blocked message for `blocked`, and renders a `role="alert"` message plus a `Retry save` ghost button for `failed`.

Add matching `artifactSave.waiting`, `artifactSave.saving`, `artifactSave.saved`, `artifactSave.blocked`, `artifactSave.failed`, and `artifactSave.retry` leaf keys to both locale files.

- [ ] **Step 3: Pass base analysis save state through the service rail**

Pass `saveStatus` from `AnalyzeClient` to `ServiceRail` as `analysisStatus`, then to both panels. Keep `analysisId` stable after the base-save toast is dismissed.

- [ ] **Step 4: Replace repair's fire-and-forget attachment**

Delete `attachedRef` and its silent promise chain. Call `useArtifactPersistence` with `kind: "repaired"`, `ready: repaired`, and render `ArtifactPersistenceNote` beside the completed before/after output. A rerun naturally sends `ready: false` while the new job starts, resetting the prior saved state.

- [ ] **Step 5: Replace the 3D Keep interaction with automatic persistence**

Delete `keepState`, `keep()`, the `Keep this model` button, and the large-file opt-in comments. Call the shared hook with `kind: "model3d"` and `ready: model`, then render the same status note after the live `ModelViewer`. Leave the fixture branch outside the hook and keep its pre-generated-example label.

- [ ] **Step 6: Run tests and frontend gates**

Run:

```bash
cd web && npm test
cd web && npx tsc --noEmit
cd web && npm run lint
cd web && npm run build
```

Expected: all pass, with no `model3d.keep` runtime references and exact EN/AR key parity.

- [ ] **Step 7: Commit the unit**

```bash
git add web/components/analyze web/messages/en.json web/messages/ar.json
git commit -m "feat(web): auto-save live repair and 3D results"
```

---

### Task 4: Honest History artifact loading and retry

**Files:**
- Create: `web/lib/signedArtifact.mts`
- Create: `web/tests/signedArtifact.test.mjs`
- Modify: `web/components/history/HistoryClient.tsx`
- Modify: `web/components/history/AnalysisModal.tsx`
- Modify: `web/messages/en.json`
- Modify: `web/messages/ar.json`

**Interfaces:**
- Consumes: `getSignedUrl(path)` and analyses with nullable `repaired_path` / `model3d_path`.
- Produces: `SignedArtifact = { status: "loading" } | { status: "ready"; url: string } | { status: "failed" }`, plus retry callbacks for repaired and model outputs.

- [ ] **Step 1: Write a failing signed-artifact state test**

Test a pure `loadSignedArtifact(path, signer)` helper. A successful signer result must become `{ status: "ready", url }`; any error, null data, or thrown exception must become `{ status: "failed" }` instead of remaining `loading`.

- [ ] **Step 2: Run the focused test and confirm RED**

Run: `cd web && node --test tests/signedArtifact.test.mjs`

Expected: FAIL because the helper does not exist.

- [ ] **Step 3: Implement the signed-artifact helper and History maps**

Use explicit `SignedArtifact` entries for repaired/model maps. Opening an analysis with a stored path and no cached entry first stores `{ status: "loading" }`, awaits `loadSignedArtifact`, then stores ready or failed. Cache successful URLs. Expose explicit retry callbacks that replace failed with loading and sign again.

- [ ] **Step 4: Render loading, failure, and retry in the modal**

Change generated-output props from nullable URL strings to `SignedArtifact` values. Render `history.artifactLoading` only for `loading`; render `history.artifactFailed` and a `history.artifactRetry` button for `failed`; render `BeforeAfter` or `ModelViewer` only for `ready`. If the original signed image is unavailable, the repaired section must say it cannot load instead of showing an endless loading message.

- [ ] **Step 5: Add locale keys and prove parity**

Add `history.artifactFailed` and `history.artifactRetry` to both locales. Run `node scripts/check-messages.mjs` from `web` and require success.

- [ ] **Step 6: Run the full frontend verification**

Run:

```bash
cd web && npm test
cd web && npx tsc --noEmit
cd web && npm run lint
cd web && npm run build
```

Expected: all pass.

- [ ] **Step 7: Commit the unit**

```bash
git add web/lib/signedArtifact.mts web/tests/signedArtifact.test.mjs web/components/history/HistoryClient.tsx web/components/history/AnalysisModal.tsx web/messages/en.json web/messages/ar.json
git commit -m "fix(web): expose retryable History artifact loading"
```

---

### Task 5: End-to-end verification and handoff

**Files:**
- Modify: `HANDOFF.md` (ignored recovery handoff only; do not commit)

**Interfaces:**
- Consumes: all earlier tasks and the existing local web/API/Supabase runtime.
- Produces: fresh verification evidence and a precise continuation note for Claude.

- [ ] **Step 1: Run repository gates**

Run:

```bash
cd api && ENABLED_MODELS=mock .venv/bin/pytest -q
cd api && .venv/bin/ruff check .
cd web && npm test
cd web && npx tsc --noEmit
cd web && npm run lint
cd web && npm run build
git diff --check
```

Expected: all pass; any model/backend skip must be reported exactly rather than described as a pass.

- [ ] **Step 2: Browser-verify the live behavior**

With the existing local API and web app, verify desktop and 390px mobile in English and Arabic:

1. a completed repair shows saving then saved without a manual button;
2. a completed live 3D result shows saving then saved and no Keep action;
3. a deliberately failed artifact request shows retry while leaving the live output visible;
4. History badges reflect stored paths;
5. opening the entry shows the full classification, recommendation, before/after, and GLB;
6. a deliberately failed signed URL shows failure plus retry rather than infinite loading; and
7. fixture-only quota fallback remains labelled and is not persisted.

If service quota prevents a fresh generated output, use request interception for the artifact bytes and Supabase calls while preserving the same UI/data-flow path; label that evidence as mocked browser verification, not production service proof.

- [ ] **Step 3: Review the final diff against the approved spec**

Check every requirement in `docs/superpowers/specs/2026-08-17-history-auto-persistence-design.md`, confirm no unrelated files are staged, and run `git status --short` plus `git log --oneline -8`.

- [ ] **Step 4: Update the ignored handoff**

Record commits, exact test outputs, current errors/skips, remaining external quota/funding constraints, and the next exact action. Keep `CLAUDE.md` unchanged unless its existing user-owned status text is now factually wrong.
