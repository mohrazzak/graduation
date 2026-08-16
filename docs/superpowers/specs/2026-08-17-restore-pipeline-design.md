# Restore pipeline: real classifier, 2D repair, 3D reconstruction — design

Date: 2026-08-17 · Status: approved (user signed off on all four decision points)
Deadline: **one week**. Demo runs on the user's laptop, locally. API budget: **$0**.

Amends the master spec (`2026-06-12-damagescale-design.md`) and supersedes its
six-level damage scale and its frozen `/predict` contract. Every other master-spec
rule still binds: TS strict with no `any`, components under ~150 lines with named
exports, Supabase only via `lib/supabase/`, FastAPI only via `lib/api.ts`, zero
hardcoded UI strings, Tailwind logical properties only, `prefers-reduced-motion`
gates every animation, no gradients, border radius ≤ 4px.

## 1. Why this exists

The project shipped as a damage classifier against a mock model. Two things
changed:

1. **A real model now exists** — in fact two, in `/home/mohrazzak/projects/graduation/`.
2. **The product grew** — the team wants classification to be the first step of a
   pipeline that also restores the building in 2D and reconstructs it in 3D.

This document specifies that pipeline.

## 2. Source material (read before implementing)

Nothing here is invented; it all exists on disk today.

| What | Where | Notes |
|------|-------|-------|
| ResNet50 classifier | `/home/mohrazzak/projects/graduation/best_model.keras` | PHI-Net Task 5 (Collapse Mode), 74.66% val accuracy, ~97 MB |
| YOLO classifier | `/home/mohrazzak/projects/graduation/models/yolo_cls.pt` | Was 2-class (GC/PC); **retrained** to 3 classes, 71.23% — see §5.6 |
| Damage % + recommendations | `/home/mohrazzak/projects/graduation/CLAUDE.md` | Formula and EN+AR recommendation text, already written |
| Building isolation (the mask) | `.../A-Smart-Site-.../ai/helpers/image_to_isolated.py` | SegFormer ADE20K + sky flood-fill + edge density + GrabCut |
| 3D reconstruction | `.../A-Smart-Site-.../ai/generate_3d_fast.py` | Tripo AI: upload → task → poll → GLB with PBR |
| 2D repair | `api/repair/generate.py` (this repo) | Gemini 2.5 Flash Image, instruction editing |
| Change overlay | `api/repair/diff.py` (this repo) | Before/after diff, reused as-is |

**`api/repair/` is currently untracked.** Of its eight modules, three survive:
`generate.py` and `diff.py` are load-bearing above, and `generate_hf.py` stays as
a documented alternative backend. `assess_clip.py` and `assess.py` are superseded
by the real classifier, and `cost.py`, `batch.py`, `pipeline.py` belong to the
parked cost feature (§15). The surviving modules are committed as part of the
repair work; the rest stay untracked or are deleted, and the implementation plan
must say which.

`A-Smart-Site-...` is `/mnt/c/Users/mohrazzak/Desktop/A-Smart-Site-For-Rehabilitating-Damaged-Buildings-main`.

**A-Smart-Site contains no damage classifier.** Its RT-DETR and Fast R-CNN are
generic COCO-pretrained detectors. Raed will supply a classifier separately; §5
specifies the slot it drops into.

## 3. Domain model: three tiers

The dataset is PHI-Net Task 5, Collapse Mode. Three classes, and they are the
product's damage scale:

| Code | UI order | EN | AR | Color |
|------|----------|----|----|-------|
| `NC` | 0 | Non-collapse | لا انهيار | `#22C55E` |
| `PC` | 1 | Partial collapse | انهيار جزئي | `#F97316` |
| `GC` | 2 | Global collapse | انهيار كامل | `#991B1B` |

Colors are taken from the existing six-step ramp so the instrument aesthetic
survives. **Do not** import the hex values from the graduation repo's Streamlit
prototype (`#10b981`, `#f59e0b`, `#dc2626`) — they are off-palette.

**`NC` does not mean "intact."** PHI-Net defines it as *"intact or minor damage,
structure remains."* The product hides restoration for NC as a deliberate rule,
but no UI copy, report, or defense slide may claim an NC building is undamaged.
The EN/AR labels above say "non-collapse," not "intact," for this reason.

### 3.1 The alphabetical-index trap

Keras emits classes in **alphabetical** order:

```
model output index:  0 = GC,  1 = NC,  2 = PC
UI severity order:   NC → PC → GC
```

The damage-percentage table and the recommendation text in the graduation repo
are keyed by **model index**, not by severity. Any code that assumes
`probabilities[0]` is the least-damaged class will silently mislabel every
prediction — the classifier will look plausible and be wrong.

The mitigation is structural, not disciplinary: **the API never speaks in
indices.** One function at the model boundary converts the alphabetical vector
into a code-keyed mapping, and every layer above it uses codes. See §4.

### 3.2 Damage percentage

Raed's "توقع نسبة الضرر", using the formula already written:

```
damage_percent = Σ  probability[code] × WEIGHT[code]
WEIGHT = { NC: 15, PC: 60, GC: 95 }
```

Reported as a percentage with one decimal. It is a weighted expectation over
class probabilities, not a measured quantity — UI copy must not present it as a
survey figure.

### 3.3 Recommendations

The EN + AR bullets already written in the graduation repo move verbatim into
`web/messages/{en,ar}.json` under `tiers.<code>.recommendation.*`:

- **NC** — Cosmetic repairs: structurally sound, paint and cosmetic repair,
  periodic inspection every 6 months, treat surface cracks.
- **PC** — Immediate structural reinforcement: CFRP carbon-fiber reinforcement,
  strengthen load-bearing columns, temporary evacuation during repairs, full
  inspection by a structural engineer.
- **GC** — Demolish and rebuild: not salvageable, immediate evacuation, safe
  demolition under engineering supervision, rebuild to modern seismic code.

## 4. API contract (replaces the frozen one)

### 4.1 `POST /predict`

Multipart field `file` (jpeg/png/webp, ≤ 10 MB), optional query `?model=<id>`.

```jsonc
{
  "tier": "PC",                                        // "NC" | "PC" | "GC"
  "confidence": 0.72,                                  // 0..1
  "probabilities": { "NC": 0.10, "PC": 0.72, "GC": 0.18 },
  "damage_percent": 61.4,                              // 0..100
  "model": {
    "id": "resnet50-phinet",
    "name": "ResNet50 (PHI-Net)",
    "accuracy": 0.7466
  },
  "heatmap_base64": "<png>"                            // or null
}
```

Errors stay as they are: 400/500 → `{"detail": "..."}`.

This **breaks** the master spec's frozen contract (`level` 0–5 plus a six-float
array). Approved deliberately; `CLAUDE.md` is updated in the same change.

### 4.2 `GET /models`

```jsonc
{ "models": [
  { "id": "resnet50-phinet", "name": "ResNet50 (PHI-Net)", "accuracy": 0.7466,
    "available": true,  "reason": null },
  { "id": "yolo-cls",        "name": "YOLO11-cls",         "accuracy": 0.7123,
    "available": true,  "reason": null },
  { "id": "raed",            "name": "Raed's model",       "accuracy": null,
    "available": false, "reason": "weights_missing" }
]}
```

`available` reflects whether the backend's weights and dependencies actually
load right now. The UI shows unavailable models as **disabled with a reason,
never hidden** — a disabled entry is information, a missing one is a mystery.
`reason` is a message key (`weights_missing`, `dependency_missing`,
`load_failed`), so the text is translated like everything else.

The default selection is the first available model in list order.

### 4.3 `GET /health`

Unchanged in shape, gains the active model id:
`{"status": "ok", "mock": false, "model": "resnet50-phinet"}`.

### 4.4 Jobs

Repair and 3D take 10 s – 3 min, far past a browser request. Both run as jobs.

```
POST /jobs/repair    multipart: file, tier, prompt?          → { "job_id": "..." }
POST /jobs/model3d   multipart: file  OR  from_job=<id>      → { "job_id": "..." }
GET  /jobs/{id}                                              → status document
GET  /jobs/{id}/artifact/{name}                              → raw bytes
```

Status document:

```jsonc
{
  "status": "running",                    // queued | running | done | error
  "stage": { "key": "generating", "index": 3, "total": 5 },
  "artifacts": ["mask", "edges"],         // names ready to fetch, grows as it runs
  "detail": null                          // human-readable message when status = error
}
```

**Polling, not SSE.** It matches Tripo's own pattern, needs no connection held
open, and survives a sleeping free-tier dyno. The client polls every 1.5 s.

`from_job` on `/jobs/model3d` reconstructs from a completed repair job's output
instead of the original upload — this is the "repaired then converted to 3D"
path Raed asked for.

**Job store: an in-process dictionary, with jobs expiring after 30 minutes.**
This is honest for a single-process local demo and must be stated as such at the
defense. It does not survive a restart and does not work across replicas.

## 5. Classifier registry

`api/predict/registry.py` holds named backends behind one protocol:

```python
class Classifier(Protocol):
    id: str
    name: str
    accuracy: float | None
    def classify(self, image_bytes: bytes) -> Prediction: ...
```

**Four backends ship, three of them user-facing:**

| id | Backend | Accuracy | Status |
|----|---------|----------|--------|
| `resnet50-phinet` | Keras ResNet50, `best_model.keras` | 74.66% | **verified working** (§5.5) |
| `yolo-cls` | Ultralytics YOLO11-cls | TBD | **must be retrained** (§5.6) |
| `raed` | Raed's classifier | TBD | **stub until weights arrive** |
| `mock` | Deterministic hash-seeded | — | always available, hidden by default |

Selection is per-request via `?model=`; the default is the first available model.

The `raed` backend ships **now**, as a real registry entry whose loader looks for
weights at `RAED_WEIGHTS_PATH` and reports `available: false` with reason
`weights_missing` until they exist. When Raed sends the model, the work is
dropping in the file and — if his architecture differs from Keras or Ultralytics
— writing its `classify()`. Nothing else changes, and the picker lights up on its
own.

### 5.1 Which models the picker shows

`ENABLED_MODELS` (comma-separated ids, env) controls the roster. It defaults to
`resnet50-phinet,yolo-cls,raed` — the three-way comparison, which is a good
defense talking point.

To show **only Raed's model**, set `ENABLED_MODELS=raed`. The picker then has a
single entry and collapses to a static label rather than rendering a
one-option dropdown. `mock` is excluded by default and opted into explicitly
(`ENABLED_MODELS=mock`) for CI and the cloud deployment.

Ids in `ENABLED_MODELS` that match no registered backend are ignored with a
startup warning — a typo must not silently empty the roster. If the resulting
roster is empty, the API falls back to `mock` rather than serving a picker with
nothing in it.

**Heavy dependencies are optional.** TensorFlow (ResNet) and
torch + ultralytics (YOLO) go in `api/requirements-models.txt`, not the base
requirements. The registry catches `ImportError` and a missing weights file and
reports the backend as `available: false` with a reason. This keeps the cloud
deployment alive on the mock backend while the laptop runs the real model, and
keeps the base Docker image small.

**Weights live outside the repo** and are located by env var
(`RESNET_WEIGHTS_PATH`, `YOLO_WEIGHTS_PATH`), defaulting to the paths in §2.
`best_model.keras` is ~95 MB and is not committed to git.

### 5.2 ResNet preprocessing — exact, and unforgiving

The model was trained with Caffe-style preprocessing. Getting this wrong yields
confident garbage rather than an error:

1. Resize to **224 × 224**
2. `float32` numpy array
3. **RGB → BGR** (reverse channel order)
4. Subtract ImageNet means, **no** division by std:
   B `-= 103.939`, G `-= 116.779`, R `-= 123.68`
5. Add batch dimension → shape `(1, 224, 224, 3)`

Output shape `(1, 3)`, softmax, **alphabetical** — see §3.1.

A unit test asserts a known sample image yields the expected tier, so a
preprocessing regression fails the suite instead of the defense.

### 5.3 The mock backend is rewritten, not retired

`predict/mock.py` currently emits the six-level contract. It is rewritten to emit
the three-tier one, staying deterministic and hash-seeded (same image → same
tier). It remains the default when no weights are present, so the cloud
deployment and CI keep working with zero heavy dependencies.

### 5.4 Heatmaps: null in v1, Grad-CAM as a stretch

The master spec promised "real model + Grad-CAM", the how-it-works page has a
`GradCamSection`, and the mock has always returned a heatmap — so **the null
path may never have been exercised** in `ImageWithHeatmap`, `HeatmapToggle`, the
reveal slider, or the history modal.

The decision: **real backends return `heatmap_base64: null` in v1.** Day 1
verifies that every heatmap affordance hides cleanly when it is null, rather than
rendering an empty layer or a dead toggle. `heatmap_path` stays nullable in the
schema.

Grad-CAM on the Keras ResNet is a **day-7 stretch**, not a commitment: it is
roughly thirty lines of `tf.GradientTape` against the last conv block plus the
existing overlay code, and adds no dependency. If it lands, it fills the
`GradCamSection` placeholder with something real; if it does not, that section
says so honestly.

### 5.5 Verified on this machine (2026-08-17)

Measured, not assumed:

| Fact | Value |
|------|-------|
| Python / TensorFlow / torch | 3.12.3 / 2.21.0 / 2.12.0+cu130 |
| GPU | GTX 1650 Ti, 4 GB VRAM, `cuda_available: true` |
| `best_model.keras` | loads, input `(None,224,224,3)`, output `(None,3)` |
| Prediction on `demo/damaged/partial.jpg` | GC 0.221 / NC 0.178 / **PC 0.600** |

The ResNet **classifies the partial-damage sample as PC**, which confirms both
the model and the §5.2 Caffe preprocessing end to end. That exact assertion
becomes the unit test.

The working venv is `/home/mohrazzak/projects/graduation/.venv`. The API's own
venv has neither framework; the heavy requirements are installed there (§5).

#### ⚠ Import order is load-bearing: the torch stack before TensorFlow

Measured, and stronger than it first appeared. The initial probe only proved the
two *imports* could share a process; running real inference through both revealed
the actual rule:

| Order | Result |
|-------|--------|
| `import ultralytics` **after** a Keras prediction | **SIGSEGV, exit 139** |
| `import ultralytics` **before** TensorFlow is used | works in any order, including switching back and forth |

**Importing `torch` early is not sufficient** — the crash is triggered by
importing `ultralytics` itself. So `predict/registry.py` imports the whole torch
stack (torch *and* ultralytics) at module load, before any backend can reach
TensorFlow.

This is the highest-severity failure mode in the project. It does not fail a
request, it kills the API process, and it fires exactly when someone switches
from ResNet to YOLO — that is, while demonstrating the model comparison. Because
the failure is process death, no in-process test can catch it:
`tests/test_backend_coexistence.py` runs four alternating predictions in a
**subprocess** and asserts the exit code is not `-11`.

### 5.6 The YOLO model is binary and must be retrained

`models/yolo_cls.pt` reports `names: {0: 'GC', 1: 'PC'}`. It has **two classes,
not three** — `scripts/train_yolo.py` trains on `data/yolo_cls_binary`, whose
docstring states "GC vs PC only, **NC dropped**".

Two consequences:

1. **It cannot serve the three-tier contract.** It can never output NC, the tier
   that gates "skip restoration, go straight to 3D."
2. **The 80.37% figure is not comparable to the ResNet's 74.66%.** It is accuracy
   on an easier two-class problem. Presenting them side by side as a model
   comparison — in the UI or in the report — would be misleading.

**Fix: retrain on the three-class data, which is already prepared.**
`data/yolo_cls/` holds train GC 525 / NC 322 / PC 379 and val 67 / 39 / 40. The
change to `scripts/train_yolo.py` is the `data=` path; 30 epochs at 224px on the
1650 Ti is minutes, not hours. The resulting top-1 accuracy — whatever it turns
out to be — is the number that ships, and it is genuinely comparable.

If the retrain underperforms badly, YOLO is dropped from the roster rather than
shipped with a flattering incomparable number.

## 6. Repair pipeline (2D)

`POST /jobs/repair` runs real stages and emits real artifacts:

| Stage | What it does | Artifact |
|-------|--------------|----------|
| `isolating` | SegFormer ADE20K + sky flood-fill + edge density + GrabCut, ported from `image_to_isolated.py` | `mask` (PNG) |
| `edges` | OpenCV Canny over the isolated building | `edges` (PNG) |
| `generating` | Gemini 2.5 Flash Image instruction edit, tier-tuned prompt | — |
| `composing` | `diff.py` change overlay: repaired regions tinted hazard | `repaired`, `diff` (PNG) |

`mask` and `edges` are what Raed's interactive canvas displays beside the photo —
they are genuine model output, not decoration.

**The `generating` stage is one long opaque step and is displayed as one long
step.** Gemini gives no progress signal; inventing sub-stages inside it would be
fabricating a progress bar. The UI shows an indeterminate indicator with an
honest elapsed-time counter for that stage.

The tier feeds the prompt, as `generate.py` already does — light touch-up for NC,
full reconstruction latitude for GC. The prompt is **editable**: the repair panel
exposes a textarea pre-filled with the tier-tuned instruction, and re-running
with an edited prompt is a real re-run. This delivers half of Raed's
"post-result tool" honestly.

Raed's GC rule — *"توجيه نموذج الـ Inpainting لاستخدام قناع شامل (Full Mask)"* —
has no literal form on an instruction-editing backend, which takes no mask at
all. It maps onto **maximum reconstruction latitude in the prompt**: the GC
instruction grants the model permission to infer and rebuild whole structural
volumes rather than patch openings. With a mask-conditioned backend the same
rule would become a literal whole-building mask. The spec records both so the
intent survives the backend swap.

**Not in scope: the manual mask-drawing canvas.** Gemini performs instruction
editing and cannot honor a hand-drawn mask; shipping a canvas whose strokes are
discarded would be a lie to the user and to the examiners. The mask is displayed
read-only. If a mask-conditioned backend (SD-inpaint + ControlNet) is added
later, the registry pattern from §5 extends to repair backends with a
`supports_mask` capability flag, and the editor becomes buildable then.

## 7. 3D pipeline

`POST /jobs/model3d` ports `generate_3d_fast.py`:

| Stage | What it does |
|-------|--------------|
| `uploading` | POST image to `api.tripo3d.ai/v2/openapi/upload` → `image_token` |
| `reconstructing` | Create `image_to_model` task, `texture: true`, `pbr: true`; poll every 3 s |
| `downloading` | Fetch the `pbr_model` URL |

Artifact: `model` (GLB, `model/gltf-binary`).

Requires `TRIPO_API_KEY`. When unset, the endpoint returns 503 with a clear
message rather than failing mid-job.

Raed's script derives the upload `type` from the input filename. On the
`from_job` path the input is a Gemini-produced PNG with no filename, so the type
is set explicitly rather than inferred.

**Depth Anything V2 + Open3D (`images_to_3d.py`) is not an alternative.** It
emits a PLY point cloud and opens a desktop window — it is neither a textured
mesh nor web-renderable. It is recorded here only so nobody mistakes it for a
fallback.

### 7.1 Viewer

`@google/model-viewer`, added to `package.json` (approved stack change). It
covers Raed's entire control list natively: orbit on drag, zoom, environment
lighting, background color, and a GLB download. `auto-rotate` is gated behind
`useReducedMotion`. The canvas gets an accessible label and the download is a
real `<a download>` against `/jobs/{id}/artifact/model`.

## 8. Tier gating

| Tier | Repair | 3D | Banner |
|------|--------|----|--------|
| **NC** | disabled, "no restoration needed" | **primary CTA** | green: structurally sound, cosmetic repairs only |
| **PC** | **enabled and pre-selected** | enabled, from original *or* repaired | amber: reinforcement recommended |
| **GC** | enabled **with warning** — reconstruction, not patching | enabled | red `alert` + hazard stripe: not salvageable |

Two rules are enforced in both layers:

- **Restoration requires classification.** The buttons do not exist before a
  result, and `POST /jobs/repair` rejects a request without a tier.
- **The `alert` treatment and the hazard stripe are GC-only**, preserving the
  master spec's rule that alert styling marks the top of the scale exclusively.

For GC the repair panel shows a warning before running: local patching is not
meaningful at total collapse, and the output should be read as a conceptual
reconstruction rather than a restoration plan.

## 9. Frontend structure

No new routes. The analyze page grows a service rail.

```
app/[locale]/page.tsx          landing + new services section (3 cards)
app/[locale]/analyze/page.tsx  dropzone → result → service rail
```

New components, each one responsibility, named export, under ~150 lines:

```
components/analyze/
  ModelPicker.tsx        model select: name + accuracy, disabled entries show a
                         reason, collapses to a static label at one option
  DamageGauge.tsx        damage_percent, JetBrains Mono, count-up (reduced-motion gated)
  RecommendationCard.tsx tier-keyed bullets, severity styling
  ServiceRail.tsx        the tier-gated Restore / 3D buttons
components/repair/
  RepairPanel.tsx        orchestrates the repair job
  StageProgress.tsx      real stage list from the job document
  StageCanvas.tsx        photo | mask | edges, read-only
  PromptEditor.tsx       editable instruction + re-run
components/model3d/
  ModelPanel.tsx         orchestrates the 3D job
  ModelViewer.tsx        <model-viewer> wrapper, client component
components/ui/
  TierStrip.tsx          replaces ScaleStrip: 3 segments
lib/
  tiers.ts               replaces levels.ts — single source of truth
  jobs.ts                job polling client (only place that polls the API)
```

Before/after comparison **reuses the existing `HeatmapRevealLayer`** — it is
already a keyboard-operable, direction-aware wipe slider. No new component.

### 9.1 Six-level residue audit

The scale change reaches further than the components above. Every one of these is
checked and updated in the same pass:

- **how-it-works page** — `DatasetSection`, `ModelSection`, `MetricsSection`, and
  `ConfusionMatrixSlot` describe a six-level model. These stop being placeholders:
  the dataset is PHI-Net (PEER, UC Berkeley), Task 5 Collapse Mode; the
  architecture is ResNet50 transfer learning; accuracy is 74.66%, alongside the
  retrained three-class YOLO figure (§5.6 — **not** the old binary 80.37%). The
  confusion matrix becomes 3×3.
- **`ReportSheet`** (PDF print stylesheet) — renders level, probabilities, and the
  scale strip.
- **Landing copy** — any "six damage levels" phrasing in `messages/{en,ar}.json`.
- **`SampleStrip`** — the six `level-*.jpg` samples are already deleted from
  `web/public/samples/`. Replaced by **three, one per tier**, so the strip
  demonstrates the actual scale.
- **Footer / citations** — dataset and model attribution now have real values.

## 10. Storage

```sql
-- Order matters: the NOT NULL columns below cannot be added to a non-empty
-- table, so the wipe comes FIRST. Storage objects must be cleared via the
-- Storage API, not SQL (a protect trigger blocks deleting storage.objects rows).
delete from public.analyses;

-- analyses: drop the 0-5 scale, adopt tiers
alter table public.analyses drop column level;
alter table public.analyses add column tier text not null
  check (tier in ('NC','PC','GC'));
alter table public.analyses add column damage_percent real not null
  check (damage_percent between 0 and 100);
alter table public.analyses add column model_id text not null;
alter table public.analyses add column repaired_path text;   -- nullable
alter table public.analyses add column model3d_path text;    -- nullable
-- probabilities jsonb becomes an object {"NC":f,"PC":f,"GC":f}
```

**Existing rows are deleted.** They hold mock verdicts on a scale that no longer
exists; mapping them to tiers would fabricate assessments. This is demo data and
the wipe is approved.

Storage paths extend the existing convention:
`{user_id}/{analysis_id}_repaired.png`, `{user_id}/{analysis_id}.glb`.

**GLB files are 5–15 MB against a 1 GB free bucket** — roughly 60–100 models
before the quota bites. Repaired PNGs save automatically; the GLB saves only on
an explicit "keep this model" action, and the UI states the cost.

## 11. Cross-cutting rules

Every new surface obeys the standing non-negotiables. Calling them out because
canvases, viewers, and progress UI are exactly where they usually get dropped:

- **i18n** — every string in `messages/{en,ar}.json`, including stage names,
  job errors, and model names. Numbers and percentages via next-intl formatters.
- **RTL** — logical properties only. The stage canvas and service rail must
  mirror. `<model-viewer>` is a 3D scene and does not mirror; its *controls* do.
- **Keyboard** — service buttons, model picker, prompt editor, viewer, and
  download are all reachable and operable with visible focus.
- **Reduced motion** — gates the damage-percent count-up, stage transitions, and
  viewer auto-rotate. Under reduced motion the stage list renders statically.
- **Errors** — say what failed and what to do next. A dead API quota reads
  "the restoration service is out of credit for today", not "error 429".

## 12. Risks

| Risk | Mitigation |
|------|------------|
| Free quota dies mid-defense | **Pre-generate repair + 3D outputs for 2–3 sample buildings and ship them as fixtures.** A dead quota degrades the demo instead of ending it. This is the single most important mitigation and is not optional. |
| ResNet preprocessing wrong | Unit test on a known sample asserting the expected tier (§5.2) |
| Alphabetical index confusion | Codes end-to-end; conversion in one function (§3.1) |
| TensorFlow bloats the image / breaks free tier | Optional requirements file; registry degrades to mock (§5) |
| Raed's classifier arrives late | Registry slot; one module plus one line (§5) |
| One week is not enough | Build in the §13 order — each day ends with something demonstrable |

## 13. Sequencing

Ordered so that stopping at the end of any day still leaves a working demo.

1. **Tiers + real classifier.** `lib/tiers.ts`, `TierStrip`, messages, schema
   migration, registry, ResNet backend, new `/predict`. Demo: real predictions.
2. **Damage % + recommendations + service rail.** Demo: the full classification
   product, tier-gated buttons visible.
3. **Job API + 3D.** Tripo port, `ModelPanel`, `<model-viewer>`. Demo: photo → 3D.
4. **Repair.** Isolation, Canny, Gemini, diff, `StageCanvas`, `PromptEditor`.
   Demo: the whole pipeline.
5. **Model picker + YOLO retrain + `raed` stub + polish.** Three-way roster,
   `ENABLED_MODELS`, EN/AR pass, a11y pass, 390px/1440px. The retrain (§5.6) is
   minutes of GPU time and can start in the background on any earlier day.
6. **Fixtures + verification.** Pre-generate demo assets, E2E both locales.
7. **Buffer.** Raed's classifier if it arrives; docs; `CLAUDE.md` update.

## 14. Definition of done

- [ ] `npx tsc --noEmit` clean, zero `any`; `ruff check .` clean; `pytest -q` passes
- [ ] Real ResNet prediction on a known image returns the expected tier
- [ ] Full flow in **both** `/en` and `/ar`, Arabic mirrors correctly
- [ ] NC hides restoration and offers 3D directly; PC pre-selects the pipeline;
      GC warns before restoring
- [ ] Repair job shows real mask and Canny artifacts; prompt edit re-runs
- [ ] 3D model orbits, zooms, and downloads as GLB
- [ ] Keyboard-only path through classify → restore → 3D; reduced motion honored
- [ ] Every heatmap affordance hides cleanly when `heatmap_base64` is null
- [ ] No six-level residue: how-it-works, ReportSheet, landing copy, samples
- [ ] Fixtures let the full demo run with both API keys removed
- [ ] `docker compose up` still starts the app
- [ ] `CLAUDE.md` records the new contract, the 3 tiers, and the index trap

## 15. Out of scope

- Manual mask drawing (§6) — needs a mask-conditioned backend
- OccFacade facade parsing — weights and dataset are not in the repo
- Cost estimation — two models exist (`api/repair/cost.py` parametric; the
  materials table in `graduation/data/state.json`); parked deliberately
- Depth Anything / Open3D point cloud (§7)
- Multi-process or persistent job storage (§4.4)
