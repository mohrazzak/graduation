# DamageScale — AI Building-Damage Classifier (Graduation Project)

Demo web app: users register, upload a building photo, Raed's trained detector
locates buildings and assesses one of four destruction classes, then users can
select the exact area to reconstruct in 2D and explicitly generate independent
3D models before rebuilding and after reconstruction.

**Raed's model IS trained.** It is the only active product model. Legacy PHI-3
classifier source remains in the repository for historical compatibility but
is not exposed by the active roster. A deterministic four-class mock remains
for tests and environments without weights.

**Build status (2026-08-23):** four-class Raed detection, normalized boxes,
truthful no-detection handling, editable selective masks, backend-measured job
timings, versioned legacy history, and explicit before/after Tripo 3D runs are
implemented on `feat/four-class-selective-reconstruction`.
Supabase is re-provisioned (the old project was deleted) and the full
register→analyze→save→history flow is browser-verified in both locales.

**TensorFlow is installed; the ResNet runs for real.** Verified through the API:
sample-NC → NC 96.5%, sample-PC → PC 71.9%, sample-GC → GC 98.8%. `ultralytics`
is NOT installed — its opencv dependency (61–74 MB) will not finish downloading
on this connection, so `yolo-cls` reports `dependency_missing` and the picker
shows it disabled. Everything else about YOLO is done (retrained weights, the
backend, its tests).

Generation-service balances are external and must be checked live. Never
auto-start Tripo: both before and after are explicit user actions because each
run consumes credit. Mask preparation is local and may start automatically.

Still pending on the user: disable "Confirm email" in the Supabase dashboard
(registration is blocked by the ~2/hour built-in SMTP limit until then), fund or
wait out the two API quotas, and fill the footer university/supervisor names.

Authoritative documents — read before changing anything:

- **Current spec (follow this):** [docs/superpowers/specs/2026-08-23-four-class-selective-reconstruction-design.md](docs/superpowers/specs/2026-08-23-four-class-selective-reconstruction-design.md)
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
`api/predict/damage_classes.py`. Legacy `tiers.*` is history-only.

Aggregation is conservative: the most severe retained detection wins; within
each class the maximum detector confidence is reported. Scores are detector
confidences, not normalized probabilities. No retained boxes returns
`no_detection`, never `ND`.

### Trained models

| id | What | Val accuracy |
| -- | ---- | ------------ |
| `raed` | YOLOv8s Building Damage Detector | checkpoint-defined |
| `mock` | Deterministic four-class detector stand-in | — |

Both figures are top-1 on the same 146-image validation split. An older YOLO
model scored 80.37% — that was a TWO-class split with NC dropped, is not
comparable, and must never be published. Weights live outside the repo at
`/home/mohrazzak/projects/graduation/` (`RESNET_WEIGHTS_PATH`,
`YOLO_WEIGHTS_PATH`, `RAED_WEIGHTS_PATH`).

`ENABLED_MODELS` controls the active roster; default is `raed`.
`ENABLED_MODELS=mock` is what CI and the cloud deploy use.

## Tech stack (FIXED — do not substitute)

- **web/**: Next.js (App Router) + TypeScript strict + Tailwind CSS, next-intl
  (`/en` + `/ar`, RTL), @supabase/supabase-js + @supabase/ssr, framer-motion,
  react-dropzone, lucide-react.
- **api/**: FastAPI (Python 3.11+), uvicorn, python-multipart, Pillow.
  Classification sits behind the `Classifier` protocol in
  `api/predict/interface.py`; concrete backends live in `api/predict/backends/`
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
  lib/damage-classes.ts active ND/SMD/HVD/TD scale (`tiers.ts` is legacy)
  lib/evaluation.ts     measured accuracy, confusion matrices, dataset splits
  lib/types.ts          Prediction, Analysis (shared types)
  lib/api.ts            ONLY place that calls FastAPI (typed, timeout, errors)
  lib/supabase/         ONLY place that calls Supabase (client/server/queries)
  messages/{en,ar}.json ALL UI strings (zero hardcoded text in JSX)
  middleware.ts         next-intl + Supabase session refresh + auth guard
api/                    FastAPI app (main.py, schemas.py, tests/)
  predict/damage_classes.py active detector domain and severity aggregation
  predict/registry.py   backend roster, ENABLED_MODELS  (⚠ torch import order)
  predict/backends/     resnet.py, yolo.py, raed.py, mock_backend.py
  requirements-models.txt  optional heavy deps (TensorFlow, torch, ultralytics)
  jobs/store.py         in-process job registry (single process, 30 min TTL)
  jobs/stages.py        LOCAL free stages: building mask, edge map
  jobs/repair.py        2D restoration pipeline (Gemini for the generate step)
  jobs/model3d.py       3D reconstruction via Tripo -> GLB
supabase/schema.sql     run in Supabase dashboard (table + RLS + storage policies)
```

## Commands

```bash
# web (from web/)
npm run dev              # dev server :3000
npx tsc --noEmit         # type gate — must pass with ZERO errors
npm run build            # production build
npm run lint

# api (from api/, venv at api/.venv)
uvicorn main:app --reload --port 8000
ENABLED_MODELS=mock pytest -q   # must pass; mock roster keeps it off TensorFlow
pytest -q                       # full run, loads the real weights (slow)
ruff check .                    # must be clean
pip install -r requirements-models.txt   # optional: the real classifiers (~3 GB)

# full demo (repo root)
docker compose up        # web :3000 + api :8000
```

## API contract (four-class detector — frontend depends on it)

- `POST /predict?model=<id>` — multipart field `file` (jpeg/png/webp, ≤10 MB) →
  ```jsonc
  { "class_code": "ND"|"SMD"|"HVD"|"TD", "confidence": 0-1,
    "scores": {"ND": f, "SMD": f, "HVD": f, "TD": f},
    "detections": [{"class_code":"...","confidence":f,
      "box":{"x1":f,"y1":f,"x2":f,"y2":f}}],
    "model": {"id": "raed", "name": "YOLOv8s Building Damage Detector"} }
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
  reconstruct from the restored image instead of the original.
- `GET /jobs/{id}` includes backend monotonic `timing.elapsed_ms` and ordered
  `timing.stages[{key,status,elapsed_ms}]` in addition to status/artifacts.
- `GET /jobs/{id}/artifact/{name}` → raw bytes.
  Mask artifacts: `mask`, `edges`. Repair: `repaired`, `diff`. 3D: `model`.
- **`mask` and `edges` are produced LOCALLY and need no API quota** — they
  survive a dead quota, which is why the canvas still works when generation
  fails. `detail` on failure is a message KEY (`quota_exceeded`, `no_api_key`,
  …), translated in the frontend.

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
  CTAs, focus rings), `alert #FF3B30` (levels 4–5 ONLY).
- Fonts: Archivo (display, uppercase), Inter (body), JetBrains Mono (ALL
  numbers/percentages/timestamps/tier codes), Cairo (ar).
- Signature motif: **THE SCALE** — 4-segment strip (`components/ui/DamageStrip`)
  reused in navbar logo, landing hero (animated), analyze result, history cards.
- Restraint: border radius ≤ 4px, hairline `line` borders, corner tick marks on
  key cards, film-grain ~3% overlay, ONE hazard-stripe (45°, 8px) used only on
  primary CTA top border + the GC banner. No glassmorphism, no gradients.
- Motion: analyze flow is the one orchestrated moment (scan line 1.2s loop,
  digit count-up, bars stagger 60ms); everything else 150–200ms fades only.
- Copy voice: technical inspection register, short ("HOW BADLY IS IT DAMAGED?").

## Supabase setup (DONE 2026-06-12 — keep for re-provisioning)

1. Create project → copy URL + anon key into `web/.env.local`
   (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
   `NEXT_PUBLIC_API_URL=http://localhost:8000`).
2. Run `supabase/schema.sql` in the SQL editor (analyses table + RLS + storage
   policies).
3. Create **private** bucket `analysis-images`. Files live at
   `{user_id}/{analysis_id}.jpg` and `{user_id}/{analysis_id}_heatmap.png`;
   frontend reads via signed URLs.
4. Auth → enable Email provider only; **disable email confirmation** (demo) —
   ⚠ the ONE step still pending; until flipped, UI registration dead-ends on
   email verification (built-in SMTP is rate-limited ~2/hr and rejects test
   domains).

## Ops notes for Claude sessions (hard-won, no secrets here)

- ⚠ **TensorFlow + PyTorch coexistence is order-dependent and it SEGFAULTS.**
  Importing `ultralytics` AFTER a Keras prediction kills the process (exit 139).
  Importing it BEFORE any TensorFlow use is safe in either direction.
  `api/predict/registry.py` imports the whole torch stack at module load for
  exactly this reason — do not "tidy" those imports. Importing `torch` alone is
  NOT enough. `api/tests/test_backend_coexistence.py` guards it in a subprocess,
  since a dead process cannot be caught in-process.
- Heavy model deps are in `api/requirements-models.txt`, deliberately NOT in
  `requirements.txt`: the base image and the free-tier deploy run the mock.
  Installing them pulls ~3 GB of CUDA wheels.
- The GPU is a GTX 1650 Ti (4 GB); `torch.cuda.is_available()` is true, but
  TensorFlow does not see CUDA drivers here and runs the ResNet on CPU.

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
- Browser verification: no Playwright in the repo; a working setup lives at
  `/tmp/e2e` (recreate: `npm i playwright`, then drive snap chromium over CDP —
  launch `/snap/bin/chromium --headless=new --no-sandbox --remote-debugging-port=9222
  --user-data-dir=$HOME/.cache/cdp-profile` and `connectOverCDP`). Snap
  chromium CANNOT write screenshots to `/tmp` — use paths under `$HOME`. Add
  `--virtual-time-budget=15000` for settled full-page screenshots. Playwright's
  own bundled chromium is missing system libs (no sudo available).
- `gh` CLI is not installed; the repo has no git remote yet (will gain one for
  Vercel/Render deployment).
- next-intl: array messages are read with `t.raw("key") as string[]`. Tailwind
  v4 native utilities like `aspect-3/2` / `grayscale-60` work — verify in built
  CSS when in doubt.

## Definition of Done (spec §11)

- [ ] `npx tsc --noEmit` passes, zero `any`.
- [ ] Full flow works in BOTH `/en` and `/ar`; Arabic mirrors perfectly.
- [ ] Register → analyze sample → animated result → auto-saved → in history →
      survives logout/login.
- [ ] Same photo always yields the same result for a given model.
- [ ] Switching models mid-session does NOT kill the API (segfault guard).
- [ ] ResNet classifies `web/public/samples/sample-PC.jpg` as PC.
- [ ] Keyboard-only navigation works; reduced-motion disables animations.
- [ ] Looks incredible at 390px and 1440px.
- [ ] One-command demo: `docker compose up`.

## Later (phases 2-4 — see the restore-pipeline spec)

- **Job API** — repair and 3D take 10 s to 3 min, so both run as polled jobs
  (`POST /jobs/{service}` → id, `GET /jobs/{id}` → status + stage + artifacts).
- **2D repair** — SegFormer building mask + Canny edges (both real artifacts the
  UI displays), then Gemini 2.5 Flash Image instruction editing, then the
  before/after diff. NO hand-drawn mask editor: instruction editing cannot honor
  a mask, and shipping a canvas whose strokes are discarded would be a lie.
- **3D** — Tripo AI (upload → task → poll → GLB with PBR), viewed with
  `@google/model-viewer`.
- **Grad-CAM** — ~30 lines of `tf.GradientTape` on the ResNet's last conv block,
  reusing the existing overlay path. Until it lands, `heatmap_base64` is null
  and every heatmap affordance hides itself.

Out of scope entirely: OccFacade, cost estimation, the Depth Anything point
cloud.
