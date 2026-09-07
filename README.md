# DamageScale

AI building-damage assessment (graduation project): upload a building photo,
get one of four destruction classes with detector confidences, then reconstruct
the damaged area in 2D and generate 3D models before and after. Saved to your
personal history. English + Arabic (full RTL).

> The model **is trained**. A YOLOv8s detector locates buildings and classifies
> each one; the image-level verdict is the class of the region the detector
> scored highest, so the badge always matches the tallest bar in the panel. A
> deterministic mock backend serves CI and the Docker image, which ship without
> the weights.

| Code  | English                  | Arabic                | Color     |
| ----- | ------------------------ | --------------------- | --------- |
| `ND`  | No Damage                | بلا ضرر               | `#52C77B` |
| `SMD` | Slight / Moderate Damage | ضرر طفيف / متوسط      | `#F2C94C` |
| `HVD` | Heavy / Very Heavy       | ضرر شديد / شديد جداً  | `#F28C28` |
| `TD`  | Total Damage             | ضرر كلي               | `#FF3B30` |

## Architecture

```
Browser ──:3000──> web   (Next.js App Router, /en + /ar)
   │                │
   │                └──> Supabase cloud  (email+password auth, analyses table,
   │                                      private storage bucket, RLS)
   └────:8000─────> api  (FastAPI: /predict, /models, /health, /jobs/*)
```

The **browser** talks to the API directly — the web container never proxies
prediction traffic. That is why `NEXT_PUBLIC_API_URL` must be a host-reachable
origin (see [docker-compose.yml](docker-compose.yml)).

## Prerequisites

- Docker with the Compose plugin (one-command demo), **or** for local dev:
- Node.js 20.9+ (22 recommended) and Python 3.12+
- A free [Supabase](https://supabase.com) project (auth/history; the analyze
  flow degrades to "not configured" errors without it)

## One-command demo

```bash
cp .env.example .env    # fill in the two Supabase values (optional but recommended)
docker compose up
```

- Web: <http://localhost:3000> (redirects to `/en`; Arabic at `/ar`)
- API: <http://localhost:8000/health>

Without a `.env`, compose falls back to safe defaults: the app runs against
the mock API, and auth/history show translated "Supabase not configured"
messages instead of crashing.

`NEXT_PUBLIC_*` values are baked into the web bundle **at image build time**,
so after editing `.env` rebuild with `docker compose up --build`.

## Live deployment (free tier)

| Piece | Where | URL |
| ----- | ----- | --- |
| Web (Next.js) | Vercel | https://project.razzak.me |
| API (FastAPI, mock roster) | Render free | https://graduation-3cr9.onrender.com |
| Auth + DB + storage | Supabase cloud | — |

Production env: Vercel holds `NEXT_PUBLIC_SUPABASE_URL`,
`NEXT_PUBLIC_SUPABASE_ANON_KEY`, and `NEXT_PUBLIC_API_URL` (the Render URL);
Render holds `ENABLED_MODELS=mock` and `CORS_ORIGINS=https://project.razzak.me`.
Render's repo settings: Dockerfile path `./Dockerfile` (the root-context
[Dockerfile](Dockerfile) built for Render), root directory empty.

**Free-tier note:** Render spins the API down after ~15 idle minutes; the
first request then takes ~50 s. The web app pings `/health` automatically on
every page load (`components/layout/ApiWarmup.tsx`), so the API usually wakes
while the visitor is still reading — for demo day, open the site a minute
before presenting. The API is demo-grade: no rate limiting or auth on
`/predict`.

## Deploy on a VPS

[docker-compose.prod.yml](docker-compose.prod.yml) is a self-contained
production stack: web + api + a [Caddy](https://caddyserver.com) reverse proxy
that terminates HTTPS with automatic Let's Encrypt certificates
([deploy/Caddyfile](deploy/Caddyfile)).

1. Point **DNS A records** for both hostnames (e.g. `project.example.com` and
   `api.example.com`) at the VPS IP. Cloudflare users: keep the orange-cloud
   proxy **OFF** (DNS only) at least until the first certificate issues.
2. Open ports **80** and **443** on the VPS firewall.
3. Configure the environment:

   ```bash
   cp .env.example .env
   ```

   Fill in the Supabase URL + anon key, then set:

   ```bash
   NEXT_PUBLIC_API_URL=https://<DOMAIN_API>   # e.g. https://api.example.com
   CORS_ORIGINS=https://<DOMAIN_WEB>          # e.g. https://project.example.com
   DOMAIN_WEB=<your web hostname>
   DOMAIN_API=<your api hostname>
   ```

4. Launch:

   ```bash
   docker compose -f docker-compose.prod.yml up -d --build
   ```

Notes:

- web and api publish **no host ports** — Caddy is the only public entrypoint
  and proxies to them over the internal compose network.
- `NEXT_PUBLIC_*` values are baked into the web bundle **at build time**:
  after changing any of them, rebuild with
  `docker compose -f docker-compose.prod.yml up -d --build`.

## Supabase setup (one-time, dashboard)

1. Create a project at <https://supabase.com/dashboard> and copy the
   **Project URL** and **anon (public) key** (Project Settings → API) into
   `.env` (docker) and/or `web/.env.local` (local dev).
2. Open the **SQL Editor**, paste the whole of
   [supabase/schema.sql](supabase/schema.sql), and run it (analyses table +
   RLS + storage policies).
3. Storage → create a **private** bucket named exactly `analysis-images`.
4. Auth → Providers → enable **Email** only; **disable email confirmation**
   so demo registration works instantly.

## Local development

Web (from `web/`):

```bash
cd web
cp .env.example .env.local   # fill in Supabase URL + anon key
npm install
npm run dev                  # http://localhost:3000
```

API (from `api/`):

```bash
cd api
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt -r requirements-dev.txt
ENABLED_MODELS=mock .venv/bin/uvicorn main:app --reload --port 8000
# or, with the real weights and generation keys from the root .env:
../scripts/dev-api.sh
```

### Optional native CUDA repair backend

Real local ControlNet repair is supported when the API runs natively on a
Linux CUDA host. Keep its heavyweight environment outside this repository and
separate from the base API environment. Replace the example absolute path with
a writable location for the API service user:

```bash
REPAIR_VENV_PATH=/opt/damagescale/venvs/repair
python3 -m venv "$REPAIR_VENV_PATH"
"$REPAIR_VENV_PATH/bin/python" -m pip install --upgrade pip
"$REPAIR_VENV_PATH/bin/python" -m pip install \
  --index-url https://download.pytorch.org/whl/cu130 \
  torch==2.12.0+cu130
"$REPAIR_VENV_PATH/bin/python" -m pip install -r api/requirements-repair.txt
```

Start the lightweight API process with the external interpreter selected:

```bash
cd api
REPAIR_BACKEND=local-controlnet \
LOCAL_REPAIR_PYTHON=/opt/damagescale/venvs/repair/bin/python \
LOCAL_REPAIR_TIMEOUT_SECONDS=900 \
.venv/bin/uvicorn main:app --reload --port 8000
```

`LOCAL_REPAIR_PYTHON` may be blank to select the documented
`api/.venv-repair/bin/python` default; every nonblank value must be absolute.
The first run downloads the pinned model weights and can take several minutes.
Linux workers serialize model loading and inference through an owner-only host
file lock so concurrent API processes do not occupy the 4 GB GPU together.

Both Compose files forward `REPAIR_BACKEND`, `LOCAL_REPAIR_PYTHON`, and
`LOCAL_REPAIR_TIMEOUT_SECONDS`, but the stock API image intentionally contains
neither CUDA Torch nor the optional model dependencies and does not mount a GPU
or external environment. Its supported behavior is `auto`/Gemini fallback (or
an honest local-dependency error when local mode is forced). Use the native API
setup above for real local ControlNet execution; do not put API keys or model
tokens in the repository.

Quality gates (all must pass):

```bash
cd web && npx tsc --noEmit && npm run lint && npm run build
cd api && .venv/bin/pytest -q && .venv/bin/ruff check .
```

## Project structure

```
docker-compose.yml        one-command demo (web :3000 + api :8000)
.env.example              compose env template (Supabase + API URL + CORS)
web/                      Next.js app (TypeScript strict, Tailwind, next-intl)
  app/[locale]/           landing, analyze*, history*, how-it-works, login, register  (*=auth)
  components/             ui, analyze, history, landing, layout, auth, how-it-works
  lib/damage-classes.ts   single source of truth for the ND/SMD/HVD/TD scale
  lib/api.ts              ONLY place that calls FastAPI
  lib/apiContract.ts      validates untrusted API responses (pure, no fetch)
  lib/supabase/           ONLY place that calls Supabase (client/server/queries)
  messages/{en,ar}.json   ALL UI strings (zero hardcoded text in JSX)
  public/samples/         4 sample photos — one per class, each verified correct
api/                      FastAPI app
  main.py                 CORS + /health + /models + /predict + /jobs/*
  predict/damage_classes.py  the domain: codes, boxes, severity aggregation
  predict/registry.py     which backends exist and which are enabled
  predict/backends/       raed.py (the trained detector), mock_backend.py
  jobs/, repair/          polled restoration + 3D reconstruction
supabase/schema.sql       run once in the Supabase SQL editor
```

## The model roster

`ENABLED_MODELS` selects which backends the API offers:

- `raed` — the trained YOLOv8s detector. Needs `RAED_WEIGHTS_PATH` pointing at
  a checkpoint outside the repo. This is what the demo runs.
- `mock` — a deterministic stand-in that hash-seeds an RNG from the uploaded
  bytes, so **the same photo always returns the same result**. CI, the Docker
  image and the free-tier deploy run this, because none of them ship the
  weights or the ~1 GB torch stack.

Both emit the identical `/predict` contract, so nothing in the frontend knows
or cares which one answered.

## Definition of Done — status

- [x] `npx tsc --noEmit` passes, zero `any`
- [x] Same photo always yields the same result for a given model (pytest-covered)
- [x] Each `sample-<CODE>.jpg` is verdicted as its own class by the detector
- [x] Keyboard-only navigation works; reduced-motion disables animations
- [x] `/en` and `/ar` fully translated; Arabic mirrors via logical properties
- [x] One-command demo: `docker compose up`
- [ ] Register → analyze → auto-save → history → survives logout/login —
      implemented end-to-end, but verifying it live requires the one-time
      [Supabase setup](#supabase-setup-one-time-dashboard) above
