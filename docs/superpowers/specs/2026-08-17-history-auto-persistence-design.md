# History auto-persistence — complete analysis results

Date: 2026-08-17 · Status: approved

## 1. Goal

For every authenticated analysis whose base row saved successfully, each
successful live service result must survive the API job store's 30-minute TTL.
Reopening that analysis from History shows the durable assessment:

- classification, confidence, probabilities, damage estimate, model id, and
  recommendation;
- the latest successfully rebuilt image, when restoration ran; and
- the latest successfully generated 3D model, when reconstruction ran.

The user approved automatic 3D persistence. The existing **Keep this model**
step is removed.

## 2. Existing foundation

The current branch already has most of the required shape:

- `analyses.repaired_path` and `analyses.model3d_path` are nullable columns;
- `attachArtifact()` uploads either output to the private `analysis-images`
  bucket and updates the analysis row;
- restoration already attempts automatic attachment;
- History cards show `RESTORED` / `3D` badges; and
- the History detail modal renders the assessment, before/after comparison, and
  saved GLB through signed URLs.

The remaining mismatch is policy and reliability. A GLB is persisted only after
an explicit button press, restoration attachment errors are swallowed, storage
replacement lacks an UPDATE policy, artifact HTTP failures can be mistaken for
valid files, and a row update is not checked for an actual matched row.

## 3. Persistence policy

### 3.1 One latest result per analysis

Each analysis owns at most one durable artifact of each kind:

```text
{user_id}/{analysis_id}_repaired.png
{user_id}/{analysis_id}.glb
```

The first successful live job writes the artifact. A successful rerun replaces
the object at the same deterministic path. This keeps History equal to the
latest result without accumulating versions or changing the existing schema.

### 3.2 What saves automatically

- A successful repair job automatically saves its `repaired` PNG.
- A successful 3D job automatically saves its `model` GLB.
- Persistence waits for the base analysis row id if the service finishes before
  the classification auto-save completes.
- Only a real job artifact is persisted. A pre-generated quota fallback remains
  visibly labelled as an example and is never attached to the user's analysis.

Masks, edges, diffs, prompts, job stages, and progress are transient. They are
diagnostic or interactive pipeline state, not the final durable result requested
for History.

## 4. Frontend data flow

Both service panels use one shared artifact-persistence controller, keyed by
`analysisId + artifact kind + jobId`:

1. Wait until the job reports the required artifact and the base analysis has an
   id.
2. Fetch the artifact from FastAPI.
3. Require an HTTP success response, a non-empty body, and the expected media
   type (`image/png` or `model/gltf-binary`).
4. Call `attachArtifact()` with the authenticated analysis id.
5. Report `saving`, `saved`, or `failed` in the service panel.
6. On failure, retain the live result and offer a retry. Do not mark the job as
   persisted until the database confirms it.
7. A rerun resets persistence state and saves the new job's artifact over the
   previous result.

The controller must not fire twice for the same successful job. A failed attempt
remains retryable; an attempt flag may not be set permanently before success.

## 5. Supabase consistency and security

`attachArtifact()` remains the only generated-output persistence entry point.
It must:

1. authenticate the browser user;
2. read the owned analysis row and its current artifact path, proving the row is
   visible through RLS before uploading;
3. upload with `upsert: true` to the deterministic owner-scoped path;
4. update the correct path column and request the updated row id back, treating
   zero matched rows as failure; and
5. return a named failure instead of reporting success on an unmatched update.

When the first attachment uploads successfully but the row update fails, remove
that new object. When replacing an object whose row already points at the same
path, leave the object in place if the redundant row update fails: deleting it
would break the previously valid row reference.

Storage RLS gains an owner-scoped UPDATE policy using the same private bucket and
first-folder user-id check as SELECT, INSERT, and DELETE. The migration drops
that named policy if it exists before recreating it, so it is safe to reapply to
the live project; `schema.sql` contains the equivalent fresh-provision policy.

## 6. User experience

### Analyze

- Remove the explicit **Keep this model** action.
- After a live artifact appears, show translated status copy:
  **Saving to history**, **Saved to history**, or **Could not save to history**.
- A failed save exposes a **Retry save** action and never hides the generated
  repair/model the user can already see.
- If the base analysis itself failed to save, say the output cannot be attached
  until the assessment is saved; do not imply that History contains it.
- A rerun replaces the latest saved output and replays the save status.

### History

Keep the current responsive card grid and one scrollable detail modal. Do not
recreate the live service rail or job controls in History.

- Cards retain the `RESTORED` and `3D` badges for outputs that actually have a
  stored path.
- The detail modal retains the classification summary, recommendation,
  before/after comparison, and model viewer.
- Signed-artifact loading distinguishes `loading` from `failed`; failure shows a
  translated retry action instead of displaying “Loading” forever.
- The modal remains keyboard-operable, RTL-safe, and reduced-motion safe.

## 7. Error behavior

- FastAPI artifact 404/500: do not upload the response body; show retryable save
  failure.
- Empty or wrong-media artifact: do not upload; show retryable save failure.
- Supabase storage failure: keep the live result visible and allow retry.
- Missing/RLS-hidden analysis row: report save failure; never claim success.
- Signed URL failure in History: show retry, without hiding the rest of the
  assessment.
- Deleting an analysis continues to remove the original image, heatmap, repaired
  PNG, and GLB on a best-effort basis after removing the row.

## 8. Verification

Automated coverage must prove:

- a completed 3D job triggers persistence without a Keep action;
- a completed repair still triggers persistence automatically;
- persistence waits for a late `analysisId`;
- one job is not uploaded twice;
- a failed attempt can retry;
- starting a rerun resets the saved state and replaces the prior artifact;
- non-2xx, empty, and wrong-media responses are rejected;
- an unmatched analysis update is a failure; and
- the generated Storage UPDATE policy remains owner-scoped.

Project gates remain `npx tsc --noEmit`, `npm run lint`, and `npm run build`.
Browser verification covers successful auto-save, save failure + retry, History
badges, before/after, GLB loading, English/Arabic, and mobile/desktop layouts.

## 9. Non-goals

- artifact version history;
- persisting masks, edges, diffs, prompts, or job progress;
- saving pre-generated fixture output as a user's live result;
- moving Supabase persistence into FastAPI or adding service-role credentials;
- a new History detail route or shareable public link; and
- changing the 30-minute in-process job store.
