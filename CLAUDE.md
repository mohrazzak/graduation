# DamageScale — AI Building-Damage Classifier (Graduation Project)

Demo web app: users register, upload a building photo, Raed's trained detector
locates buildings and assesses one of four destruction classes, then users can
select the exact area to reconstruct in 2D and explicitly generate independent
3D models before rebuilding and after reconstruction.

**Raed's model IS trained, and it is now the only model in the repository.**
The retired PHI-3 classifiers (ResNet50, YOLO11-cls), their three-tier scale
and the YOLOv8m-seg comparison run were all deleted on 2026-09-02 — source,
tests, weights and env vars. A deterministic four-class mock remains, and it is
not an unused model: CI, `docker compose` and the whole test suite run on it.

**Build status (2026-09-02):** four-class Raed detection, normalized boxes,
truthful no-detection handling, editable selective masks, backend-measured job
timings, and explicit before/after Tripo 3D runs are implemented on
`feat/three-tier-pipeline`. The polled job API, restoration pipeline and 3D
viewer are live. Everything that served the retired three-tier scale is gone.
Supabase now runs as a LOCAL `supabase start` stack (the cloud project was
deleted; DNS NXDOMAIN, verified 2026-08-31). The full
register→analyze→save→history flow is browser-verified against it in both
locales at 1440px and 390px: storage upload, the RLS-guarded `analyses` insert,
signed-URL reload and the reopened modal all confirmed live. As of 2026-09-06
the photo again draws a box per detection under one verdict badge, on both the
analyze page and the history modal; placement was measured against `/predict`
in `/en` at 1440px and `/ar` at 390px for all four samples.

**Generated results now auto-save into the original analysis row.** A live
repaired PNG and live GLB use deterministic private-storage paths, update that
row's `repaired_path` / `model3d_path`, and expose saving/saved/failed + Retry
without a manual Keep action. History reopens the complete original assessment
(verdict, probabilities, damage, model and recommendation) together with the
before/after repair and 3D model; signing and media-load failures are retryable.

Generation-service balances are external and must be checked live. Never
auto-start Tripo: both before and after are explicit user actions because each
run consumes credit. Mask preparation is local and may start automatically.

**TensorFlow is GONE.** It was imported by nothing except the retired ResNet, so
deleting that backend removed the dependency and, with it, the whole
torch-before-TensorFlow ordering hazard. The API venv runs Ultralytics 8.4.56
with the matching CPU pair torch 2.12.1+cpu / torchvision 0.27.1+cpu. Compose
still defaults to `mock` by design because its image excludes the model stack.

⚠ **Generation-service credit is external state — always re-check it live.**
Tripo read **300.0** via `account_balance` on 2026-09-07 (the key was rotated on
2026-09-06); the earlier "balance 0" and the older "480 credits" are both dead
claims. Gemini last returned 429 and has NOT been re-checked since. Never quote
any of these numbers without running the check again. The UI reports the named
failure honestly.

**2D repair no longer depends on Gemini.** `REPAIR_BACKEND=auto` tries an
isolated local Stable Diffusion 1.5 inpainting + Canny ControlNet worker first,
then falls back to Gemini; `local-controlnet` and `gemini` force one provider.
The real local worker completed 30/30 steps on the GTX 1650 Ti in 99.894 s,
peaked at 2,570 MiB, and produced a Pillow-verified non-black PNG. The stock
Docker API intentionally lacks the CUDA stack, so real local generation runs
through the external repair venv described below. Mask and edge artifacts remain
local and quota-free in every configuration.

Nothing is pending on the user for the build itself. The two long-standing
items are both DONE: "disable Confirm email" (the local stack auto-confirms, and
registration was driven end-to-end in the browser) and the footer names, now
Aleppo University / Dr. Fadel Sukkar in both locales. The only optional item
left is funding Tripo if a LIVE 3D run is wanted on stage — the pre-generated
GLB fixtures cover only the ND and TD samples, and 2D repair no longer needs a
paid provider.

Authoritative documents — read before changing anything:

- **Current spec (follow this):** [docs/superpowers/specs/2026-08-23-four-class-selective-reconstruction-design.md](docs/superpowers/specs/2026-08-23-four-class-selective-reconstruction-design.md)
- Earlier restoration pipeline spec:
  [docs/superpowers/specs/2026-08-17-restore-pipeline-design.md](docs/superpowers/specs/2026-08-17-restore-pipeline-design.md)
- Automatic persistence:
  [docs/superpowers/plans/2026-08-17-history-auto-persistence.md](docs/superpowers/plans/2026-08-17-history-auto-persistence.md)
- Local repair design + plan:
  [docs/superpowers/specs/2026-08-18-local-controlnet-repair-design.md](docs/superpowers/specs/2026-08-18-local-controlnet-repair-design.md),
  [docs/superpowers/plans/2026-08-18-local-controlnet-repair.md](docs/superpowers/plans/2026-08-18-local-controlnet-repair.md)
- Superseded master spec (six-level scale, frozen contract — both replaced):
  [docs/superpowers/specs/2026-06-12-damagescale-design.md](docs/superpowers/specs/2026-06-12-damagescale-design.md)
- Amendments: [landing imagery + Cairo](docs/superpowers/specs/2026-06-12-landing-imagery-cairo-design.md), [premium upgrade + deploy](docs/superpowers/specs/2026-06-12-premium-upgrade-deploy-design.md)
- Implementation plans live in `docs/superpowers/plans/` (current:
  restore-pipeline-phase1).

## The four destruction classes (the active domain)

These are the exact class names emitted by Raed's YOLOv8s detector.

| Code | English          | Arabic       | Ramp color |
| ---- | ---------------- | ------------ | ---------- |
| `ND` | No Damage | بلا ضرر | `#52C77B` |
| `SMD` | Slight / Moderate Damage | ضرر طفيف / متوسط | `#F2C94C` |
| `HVD` | Heavy / Very Heavy Damage | ضرر شديد / شديد جداً | `#F28C28` |
| `TD` | Total Damage | ضرر كلي | `#FF3B30` |

Single source of truth: `web/lib/damage-classes.ts` (`DAMAGE_CLASSES`) and
`api/predict/damage_classes.py`. There is no other scale; the legacy
`tiers.*` domain was deleted on 2026-09-02.

Aggregation follows detector confidence: the retained detection with the
HIGHEST confidence decides the verdict, and its own confidence is reported as
the image-level score; equal confidence resolves to the more severe class.
Within each class the maximum detector confidence is reported. Scores are
detector confidences, not normalized probabilities. No retained boxes returns
`no_detection`, never `ND`.

⚠ **This replaced most-severe-wins on 2026-09-07 (user decision).** The old
rule was safety-conservative but made the badge disagree with the tallest bar
in the score panel — a TD verdict at 35.6% sitting under an HVD bar at 52.6%
read as a contradiction on screen. The accepted trade-off is that a
low-confidence total-damage region beside a high-confidence intact facade now
reports the FACADE's class, so the per-region boxes are what carry the severe
observation. `api/tests/test_damage_classes.py` enforces both the new rule and
the severity tiebreak. Rows written before this date keep their old verdict —
history is not migrated, so an old row can disagree with a fresh run of the
same photo.

⚠ **The image-level class is DERIVED, not predicted.** `raed` is task `detect`:
it emits a class per region. Aggregation turns those into one verdict. The photo
shows BOTH — a box per region in its own class colour, under one badge carrying
the aggregate — see the ops note on this, which explains how the two layers
differ, before changing either.

### Trained models

| id | What | Val accuracy |
| -- | ---- | ------------ |
| `raed` | **Trained Model** (YOLOv8s detector under the hood) | checkpoint-defined |
| `mock` | Deterministic four-class detector stand-in | — |

The public display name is **"Trained Model"**. The id `raed` and the persisted
`scale_version` value `raed4` are NOT display strings — they are written into
Supabase rows and used for routing, so they must never be renamed.

Neither row carries an accuracy number, and that is deliberate: `raed` is a
DETECTOR, so what the checkpoint records is precision/recall/mAP — see
`web/lib/evaluation.ts`. The "both figures are top-1 on a 146-image split"
sentence that used to sit here described the two retired CLASSIFIERS and was
removed on 2026-09-07. An older YOLO model scored 80.37% — a TWO-class split
with NC dropped, not comparable, and it must never be published. Weights live
outside the repo at `/home/mohrazzak/projects/graduation/` (`RAED_WEIGHTS_PATH`;
`RESNET_WEIGHTS_PATH` and `YOLO_WEIGHTS_PATH` went with the retired backends and
are referenced nowhere).

The serving detector is `raed_yolov8s_4class.pt` (22 MB, sha256 `a680e240…`),
copied there from the untracked reference clone on 2026-08-31 so nothing in the
repo tree is load-bearing. Its `model.names` are exactly
`No Damage / Slight,Moderate Damage / Heavy,Very Heavy Damage / Total Damage`,
which is why `validate_model_names` accepts it. `*.pt` is gitignored, and no
copy lives in the repo tree.

Its own recorded validation metrics — precision 0.350, recall 0.464,
mAP50 0.315, mAP50-95 0.190 — are what
`web/lib/evaluation.ts` publishes, alongside the run's full loss curves.
The run was CONFIGURED for 150 epochs at imgsz 800 but early-stopped at 55
(patience 30); the served weights are epoch 25, the mAP50-95 argmax, and every
published figure is that epoch's row — `web/tests/evaluation.test.mjs` enforces
it. "Trained for 150 epochs" describes a run that never happened. There is no
accuracy or confidence figure because the checkpoint records none and the
detection val split is not on this machine.
They are DETECTION metrics; the retired
classifier accuracies (74.66% / 71.23%, and an older two-class 80.37%) measured
different models with a different metric and must never be shown beside them.

`ENABLED_MODELS` controls the active roster; default is `raed`.
`scripts/dev-api.sh` also defaults to `raed`. `ENABLED_MODELS=mock` is what CI
and the cloud deploy use.

## Tech stack (FIXED — do not substitute)

- **web/**: Next.js (App Router) + TypeScript strict + Tailwind CSS, next-intl
  (`/en` + `/ar`, RTL), @supabase/supabase-js + @supabase/ssr, framer-motion,
  react-dropzone, lucide-react.
- **api/**: FastAPI (Python 3.11+), uvicorn, python-multipart, Pillow.
  Detection sits behind the `DetectorClassifier` protocol in
  `api/predict/damage_classes.py`; backends live in `api/predict/backends/`
  and are selected per request from `api/predict/registry.py`.
- **Supabase cloud**: email+password auth ONLY (no OAuth), `analyses` table,
  private storage bucket `analysis-images`. Schema: `supabase/schema.sql`.
- **Deploy**: `docker compose up` → web :3000 + api :8000.

## Repo map

```
docker-compose.yml
web/                    Next.js app
  app/[locale]/         pages: landing, analyze*, history*, how-it-works, login, register  (*=auth)
  components/{ui,analyze,history,layout,...}
  lib/damage-classes.ts THE ND/SMD/HVD/TD scale — single source of truth
  lib/evaluation.ts     measured DETECTION metrics + the run's full loss curves
  lib/types.ts          Prediction, Analysis (shared types)
  lib/api.ts            ONLY place that calls FastAPI (typed, timeout, errors)
  lib/artifactPersistence.mts  validated generated-artifact save lifecycle
  lib/signedArtifact.mts       race-safe History signing/retry state
  lib/supabase/         ONLY place that calls Supabase (client/server/queries)
  messages/{en,ar}.json ALL UI strings (zero hardcoded text in JSX)
  middleware.ts         next-intl + Supabase session refresh + auth guard
api/                    FastAPI app (main.py, schemas.py, tests/)
  predict/damage_classes.py active detector domain and severity aggregation
  predict/registry.py   backend roster, ENABLED_MODELS  (⚠ torch import order)
  predict/backends/     raed.py (the trained detector), mock_backend.py
  requirements-models.txt  optional heavy deps (torch, ultralytics)
  requirements-repair.txt  optional isolated Diffusers/ControlNet deps
  jobs/store.py         in-process job registry (single process, 30 min TTL)
  jobs/stages.py        LOCAL free stages: building mask, edge map
  jobs/repair.py        provider-neutral 2D restoration pipeline
  jobs/repair_providers.py  auto/local-controlnet/Gemini selection
  repair/controlnet_worker.py  isolated pinned CUDA worker
  jobs/model3d.py       3D reconstruction via Tripo -> GLB
supabase/schema.sql     run in Supabase dashboard (table + RLS + storage policies)
```

## Commands

```bash
# web (from web/)
npm run dev              # dev server :3000
npm test                 # built-in Node tests
# The storage-RLS test is the one that skips without credentials. With the local
# stack up it PASSES (43/43, verified 2026-08-31) given two confirmed users:
#   set -a; source .env.local; set +a
#   SUPABASE_TEST_OWNER_EMAIL=owner@damagescale.test \
#   SUPABASE_TEST_OWNER_PASSWORD=... \
#   SUPABASE_TEST_OTHER_EMAIL=other@damagescale.test \
#   SUPABASE_TEST_OTHER_PASSWORD=... npm test
# Create/repair those users via the local auth admin API with the service_role
# key (POST/PUT /auth/v1/admin/users, email_confirm:true).
npx tsc --noEmit         # type gate — must pass with ZERO errors
npm run build            # production build
npm run lint

# api (from api/, venv at api/.venv)
./scripts/dev-api.sh            # PREFERRED: sources root .env -> real model +
                                # generation keys + local ControlNet repair
uvicorn main:app --reload --port 8000   # bare, no env
ENABLED_MODELS=mock pytest -q   # must pass; mock roster keeps it off torch
pytest -q                       # full run, loads the real weights (slow)
ruff check .                    # must be clean
pip install -r requirements-models.txt   # optional: the real detector (torch)

# optional native local repair (stock Docker image intentionally excludes this)
/home/mohrazzak/projects/graduation/.venv/bin/python -m pip install -r requirements-repair.txt
LOCAL_REPAIR_PYTHON=/home/mohrazzak/projects/graduation/.venv/bin/python \
  REPAIR_BACKEND=local-controlnet uvicorn main:app --reload --port 8000

# full demo (repo root) — PREFERRED shortcut: supabase + real-model api + host web
./scripts/dev-all.sh              # start everything on :3000/:8000, then print URLs
./scripts/dev-all.sh --dev        # same, but `next dev` instead of a prod build
./scripts/dev-all.sh stop         # stop what it started (supabase stack stays up)
./scripts/dev-all.sh status|logs  # state table · tail .run/{web,api}.log

docker compose up        # web :3000 + api :8000 — NOTE: its web container cannot
                         # reach the local supabase stack (127.0.0.1:54321 is the
                         # container itself), so /analyze and /history bounce a
                         # logged-in user to /login. dev-all.sh stops it on purpose.
```

## API contract (four-class detector — frontend depends on it)

- `POST /predict?model=<id>` — multipart field `file` (jpeg/png/webp, ≤10 MB) →
  ```jsonc
  { "class_code": "ND"|"SMD"|"HVD"|"TD", "confidence": 0-1,
    "scores": {"ND": f, "SMD": f, "HVD": f, "TD": f},
    "detections": [{"class_code":"...","confidence":f,
      "box":{"x1":f,"y1":f,"x2":f,"y2":f}}],
    "model": {"id": "raed", "name": "Trained Model"} }
  ```
- `GET /models` → `{"models": [{id, name, accuracy, available, reason}]}`.
  Unavailable backends are LISTED with a reason key, never hidden.
- `GET /health` → `{"status": "ok", "mock": bool, "model": "<active id>"}`.
- Unknown `model` → 400. Registered but unloadable → **503** (valid request, the
  server just cannot serve that backend right now).
- No retained detection → HTTP 422 `{"detail":"no_detection"}`.
- Mock is deterministic: same image bytes → same result (hash-seeded RNG).
- CORS allows `http://localhost:3000` (+ university server origin via `CORS_ORIGINS`).

### Job routes (restoration + 3D)

- `POST /jobs/mask` — multipart `file`; produces raw grayscale `mask` + `edges`.
- `POST /jobs/repair` — multipart `file`, edited PNG `mask`, `class_code`
  (required), optional `prompt`. Unselected source pixels must remain unchanged.
- `POST /jobs/model3d` — multipart `file`, OR `from_job=<repair job id>` to
  reconstruct from the restored image instead of the original. Optional `boxes`
  (JSON array of normalized `{x1,y1,x2,y2}`) and an optional full-frame `mask`
  bound the building cut-out; both are hints, so a malformed one degrades the
  crop and never fails the run. Stages are
  `isolating → uploading → reconstructing → downloading`.
- `GET /jobs/{id}` includes backend monotonic `timing.elapsed_ms` and ordered
  `timing.stages[{key,status,elapsed_ms}]` in addition to status/artifacts.
- `GET /jobs/{id}/artifact/{name}` → raw bytes.
  Mask artifacts: `mask`, `edges`. Repair: `repaired`, `diff`. 3D: `model`.
- **`mask` and `edges` are produced LOCALLY and need no API quota** — they
  survive a dead quota, which is why the canvas still works when generation
  fails. `detail` on failure is a message KEY (`quota_exceeded`, `no_api_key`,
  …), translated in the frontend.
- A successful live `repaired` PNG or `model` GLB auto-attaches to the same
  Supabase analysis row as the classification. Paths are
  `{user_id}/{analysis_id}_repaired.png`, `{user_id}/{analysis_id}_before.glb`
  and `{user_id}/{analysis_id}_after.glb` — the 3D extension carries
  `_before`/`_after` because before- and after-reconstruction are two separate
  runs (`web/lib/supabase/artifacts.ts`). There is no bare `{analysis_id}.glb`.
  Pre-generated fixture branches must stay outside this persistence lifecycle.

This REPLACED the old frozen contract (`level` 0-5 + six-float array) —
a deliberate break, signed off, because code-keyed probabilities make the
alphabetical-index bug unwriteable.

## Code quality rules (NON-NEGOTIABLE, from spec §3)

- TS strict, **no `any`** anywhere. Shared types in `lib/types.ts`.
- Components: one responsibility, **< ~150 lines**, **named export**, explicit
  props interface. Server Components by default; `"use client"` only when needed.
- Supabase only via `lib/supabase/`; FastAPI only via `lib/api.ts` — never
  inside JSX components.
- No magic values — active class codes/colors/labels come from `lib/damage-classes.ts`.
- **Tailwind logical properties only**: `ms- me- ps- pe- text-start text-end
  start- end-`. NEVER `ml- mr- pl- pr- left- right-` (RTL must mirror free).
- Zero hardcoded UI strings in JSX — everything via `messages/*.json`
  (next-intl). Numbers/dates via next-intl formatters.
- Python: type hints everywhere, pydantic request/response models, ruff-clean,
  docstrings on public functions.
- Comments explain WHY, not what; 1–2 line purpose header on non-trivial files.
- A11y floor: visible keyboard focus, alt text, labeled inputs,
  `prefers-reduced-motion` gates EVERY animation (framer-motion
  `useReducedMotion` + CSS media query).
- Errors/empty states say what happened and what to do next — never apologetic.

## Design system ("structural assessment" instrument — spec §8)

- Palette tokens (Tailwind named colors): `bg #0C0C0E`, `surface #161619`,
  `line #2A2A2F`, `text #EDEDEF`, `muted #8B8B93`, `hazard #FFB000` (accent,
  CTAs, focus rings), `alert #FF3B30` (the TD class ONLY).
- Fonts: Archivo (display, uppercase), Inter (body), JetBrains Mono (ALL
  numbers/percentages/timestamps/tier codes), Cairo (ar).
- Signature motif: **THE SCALE** — 4-segment strip (`components/ui/DamageStrip`)
  reused in navbar logo, landing hero (animated), analyze result, history cards.
- Restraint: border radius ≤ 4px, hairline `line` borders, corner tick marks on
  key cards, film-grain ~3% overlay, ONE hazard-stripe (45°, 8px) used only on
  primary CTA top border + the TD banner. No glassmorphism, no gradients.
- Motion: analyze flow is the one orchestrated moment (scan line 1.2s loop,
  digit count-up, bars stagger 60ms); everything else 150–200ms fades only.
- Copy voice: technical inspection register, short ("HOW BADLY IS IT DAMAGED?").

## Supabase — local stack (current) and cloud re-provisioning

Development and the demo run against the local CLI stack:

```bash
supabase start                  # 54321 api · 54322 db · 54323 studio
supabase db reset               # (re)apply supabase/migrations + schema.sql
docker exec supabase_db_grad_proj psql -U postgres -d postgres -c '\dt public.*'
```

`web/.env.local` and the repo-root `.env` both point at `http://127.0.0.1:54321`.
`isSupabaseConfigured()` allows plaintext http ONLY for loopback hosts — a
remote http URL, `localhost.evil.com` included, is still rejected.

The cloud recipe below is kept for re-provisioning.

1. Create project → copy URL + anon key into `web/.env.local`
   (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
   `NEXT_PUBLIC_API_URL=http://localhost:8000`).
2. Run `supabase/schema.sql` in the SQL editor (analyses table + RLS + storage
   policies).
3. Create **private** bucket `analysis-images`. Files live at
   `{user_id}/{analysis_id}.jpg`, `{user_id}/{analysis_id}_heatmap.png`,
   `{user_id}/{analysis_id}_repaired.png`, `{user_id}/{analysis_id}_before.glb`
   and `{user_id}/{analysis_id}_after.glb`; frontend reads via signed URLs.
4. Auth → enable Email provider only; **disable email confirmation** (demo).
   On the local stack this is already the default, so registration completes
   without an email round-trip. Only a CLOUD project needs the dashboard toggle,
   where its built-in SMTP is rate-limited ~2/hr and rejects test domains.

## Ops notes for Claude sessions (hard-won, no secrets here)

- ⚠ **The photo carries per-region boxes AND one verdict badge. They are two
  different statements — do not "reconcile" them.** `raed` is task `detect`, so
  a box is a class for that REGION: a photo can legitimately carry an ND box
  beside a TD box. The badge is the image-level verdict: the class of the
  single HIGHEST-CONFIDENCE box among exactly those, stated to the same one
  decimal place as the result panel, and it is the only element carrying the
  class CODE. Since 2026-09-07 that badge always matches the tallest bar in the
  score panel — before then it did not, and users read the mismatch as a bug. Boxes were removed on 2026-09-02 precisely because N labelled
  boxes read as N competing answers; they are back as of 2026-09-06 (user
  decision) WITH the badge, which is what makes the relationship legible —
  boxes are the evidence, the badge is the verdict. If an examiner asks how the
  verdict is reached, the answer is "the region the detector was most
  confident about wins; ties go to the more severe class".
  `components/analyze/DetectionOverlay.tsx`, shared by analyze and the history
  modal, which reads the persisted `detections` jsonb.
- ⚠ **Box GEOMETRY uses physical `left`/`top`, and that is NOT a breach of the
  logical-properties rule.** `lib/detectionGeometry.ts` owns it. A box is a
  coordinate in the photo, not chrome: `inset-inline-start` resolves to `right`
  under `dir="rtl"` while the `<img>` pixels do NOT mirror, so a logical offset
  puts every box on the wrong side of the building in `/ar`. That bug shipped in
  both earlier overlays unnoticed — the 2026-09-02 verification checked that the
  BADGE mirrored, not that the boxes sat on buildings. The badge keeps its
  logical offset and does mirror. Same module clamps stored boxes (the history
  path type-checks a row's coordinates without range-checking them) and flips a
  label inside its box when it has no room above: `raed` returns near-full-frame
  boxes, so ALL FOUR samples detect at y1 < 0.04 (ND 0.032, SMD 0.002, HVD 0.000,
  TD 0.001) and an above-the-box label would be eaten by the figure's
  `overflow-hidden` — the inside branch is the normal case, not the fallback.
  `tests/detectionGeometry.test.mjs` is what turns red if any of this is
  "tidied" back.
- ⚠ **Tripo picks its own subject, so the building is cut out BEFORE upload.**
  `image_to_model` at the pinned `v2.5-20250123` has no background-removal,
  mask or foreground-ratio parameter (checked against the official SDK
  signature), so the uploaded image is the only lever. Sending a raw street
  photo made Tripo reconstruct whatever it judged most object-like: the
  2026-09-06 panorama run came back as a hallucinated blob whose texture atlas
  contains faces, not facades. `api/jobs/subject.py` now crops to the union of
  the detector boxes, mattes with the SegFormer silhouette and centers the
  result on a white RGBA ground filling ~89% of both axes — Tripo's documented
  condition for a pre-isolated subject. Two guards are load-bearing and
  measured, not guessed: the matte is skipped unless `stages.has_segmenter()`
  (the classical fallback is an edge map, which would punch holes through flat
  facades), and unless its coverage is within 0.30-0.95. The floor exists for
  total collapse — `sample-TD.jpg` segments to 0.185 and would have uploaded a
  fragment of the rubble field. `api/tests/test_subject.py` is what turns red.
- ⚠ **The YOLOv8m-seg run (`best2.pt` / `raed-seg`) was deleted, not lost.** It
  was wired briefly on 2026-09-02 and removed the same day: epoch 2 of a
  150-epoch schedule, worse on every box metric (mAP50 0.204 vs 0.315), and
  measured through the adapter it got 1 of 4 samples right — calling the
  *undamaged* building Total Damage. Do not re-add it from a backup. If a
  FINISHED seg run is exported later, the remap is positional
  (0→ND, 1→SMD, 2→HVD, 3→TD) and the adapter would need `result.masks`.
- ✅ **The TensorFlow/PyTorch segfault hazard no longer exists.** It was real:
  importing `ultralytics` after a Keras prediction killed the process (exit
  139), which is why `registry.py` used to import the whole torch stack at
  module load. TensorFlow left with the ResNet backend on 2026-09-02, so the
  ordering block and its subprocess guard were deleted. Do NOT reintroduce a
  TensorFlow backend without restoring both — read this file's git history first.
- Heavy model deps are in `api/requirements-models.txt`, deliberately NOT in
  `requirements.txt`: the base image and the free-tier deploy run the mock.
- The GPU is a GTX 1650 Ti (4 GB). The graduation training venv has CUDA-enabled
  torch, while `api/.venv` deliberately uses torch 2.12.1+cpu.
- The GTX 16xx / compute-capability 7.5 Diffusers path is **FP32 on purpose**.
  Pinned all-FP16 inference deterministically produced NaNs during VAE encode
  and ControlNet step 0. FP32 + sequential CPU offload + attention slicing was
  finite and used only 2,570 MiB peak. Other CUDA devices retain FP16/model
  offload. Do not remove this device policy as an "optimization."
- Real local-repair acceptance used pinned revisions in
  `repair/controlnet_worker.py`, the real SegFormer mask, Canny edges, tier PC,
  seed `1636597465`, and the safety checker. The 224×224 PNG was 95,579 bytes;
  no safety bypass or generated fixture was committed.
- Repair-fixture experiments with the long live prompt, the shorter reference
  prompt, and the reference roof-edge anchor all produced technically valid but
  visually misleading results (unrepaired collapse / hallucinated people).
  They remain under `/tmp/damagescale-repair-fixtures.HMAxet` only. Do not wire
  those paths or call them defense-ready restoration fixtures.

- Supabase SQL access: the direct `db.<ref>.supabase.co` host is IPv6-only and
  unreachable from this WSL2 box. Use the session pooler
  `aws-1-eu-north-1.pooler.supabase.com:5432`, user `postgres.<project-ref>`,
  via `docker run -i --rm -e PGPASSWORD=… postgres:17-alpine psql -h …`
  (password: ask the user; never commit it).
- `storage.objects` rows can NOT be SQL-deleted (protect trigger) — use the
  Storage API. Manually inserted `auth.users` need all token columns set to
  `''` (NULLs break GoTrue with "Database error querying schema").
- `NEXT_PUBLIC_*` are baked into the web image at BUILD time → after env
  changes run `docker compose up -d --build web`.
- **Demo samples are keyed by ACTIVE class code**, one per class:
  `sample-{ND,SMD,HVD,TD}.jpg`. Each was chosen by scoring the validation split
  with the detector itself and keeping an image it gets RIGHT, so a sample can
  never contradict the model on stage. `SampleStrip` iterates `DAMAGE_CLASSES`.
  The legacy `sample-{NC,PC,GC}.jpg` files were deleted with the tests that
  loaded them.
- **A model's display name never comes from the API response.** `/predict`
  returns an English-only `model.name`, and Supabase stores only `model_id`, so
  both surfaces resolve through `useModelName()` against `models.names.<id>` in
  `messages/*.json`. Rendering `prediction.model.name` leaks English into `/ar`;
  rendering `analysis.model_id` shows the raw `raed`. Note `models.*` also holds
  the picker's failure reasons — that is why the names are NESTED under
  `models.names`, so an id can never collide with a reason key.
- ⚠ **next-intl resolves message keys at RUNTIME.** Neither `tsc` nor `eslint`
  catches a deleted or renamed message key; only the browser does. Editing
  `messages/*.json` by re-serializing with `json.dump` also silently reformats
  the file — edit it textually and diff before committing.
- Browser verification: no Playwright in the repo; a working setup lives at
  `/tmp/e2e` (recreate: `npm i playwright`, then drive snap chromium over CDP —
  launch `/snap/bin/chromium --headless=new --no-sandbox --remote-debugging-port=9222
  --user-data-dir=$HOME/.cache/cdp-profile` and `connectOverCDP`). Snap
  chromium CANNOT write screenshots to `/tmp` — use paths under `$HOME`. Add
  `--virtual-time-budget=15000` for settled full-page screenshots. Playwright's
  own bundled chromium is missing system libs (no sudo available).
  ⚠ Launch chromium with `setsid ... < /dev/null &`: started as a plain
  background job it dies with exit 144 when the calling shell exits. Rebuild the
  harness with `mkdir -p /tmp/e2e && cd /tmp/e2e && npm i playwright`, then
  `chromium.connectOverCDP("http://127.0.0.1:9222")`. History cards are
  `<button>`s that open a modal, not links — click by text, not `main a`.
- 2026-08-18 browser proof is intentionally split: the English end-to-end run
  mocked only Gemini/Tripo job artifacts but used live Supabase auth/storage/DB,
  proving one row receives both paths and History reloads them. Arabic at 390 px
  was fixture-backed/read-only, proved full RTL content and no overflow, but is
  not a second live-persistence claim. See `HANDOFF.md` for evidence paths.
- Pre-existing deployment risk: job create/poll/artifact routes are not bearer-
  owned or rate-limited. `git blame dcd36fa -- api/main.py` attributes them to
  pre-branch commit `4285bc77`; fixing ownership is a separate API/client design.
- ⚠ The reference clone `A-Smart-Site-For-Rehabilitating-Damaged-Buildings/`
  was deleted from this machine on 2026-09-02 (unreferenced by any code; the 3D
  work was already ported into `api/jobs/model3d.py`). It is re-clonable from
  `git@github.com:RaedSa1em/…`. **Its `ai/generate_3d_fast.py` contains a
  hardcoded API credential that is still live and still needs rotating** —
  deleting the local copy did not revoke it. Never commit or print the value.
- `gh` IS installed (`~/.local/bin/gh`) and the repo HAS a remote:
  `origin git@github-mohrazzak:mohrazzak/graduation.git`, a **private** GitHub
  repo carrying `main` and `feat/three-tier-pipeline`. Corrected 2026-09-07 —
  the older "no gh, no remote" note was stale.
- next-intl: array messages are read with `t.raw("key") as string[]`. Tailwind
  v4 native utilities like `aspect-3/2` / `grayscale-60` work — verify in built
  CSS when in doubt.

## Definition of Done (spec §11)

- [ ] `npx tsc --noEmit` passes, zero `any`.
- [ ] Full flow works in BOTH `/en` and `/ar`; Arabic mirrors perfectly.
- [ ] Register → analyze sample → animated result → auto-saved → in history →
      survives logout/login.
- [ ] Same photo always yields the same result for a given model.
- [ ] The analyzed photo draws one box per detection in its own class colour
      under one verdict badge, and the boxes land on the building in `/ar` too.
- [ ] Each `sample-<CODE>.jpg` is verdicted as its own class by the detector
      (ND 0.639 / SMD 0.642 / HVD 0.537 / TD 0.576, measured 2026-08-31,
      re-verified unchanged 2026-09-07 under the highest-confidence rule —
      each sample detects a single class, so the rule change is a no-op here).
- [ ] Keyboard-only navigation works; reduced-motion disables animations.
- [ ] Looks incredible at 390px and 1440px.
- [ ] One-command demo: `docker compose up`.

## Implemented service notes and remaining stretch work

- **Job API** — repair and 3D take 10 s to 3 min, so both run as polled jobs
  (`POST /jobs/{service}` → id, `GET /jobs/{id}` → status + stage + artifacts).
- **2D repair** — SegFormer building mask + Canny edges (both real artifacts the
  UI displays), then local mask-conditioned ControlNet or Gemini fallback, then
  the before/after diff. NO hand-drawn mask editor for Gemini: its instruction
  editing cannot honor one, while the local provider receives the generated
  building mask directly.
- **3D** — Tripo AI (upload → task → poll → GLB with PBR), viewed with
  `@google/model-viewer`.
- **Grad-CAM** — NOT implemented, and the old plan (`tf.GradientTape` on the
  ResNet) died with that backend. A detector needs a different technique
  entirely. `heatmap_base64` is null and every heatmap affordance hides itself,
  which is the honest state.

Out of scope entirely: OccFacade, cost estimation, the Depth Anything point
cloud.
