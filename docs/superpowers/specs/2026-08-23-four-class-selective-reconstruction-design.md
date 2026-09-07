# DamageScale Four-Class Selective Reconstruction Design

**Date:** 2026-08-23  
**Status:** Approved for implementation  
**Scope:** Raed-only four-class assessment, selective 2D restoration, measured job timings, and explicit before/after 3D reconstruction.

## 1. Goals

1. Make Raed's YOLOv8s detector the website's only default assessment model.
2. Replace the active three-tier collapse scale with the detector's four ordered damage classes:
   - `ND` — No Damage
   - `SMD` — Slight/Moderate Damage
   - `HVD` — Heavy/Very Heavy Damage
   - `TD` — Total Damage
3. Return truthful detector output: an overall severity verdict, confidence, and detected regions. Do not fabricate a normalized probability distribution from object detections.
4. Let the user start from an automatic building mask, then refine the exact 2D restoration region with brush and eraser controls.
5. Guarantee that pixels outside the submitted repair mask remain identical to the source image.
6. Report live and final backend-measured duration for every 2D and 3D stage.
7. Let the user explicitly generate and compare a 3D model before restoration and another after restoration. Never spend credits on both automatically.
8. Preserve old three-class history as clearly labelled legacy assessments.
9. Keep the currently running development servers untouched while implementation and validation happen in an isolated worktree.

## 2. Non-goals

- Retraining or recalibrating Raed's checkpoint.
- Converting detector confidence scores into class probabilities.
- Mapping legacy `NC` / `PC` / `GC` rows onto the new four classes.
- Making the in-process job store durable across API restarts or multiple replicas.
- Automatically purchasing or spending Tripo credits.
- Editing a 3D mesh with a 2D mask. The mask controls the 2D restored image; Tripo receives either the original or completed restored image.

## 3. Four-class assessment contract

### 3.1 Model identity

The public model id remains `raed` so saved references and routing stay stable. Its display name becomes **Trained Model**. `RAED_WEIGHTS_PATH` points to the verified `best.pt` checkpoint. The active roster defaults to `raed`; the old ResNet50 and YOLO11 classifiers remain in source for provenance but are not exposed by the four-class website.

### 3.2 Detector adapter

The adapter decodes the uploaded image, runs Ultralytics YOLO detection, and retains boxes at or above `RAED_CONFIDENCE_THRESHOLD` (default `0.25`). Model indices are mapped once at the backend boundary:

| Index | Code | Model label |
| --- | --- | --- |
| 0 | `ND` | No Damage |
| 1 | `SMD` | Slight/Moderate Damage |
| 2 | `HVD` | Heavy/Very Heavy Damage |
| 3 | `TD` | Total Damage |

The overall verdict is the class holding the single highest detector confidence among the retained boxes; that same confidence is the overall confidence. Equal confidence resolves to the more severe class.

> **Amended 2026-09-07.** As originally designed and approved, the verdict was the *most severe* retained class, chosen to be safety-conservative. The user changed it to highest-confidence-wins because a badge that disagreed with the tallest bar in the score panel read as a contradiction on screen. The accepted trade-off: a low-confidence total-damage region beside a high-confidence intact facade now reports the facade's class, and the per-region boxes are what carry the severe observation.

If no box passes the threshold, `/predict` returns HTTP `422` with detail key `no_detection`; it must never silently return `ND`.

### 3.3 Response shape

`POST /predict?model=raed` returns:

```json
{
  "class_code": "ND|SMD|HVD|TD",
  "confidence": 0.0,
  "scores": {"ND": 0.0, "SMD": 0.0, "HVD": 0.0, "TD": 0.0},
  "detections": [
    {
      "class_code": "SMD",
      "confidence": 0.82,
      "box": {"x1": 0.1, "y1": 0.2, "x2": 0.6, "y2": 0.8}
    }
  ],
  "model": {"id": "raed", "name": "Trained Model", "accuracy": null}
}
```

Coordinates are normalized to `0..1`. `scores` contains the maximum detected confidence per class and is labelled **detector score**, never probability. The old weighted `damage_percent` is removed from new results because detector scores are not a probability distribution.

The website presents the overall class, confidence, four severity segments, and detection overlay. It replaces the old probability bars and percentage gauge with detector-score bars and a `1/4` through `4/4` severity indicator.

## 4. Legacy history migration

The `analyses` table gains `scale_version`, new four-class result columns, and a second 3D path:

- `scale_version`: `phi3` or `raed4`
- `class_code`: nullable `ND|SMD|HVD|TD`
- `scores`: nullable JSON object keyed by the four codes
- `detections`: nullable JSON array
- `model3d_before_path`: nullable text
- existing `model3d_path` remains the after/restored model path

Existing rows are marked `phi3` and keep `tier`, `probabilities`, and `damage_percent`. New rows are `raed4` and use the new columns. Database checks require exactly the correct fields for each version. No rows are deleted or semantically remapped.

Frontend analysis types become a discriminated union. Legacy history cards and modals retain the three-class renderer with a visible **Legacy three-class assessment** label. New analyses use the four-class renderer. The active analyze flow creates only `raed4` rows.

## 5. Selective 2D restoration

### 5.1 Two-phase flow

The current one-shot repair job is split into preparation and restoration:

1. `POST /jobs/mask` accepts the source image and creates a preparation job.
2. The job generates a raw grayscale `mask` artifact plus the structural `edges` artifact.
3. The browser loads the source and raw mask into an editor.
4. The user refines the mask with Brush, Eraser, brush size, Undo, and Reset.
5. `POST /jobs/repair` accepts `file`, `mask`, `class_code`, and optional prompt.
6. The API validates that the mask is a real image, matches source dimensions after normalization, contains selected pixels, and does not exceed upload limits.
7. Both generation providers receive the selection. The final output is composited through the hard selection mask so every pixel outside it comes from the original source.

The preparation and restoration phases remain separate jobs. A server-side “paused job waiting for mask” is rejected because the current in-memory store cannot safely hold a long-lived interactive transaction across restarts.

### 5.2 Mask editor

The editor is a responsive canvas with source image, translucent hazard-colored selection overlay, and pointer/touch drawing. Controls are localized and keyboard accessible:

- Brush
- Eraser
- brush-size slider
- Undo
- Reset to automatic mask
- Clear
- Run selective restoration

The editor exports a same-aspect-ratio black/white PNG. White pixels are editable; black pixels are protected. Undo history is bounded to avoid unbounded browser memory. Empty masks disable submission with a clear instruction.

The existing read-only source/mask/edge display becomes the preparation preview; it does not pretend that unsupported edits are applied.

### 5.3 Provider behavior

Local ControlNet uses the submitted selection as its inpainting mask and derives control edges outside the selection. Gemini still receives the restoration prompt, but its returned image is composited with the original using the same selection, ensuring the outside region is unchanged even when the provider edits the full frame.

Class-specific restoration guidance is rewritten for the four classes. `ND` permits surface cleanup only; `SMD` repairs bounded damaged areas; `HVD` reconstructs major missing structural portions; `TD` is explicitly labelled conceptual reconstruction rather than an engineering repair plan.

## 6. Backend-measured timing contract

The job store records monotonic timestamps for job creation and each actual stage transition. Starting a new stage closes the previous stage. Finishing or failing closes the active stage.

Every `GET /jobs/{id}` response includes:

```json
{
  "status": "running",
  "stage": {"key": "generating", "index": 2, "total": 2},
  "timing": {
    "elapsed_ms": 12450,
    "stages": [
      {"key": "preparing", "status": "done", "elapsed_ms": 820},
      {"key": "generating", "status": "running", "elapsed_ms": 11630}
    ]
  }
}
```

The frontend initializes counters from backend `elapsed_ms` and advances the active value locally between polls. Final values always come from the backend. Durations use localized seconds/minutes and remain visible after success or failure. No fake percentages are shown.

Timings are operational job data and are not persisted to Supabase in this scope.

## 7. Before/after 3D reconstruction

The 3D panel owns two independent runs:

- **Before reconstruction:** sends the original uploaded photo.
- **After reconstruction:** sends the successful selective 2D restored image/job.

Each has its own explicit button, stage list, live/final timing, errors, viewer, download, and retry. The after button stays disabled until restoration succeeds. Each click clearly states that it starts a separate credit-consuming Tripo task.

When both finish, desktop shows synchronized side-by-side cards; mobile stacks them. The implementation does not claim geometric correspondence between the two independently generated meshes.

Persistence uses deterministic private paths:

- `{user_id}/{analysis_id}_before.glb`
- `{user_id}/{analysis_id}_after.glb`

The existing `model3d_path` stores the after model for backward compatibility; `model3d_before_path` stores the before model. History renders whichever artifacts exist and labels them unambiguously.

## 8. Error handling

- `no_detection`: use a clearer, front-facing building photo.
- `invalid_mask`: redraw or reset the selection.
- `empty_mask`: select at least one damaged area.
- `mask_size_mismatch`: reset the mask from the current photo.
- A preparation failure cannot start restoration.
- A failed 2D restoration retains its real mask and edge artifacts.
- Before and after 3D failures are independent; one successful model remains usable.
- Tripo quota, upload, generation, timeout, download, and validation reasons remain stable localized keys.
- API restarts still expire in-process jobs; the UI offers a new run and never continues polling a missing id as if work were active.

## 9. Testing and acceptance

### API

- Exact checkpoint class-name mapping and normalized boxes.
- Highest-confidence aggregation, severity tiebreak, and same-class confidence selection.
- No-detection returns `422` without inventing `ND`.
- Model roster exposes Raed only by default while preserving legacy backend source.
- Mask decoding, dimension normalization, empty/malformed rejection, and outside-pixel identity.
- Local and Gemini provider paths both honor the submitted selection at composition.
- Stage timing uses injected clocks and closes stages on success and error.
- Before/after artifacts remain independent.
- Existing Tripo browser-user-agent regression remains green.

### Web

- Four-class API validation, translations, severity strip, detector scores, and overlay.
- Legacy and new history rows parse and render through the correct discriminated branch.
- Pointer, touch, keyboard controls, undo/reset/clear, empty-mask prevention, and RTL layout for the mask editor.
- Live counters begin from server timing and freeze on final backend durations.
- Before/after 3D buttons do not auto-run and never cross-wire job or persistence state.

### Gates

- API focused tests, full `pytest -q`, and Ruff.
- Web tests, TypeScript strict check, ESLint, and production build.
- Fresh runtime smoke tests on non-production ports using Raed's real checkpoint.
- Browser acceptance in English and Arabic: analyze, inspect detection overlay, refine mask, selective restoration, before/after 3D, history reopen.
- Existing `:3000` and `:8000` processes are not replaced until the isolated implementation passes its gates.

## 10. Delivery boundaries

Implementation occurs in an isolated worktree created from the current feature branch after preserving the already-verified Tripo download fix. The existing running dev servers remain attached to the original checkout. Final handoff distinguishes automated verification from any credit-consuming live generation and asks before spending additional external credits beyond already authorized checks.
