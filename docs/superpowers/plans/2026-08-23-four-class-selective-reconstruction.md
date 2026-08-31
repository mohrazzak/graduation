# Four-Class Selective Reconstruction Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship Raed's truthful four-class detector, selective masked 2D restoration, backend-measured job timing, and explicit before/after 3D comparison without disrupting the active development servers.

**Architecture:** Introduce a four-class detection domain and Raed adapter at the API boundary, version persisted assessments rather than mapping old data, split mask preparation from restoration, and extend the existing polled-job contract with monotonic stage timing. The web consumes those contracts through centralized libraries, provides an accessible canvas mask editor, and owns two independent 3D runs and persistence paths.

**Tech Stack:** FastAPI, Pydantic, Pillow, Ultralytics YOLO, pytest, Ruff, Next.js App Router, TypeScript strict, React canvas APIs, next-intl, Supabase, Node test runner, ESLint.

**Spec:** `docs/superpowers/specs/2026-08-23-four-class-selective-reconstruction-design.md`

## Global Constraints

- Active damage codes are exactly `ND`, `SMD`, `HVD`, `TD` in severity order.
- Raed's public model id remains `raed`; display name is `Trained Model`.
- Default confidence threshold is `0.25`; no retained boxes returns `no_detection`, never `ND`.
- Detector scores are maximum observed confidences, never normalized probabilities.
- Legacy `NC` / `PC` / `GC` rows are preserved as `phi3`; new rows are `raed4`.
- Pixels outside the submitted 2D repair mask must be byte-for-byte sourced from the original decoded RGB image.
- Before and after 3D jobs are explicit, independent, and never auto-started.
- Timings use backend monotonic clocks; the browser does not invent final durations.
- English and Arabic contracts remain in parity; RTL uses logical Tailwind properties only.
- Preserve legacy model source and unrelated working-tree changes.
- Do not replace the active `:3000` or `:8000` processes until isolated verification passes.

---

### Task 1: Four-class detection domain and Raed adapter

**Files:**
- Create: `api/predict/damage_classes.py`
- Modify: `api/predict/interface.py`
- Replace placeholder behavior: `api/predict/backends/raed.py`
- Create: `api/tests/test_damage_classes.py`
- Modify: `api/tests/test_raed_backend.py`

**Interfaces:**
- Produces `DamageCode = Literal["ND", "SMD", "HVD", "TD"]`.
- Produces `Detection(class_code, confidence, box)` and `Prediction(class_code, confidence, scores, detections)`.
- Produces `aggregate_detections(detections) -> Prediction` and `NoDetectionError`.

- [ ] **Step 1: Write failing domain tests** for exact model-name mapping, normalized box validation, maximum score per class, most-severe aggregation, and no detections.

```python
def test_most_severe_detection_wins() -> None:
    prediction = aggregate_detections([
        Detection("SMD", 0.91, Box(0.1, 0.1, 0.4, 0.4)),
        Detection("TD", 0.62, Box(0.2, 0.2, 0.8, 0.8)),
    ])
    assert prediction.class_code == "TD"
    assert prediction.confidence == pytest.approx(0.62)
```

- [ ] **Step 2: Run red tests:** `cd api && .venv/bin/pytest -q tests/test_damage_classes.py tests/test_raed_backend.py` and confirm failures are missing four-class types/adapter behavior.
- [ ] **Step 3: Implement the domain and adapter.** Load `RAED_WEIGHTS_PATH` with Ultralytics, decode bytes using Pillow, call the detector with `conf=float(os.getenv("RAED_CONFIDENCE_THRESHOLD", "0.25"))`, normalize `xyxy` against image dimensions, and aggregate retained boxes.
- [ ] **Step 4: Run green tests:** the focused command passes.
- [ ] **Step 5: Commit:** `git add api/predict api/tests/test_damage_classes.py api/tests/test_raed_backend.py && git commit -m "feat(api): integrate Raed four-class detector"`.

### Task 2: Four-class API and Raed-only roster

**Files:**
- Modify: `api/schemas.py`
- Modify: `api/main.py`
- Modify: `api/predict/registry.py`
- Modify: `api/tests/test_api.py`
- Modify: `api/tests/test_registry.py`
- Modify: `api/tests/test_models_route.py`
- Modify: `.env.example`
- Modify: `api/.env.example`

**Interfaces:**
- `/predict` returns `class_code`, `confidence`, `scores`, `detections`, and `model`.
- `NoDetectionError` maps to HTTP 422 detail `no_detection`.
- `/models` exposes `raed` by default; mock is four-class for tests, while legacy backend files remain present.

- [ ] **Step 1: Write failing route/roster tests** asserting the exact JSON keys, stable `422`, normalized boxes, Raed display name, and absence of legacy models from the default roster.
- [ ] **Step 2: Run red tests:** `cd api && ENABLED_MODELS=raed .venv/bin/pytest -q tests/test_api.py tests/test_registry.py tests/test_models_route.py`.
- [ ] **Step 3: Implement schemas, exception mapping, roster defaults, and a deterministic four-class mock.** Keep legacy imports available only through explicit internal compatibility helpers, not the active roster.
- [ ] **Step 4: Add documented `RAED_WEIGHTS_PATH` and `RAED_CONFIDENCE_THRESHOLD=0.25` examples without committing real credentials or weights.**
- [ ] **Step 5: Run focused tests and Ruff:** `.venv/bin/pytest -q tests/test_api.py tests/test_registry.py tests/test_models_route.py && .venv/bin/ruff check predict schemas.py main.py tests`.
- [ ] **Step 6: Commit:** `git commit -am "feat(api): expose Raed four-class prediction contract"`.

### Task 3: Backend stage timing protocol

**Files:**
- Modify: `api/jobs/store.py`
- Modify: `api/tests/test_job_store.py`
- Modify: `api/tests/test_jobs.py`

**Interfaces:**
- `JobStore(clock: Callable[[], float] = time.monotonic)` supports deterministic tests.
- `Job.to_status(now)` includes `timing.elapsed_ms` and ordered `timing.stages` entries with `key`, `status`, and `elapsed_ms`.

- [ ] **Step 1: Write failing clock-controlled tests** for queued elapsed time, transition closure, live active time, finish, and fail.

```python
clock = FakeClock()
store = JobStore(clock=clock)
job = store.create("repair", 2)
store.start_stage(job.id, "preparing", 1)
clock.advance(1.25)
assert store.status(job.id)["timing"]["stages"][0]["elapsed_ms"] == 1250
```

- [ ] **Step 2: Run red test:** `.venv/bin/pytest -q tests/test_job_store.py tests/test_jobs.py`.
- [ ] **Step 3: Implement timing records under the existing lock.** Close the prior stage exactly once on transitions and close the active stage on `finish`/`fail`.
- [ ] **Step 4: Run focused tests and Ruff.**
- [ ] **Step 5: Commit:** `git commit -am "feat(api): report measured job stage timings"`.

### Task 4: Mask preparation and selective repair API

**Files:**
- Create: `api/jobs/mask.py`
- Modify: `api/jobs/stages.py`
- Modify: `api/jobs/repair.py`
- Modify: `api/jobs/repair_providers.py`
- Modify: `api/jobs/local_controlnet.py`
- Modify: `api/repair/controlnet_core.py`
- Modify: `api/repair/controlnet_worker.py`
- Modify: `api/main.py`
- Modify: `api/tests/test_jobs.py`
- Modify: `api/tests/test_controlnet_core.py`
- Modify: `api/tests/test_local_controlnet.py`

**Interfaces:**
- `POST /jobs/mask` accepts `file` and produces raw `mask` plus `edges` artifacts.
- `POST /jobs/repair` accepts multipart `file`, `mask`, `class_code`, and optional `prompt`.
- `decode_selection_mask(mask_bytes, source_size) -> Image.Image` returns non-empty mode `L` mask or raises stable `invalid_mask`, `empty_mask`, or `mask_size_mismatch` reasons.
- `composite_generated(original, generated, selection)` preserves all unselected source pixels.

- [ ] **Step 1: Write failing route and pixel-identity tests.** Include malformed mask, empty mask, dimension mismatch, all-black protected pixels, and both provider paths.
- [ ] **Step 2: Run red tests:** `.venv/bin/pytest -q tests/test_jobs.py tests/test_controlnet_core.py tests/test_local_controlnet.py`.
- [ ] **Step 3: Implement the preparation job** using existing building segmentation and edge generation, returning a true grayscale mask rather than only the dimmed preview.
- [ ] **Step 4: Implement selective repair validation and provider plumbing.** Use the submitted mask as ControlNet inpainting input and always apply final source-preserving composition.
- [ ] **Step 5: Replace three-tier prompt guidance with exact four-class guidance.**
- [ ] **Step 6: Run focused tests and Ruff.**
- [ ] **Step 7: Commit:** `git add api && git commit -m "feat(api): add selective masked restoration"`.

### Task 5: Four-class web domain and analysis result

**Files:**
- Create: `web/lib/damage-classes.ts`
- Modify: `web/lib/types.ts`
- Modify: `web/lib/api.ts`
- Modify: `web/components/analyze/AnalyzeClient.tsx`
- Modify: `web/components/analyze/ResultPanel.tsx`
- Create: `web/components/analyze/DetectionOverlay.tsx`
- Modify: `web/components/analyze/ConfidenceBars.tsx`
- Modify: `web/components/ui/TierStrip.tsx`
- Modify: `web/tests/api-contract.test.mjs`
- Add focused Node tests under: `web/tests/`

**Interfaces:**
- `DAMAGE_CLASSES` is the only active four-class order/color/translation source.
- `Prediction` contains `class_code`, `confidence`, `scores`, and `detections`.
- `parsePrediction(raw)` rejects legacy or fabricated probability payloads.

- [ ] **Step 1: Write failing contract/domain tests** for four codes, scores, normalized boxes, unknown codes, and missing detections.
- [ ] **Step 2: Run red web tests:** `cd web && npm test`.
- [ ] **Step 3: Implement centralized types/parser and replace the active result UI.** Render severity `1/4..4/4`, detector-score bars, and a box overlay aligned to the uploaded image.
- [ ] **Step 4: Update model selection so Raed is selected and the legacy classifiers are not offered.**
- [ ] **Step 5: Run `npm test` and `npx tsc --noEmit`.**
- [ ] **Step 6: Commit:** `git add web && git commit -m "feat(web): render four-class Raed assessments"`.

### Task 6: Versioned Supabase persistence and legacy history

**Files:**
- Create: `supabase/migrations/2026-08-23-raed4.sql`
- Modify: `supabase/schema.sql`
- Modify: `web/lib/supabase/database.types.ts`
- Modify: `web/lib/supabase/queries.ts`
- Modify: `web/lib/types.ts`
- Modify: `web/components/history/AnalysisCard.tsx`
- Modify: `web/components/history/AnalysisModal.tsx`
- Modify: `web/components/history/HistoryStats.tsx`
- Add/modify persistence tests under: `web/tests/`

**Interfaces:**
- `Analysis = LegacyAnalysis | RaedAnalysis`, discriminated by `scale_version`.
- New inserts write `raed4`; existing rows become `phi3` without changing their assessment values.

- [ ] **Step 1: Write failing parsing/insertion tests** for both versions and malformed cross-version rows.
- [ ] **Step 2: Run red tests:** `cd web && npm test`.
- [ ] **Step 3: Write non-destructive SQL migration** adding columns/checks and backfilling `phi3`; do not delete rows.
- [ ] **Step 4: Implement discriminated parsing and version-specific history renderers.** Add a localized legacy label.
- [ ] **Step 5: Run web tests and TypeScript. Validate SQL examples and `git diff --check`.**
- [ ] **Step 6: Commit:** `git add supabase web && git commit -m "feat(history): preserve legacy and store four-class results"`.

### Task 7: Timed progress UI and editable mask canvas

**Files:**
- Modify: `web/lib/jobs.ts`
- Modify: `web/components/analyze/useJob.ts`
- Modify: `web/components/analyze/StageProgress.tsx`
- Replace: `web/components/analyze/StageCanvas.tsx`
- Create: `web/components/analyze/MaskEditor.tsx`
- Create: `web/lib/mask-editor.ts`
- Modify: `web/components/analyze/RepairPanel.tsx`
- Add tests under: `web/tests/job-timing.test.mjs`, `web/tests/mask-editor.test.mjs`

**Interfaces:**
- `JobTiming` and `StageTiming` mirror the API timing payload.
- `MaskEditor` accepts source/mask URLs and emits a black/white PNG `Blob`.
- `startMaskPreparation(file)` and `startRepair(file, mask, classCode, prompt)` are the only job-start boundaries.

- [ ] **Step 1: Write failing pure tests** for timing parsing/formatting, stroke interpolation, erase, bounded undo, reset, clear, and empty-mask detection.
- [ ] **Step 2: Run red tests:** `cd web && npm test`.
- [ ] **Step 3: Implement timing parsing and progress rendering.** Use backend values as authoritative and a local one-second display tick only while active.
- [ ] **Step 4: Implement accessible pointer/touch canvas controls** with device-pixel-ratio scaling and same-aspect PNG export.
- [ ] **Step 5: Refactor RepairPanel into preparation → edit → run phases.** Disable run on empty mask and keep original pixels protected by the backend contract.
- [ ] **Step 6: Run tests, TypeScript, and ESLint.**
- [ ] **Step 7: Commit:** `git add web && git commit -m "feat(web): add timed selective mask restoration"`.

### Task 8: Independent before/after 3D and persistence

**Files:**
- Refactor: `web/components/analyze/ModelPanel.tsx`
- Create: `web/components/analyze/ModelRunCard.tsx`
- Modify: `web/lib/artifactPersistence.mts`
- Modify: `web/lib/supabase/queries.ts`
- Modify: `web/components/history/AnalysisModal.tsx`
- Modify artifact tests under: `web/tests/`

**Interfaces:**
- Each `ModelRunCard` owns one `useJob` instance and source label.
- Persistence kinds are `model3d_before` and `model3d_after`; after maps to existing `model3d_path`, before maps to `model3d_before_path`.

- [ ] **Step 1: Write failing tests** proving runs do not auto-start, state cannot cross-wire, deterministic paths differ, and either model can persist independently.
- [ ] **Step 2: Run red tests:** `cd web && npm test`.
- [ ] **Step 3: Implement two explicit run cards.** Enable after only when a repaired job exists; show two viewers when available and stack them on small screens.
- [ ] **Step 4: Extend persistence and history signing/rendering for both paths.**
- [ ] **Step 5: Run tests, TypeScript, and ESLint.**
- [ ] **Step 6: Commit:** `git add web && git commit -m "feat(web): compare before and after 3D models"`.

### Task 9: English/Arabic copy and presentation parity

**Files:**
- Modify: `web/messages/en.json`
- Modify: `web/messages/ar.json`
- Modify: landing/how-it-works/report components that assume three tiers
- Add/modify locale parity tests under: `web/tests/`

**Interfaces:**
- All four class names, explanations, recommendations, errors, mask controls, timings, credit notices, legacy labels, and before/after labels exist in both locales.

- [ ] **Step 1: Write/extend locale parity tests** to require identical key structure and all active class keys.
- [ ] **Step 2: Run red tests.**
- [ ] **Step 3: Replace three-tier copy and render loops with `DAMAGE_CLASSES`; keep legacy copy namespaced for old history only.**
- [ ] **Step 4: Add precise Arabic/English copy for mask and timing states.**
- [ ] **Step 5: Run `npm test`, `npx tsc --noEmit`, and `npm run lint`.**
- [ ] **Step 6: Commit:** `git add web && git commit -m "feat(i18n): cover four-class reconstruction workflow"`.

### Task 10: Isolated full verification and runtime acceptance

**Files:**
- Modify only if a verification failure identifies a scoped defect.
- Update: `CLAUDE.md` after implementation state is proven.

**Interfaces:**
- The implementation is ready to replace the active servers only after every gate below passes.

- [ ] **Step 1: Run API gates:** `cd api && .venv/bin/pytest -q && .venv/bin/ruff check .`.
- [ ] **Step 2: Run web gates:** `cd web && npm test && npx tsc --noEmit && npm run lint && npm run build`.
- [ ] **Step 3: Run API on an unused port with `RAED_WEIGHTS_PATH` pointing to verified `best.pt`.** Verify `/health`, `/models`, CORS, a real `/predict`, no-detection behavior, mask preparation, and selective repair without spending external generation credit unless separately authorized.
- [ ] **Step 4: Run web on an unused port against the isolated API.** Check English and Arabic routes, four-class result, mask editing, timed stages, explicit 3D buttons, and legacy/new history rendering.
- [ ] **Step 5: Re-run `git diff --check`, inspect the complete diff, and confirm only scoped files changed.**
- [ ] **Step 6: Update `CLAUDE.md` with verified current behavior and remaining deployment steps, then commit:** `git commit -am "docs: record four-class reconstruction verification"`.
- [ ] **Step 7: Hand off the isolated branch and keep the original dev servers running unless the user explicitly requests the tested replacement.**
