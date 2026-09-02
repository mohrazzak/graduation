# Single-Model Consolidation and Codebase Cleanup — Design

**Date:** 2026-09-02
**Branch:** `feat/three-tier-pipeline`
**Status:** approved in chat, ready to implement

## Why

The product ships one model. The repository still carries three others, a
retired damage scale, a TensorFlow dependency that exists only to serve a
backend nobody can select, and ~8 GB of duplicated artifacts on disk. None of
it is reachable from the running app, all of it has to be read and reasoned
around by anyone touching the code, and one piece of it is actively wrong (the
navbar renders the retired scale).

This is a deletion-led change. Almost nothing new is written; the value is in
what stops existing.

## Decisions taken

| Question | Decision |
| --- | --- |
| Which models survive | `raed` (Trained Model) and `mock` |
| Why `mock` survives | It is infrastructure, not a model: CI, `docker compose` and the test suite all run on it. Deleting it breaks the build. |
| Detection boxes in the UI | Hidden. The photo renders plain; the verdict lives only in the result panel. |
| Legacy `phi3` tier scale | Deleted from the frontend. Zero `phi3` rows exist (all 19 analyses are `raed4`). |
| Supabase schema | **Left alone.** Dropping the `phi3` columns and CHECK constraint needs a migration; not worth the risk this close to the defense. |
| `how-it-works` metrics | Republished from the shipped checkpoint's own recorded validation metrics. |
| Confusion matrix | **Removed.** Cannot be reproduced — see Known Loss below. |
| Cleanup scope | Code only. No visual redesign. |

## Known loss

`ConfusionMatrixSlot` is deleted and not replaced. The `raed` checkpoint records
only aggregate metrics, and its training data lives on Google Drive
(`/content/drive/.shortcut-targets-by-id/…/lastdataset/data.yaml`), not on this
machine. A four-class confusion matrix cannot be computed from what is here. If
the dataset is supplied later, the matrix can be measured and the section
restored.

## Verified before deleting

Each disk target was checked, not assumed:

- **Reference clone** (`A-Smart-Site-For-Rehabilitating-Damaged-Buildings/`, 25 MB) —
  zero references from any `.py`, `.ts`, `.tsx`, `.sh`, `.yml`, `.json` or
  Dockerfile in this repo. The 3D reconstruction that runs is
  `api/jobs/model3d.py`, which was *ported out of* that clone (its docstring
  says so) and imports only stdlib. The clone is its own git repository with a
  GitHub remote and a clean working tree, so it is re-clonable.
- **Root `.venv`** (7.4 GB) — no absolute reference anywhere. `scripts/dev-api.sh`
  runs `api/.venv`; the local repair worker runs the graduation venv, which is
  the only one carrying `diffusers`. The root env is an orphaned duplicate
  created 2026-08-17, before the venv moved into `api/`.
- **`best.pt`** (22 MB) — byte-identical (sha256 `a680e240…`) to the installed
  `raed_yolov8s_4class.pt`. **`best2.pt`** (209 MB) — the segment run, whose
  installed copy is also removed with `raed-seg`.

## A. API — roster reduced to one real model

Delete:

- `predict/backends/raed_seg.py`, `resnet.py`, `yolo.py`
- `predict/tiers.py`, `predict/interface.py` (only the deleted backends used them)
- `tests/test_resnet.py`, `test_yolo.py`, `test_tiers.py`, `test_backend_coexistence.py`

Collapse `predict/backends/ultralytics_detector.py` back into `raed.py`: the
shared base existed to serve two checkpoints, and there is now one.

**The TensorFlow removal cascades.** TF is imported by nothing but the ResNet
backend. With it gone, the torch-before-TensorFlow import ordering in
`registry.py` — currently load-bearing, with a subprocess test guarding a
SIGSEGV — protects against a crash that can no longer occur. The early import
block, its docstring, and the coexistence guard all go. `requirements-models.txt`
loses `tensorflow==2.21.0`.

Environment variables removed: `RAED_SEG_WEIGHTS_PATH`,
`RAED_SEG_CONFIDENCE_THRESHOLD`, `RESNET_WEIGHTS_PATH`, `YOLO_WEIGHTS_PATH`,
`YOLO_ACCURACY_PATH`. `scripts/dev-api.sh` returns to a single weights check and
`ENABLED_MODELS=raed`.

The two hardcoded absolute paths in `yolo.py` and `resnet.py`
(`/home/mohrazzak/projects/graduation/…`) disappear with those files.

## B. Web — boxes hidden

Delete `components/analyze/VerdictOverlay.tsx` and its use in `AnalyzeClient`
and `AnalysisModal`. `ImageWithHeatmap` keeps its optional `children` slot,
still used by `ScanOverlay`.

Per-detection data is unaffected: `/predict` still returns `detections` and they
are still persisted. This is presentation only.

## C. Web — legacy tier scale deleted

Eleven files import `lib/tiers`:

```
lib/tiers.ts                    lib/types.ts
lib/evaluation.ts               lib/supabase/queries.ts
components/ui/TierStrip.tsx     components/analyze/DamageGauge.tsx
components/history/AnalysisCard.tsx     AnalysisModal.tsx     EmptyState.tsx
components/how-it-works/ConfusionMatrixSlot.tsx     MetricsSection.tsx
components/report/ReportDocument.tsx
```

`TierStrip` and `DamageGauge` are deleted outright. The rest lose their legacy
branch. The `Analysis` union collapses from `LegacyAnalysis | RaedAnalysis` to a
single shape, which is what actually shrinks `queries.ts` and `AnalysisModal` —
the legacy branch is why they are 373 and 304 lines.

**Bug fixed here:** `components/layout/Navbar.tsx` renders `TierStrip` — the
retired 3-segment strip — as the site-wide logo. CLAUDE.md claims it uses the
4-segment `DamageStrip`. It is switched to `DamageStrip`.

**Not deleted, only renamed:** `components/landing/TiersGrid.tsx` and
`how-it-works/ScaleExplained.tsx` already read `DAMAGE_CLASSES`. They are
correct code with stale names and comments. `TiersGrid` → `DamageClassGrid`.

`messages/{en,ar}.json` lose the `tiers.*` namespace and the retired
`models.names` entries. Both locales stay key-for-key identical.

## D. Web — how-it-works republished

`lib/evaluation.ts` is rewritten to publish the shipped model's own recorded
validation metrics, read from the checkpoint:

| Metric | Value |
| --- | --- |
| precision (B) | 0.34975 |
| recall (B) | 0.46396 |
| mAP50 (B) | 0.31478 |
| mAP50-95 (B) | 0.19023 |

Training run: 150 epochs, imgsz 800, YOLOv8s.

`MetricsSection` renders these instead of top-1 accuracy, with a short
explainer — new strings in both locales — stating that a detector is measured by
mean average precision over IoU thresholds, not by classification accuracy, so
these numbers are not comparable to the retired models' figures.

The retired ResNet 74.66% and the two-class 80.37% YOLO number are removed from
the codebase entirely. Neither describes anything that ships.

## E. Web — oversized files split

The repo's own rule is components under ~150 lines. After the legacy branch is
gone, re-measure and split what still exceeds it: `lib/supabase/queries.ts`,
`components/history/AnalysisModal.tsx`, `components/history/HistoryClient.tsx`,
`lib/api.ts`. Splits follow responsibility, not line count — a file is divided
where it does two jobs, not at an arbitrary boundary.

## F. Disk — ~8.1 GB freed

| Target | Size |
| --- | --- |
| Root `.venv` | 7.4 GB |
| `raed_yolov8m_seg_4class.pt` (installed today) | 209 MB |
| `best2.pt` | 209 MB |
| `best.pt` | 22 MB |
| Reference clone | 25 MB |

The 2 history rows with `model_id='raed-seg'` are deleted, since that model no
longer exists and History would otherwise render a raw id.

## G. Docs

CLAUDE.md loses: the multi-model roster table, the segfault import-order note,
the `best.pt (1)` / `raed-seg` note, the legacy weights paths, and the stale
`DamageStrip` claim. The repo map is updated. README follows.

Historical spec and plan documents under `docs/superpowers/` are **not**
rewritten — they are dated records of what was true when written.

## Verification

Each phase lands as its own commit, and nothing is claimed done without output:

- `ruff check .` clean; `ENABLED_MODELS=mock pytest -q` green
- `pytest -q` with real weights — `raed` still returns ND 0.639 / SMD 0.642 /
  HVD 0.537 / TD 0.576 on the four samples
- `npx tsc --noEmit` zero errors, zero `any`; `npm run lint` clean; `npm test` green
- Both locale message files parse and have identical key sets
- Browser: `/en` and `/ar`, 1440px and 390px — landing, analyze (photo renders
  with no boxes), history, how-it-works. RTL mirrors, no horizontal overflow.
