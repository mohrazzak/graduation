# DamageScale

AI building-damage classifier (graduation project): upload a building photo,
get one of six damage levels with confidence scores and a heatmap, saved to
your personal history. English + Arabic (full RTL).

> The model is **not trained yet** — the API runs in deterministic mock mode
> (`MOCK_MODE=true`). The real model plugs into `api/predict/model.py` later
> with zero frontend changes.

| Level | English           | Arabic      | Color     |
| ----- | ----------------- | ----------- | --------- |
| 0     | Intact            | سليم        | `#22C55E` |
| 1     | Minor damage      | ضرر طفيف    | `#A3E635` |
| 2     | Moderate damage   | ضرر متوسط   | `#FACC15` |
| 3     | Severe damage     | ضرر بالغ    | `#F97316` |
| 4     | Partial collapse  | انهيار جزئي | `#EF4444` |
| 5     | Total destruction | دمار كامل   | `#991B1B` |

## Architecture

```
Browser ──:3000──> web   (Next.js App Router, /en + /ar)
   │                │
   │                └──> Supabase cloud  (email+password auth, analyses table,
   │                                      private storage bucket, RLS)
   └────:8000─────> api  (FastAPI: POST /predict, GET /health — mock or model)
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
MOCK_MODE=true .venv/bin/uvicorn main:app --reload --port 8000
```

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
  lib/levels.ts           single source of truth for the 0-5 scale
  lib/api.ts              ONLY place that calls FastAPI
  lib/supabase/           ONLY place that calls Supabase (client/server/queries)
  messages/{en,ar}.json   ALL UI strings (zero hardcoded text in JSX)
  public/samples/         6 sample photos — each mock-classifies as its level
api/                      FastAPI app
  main.py                 CORS + GET /health + POST /predict
  predict/interface.py    predict(image_bytes) -> Prediction seam
  predict/mock.py         deterministic hash-seeded mock (MOCK_MODE=true)
  predict/model.py        placeholder for the real model + Grad-CAM
supabase/schema.sql       run once in the Supabase SQL editor
```

## Mock mode and the real model

With `MOCK_MODE=true` the API seeds an RNG with a hash of the uploaded bytes,
so **the same photo always returns the same level** — demos feel real and are
repeatable. The six images in `web/public/samples/` are pre-tuned so sample
`level-N.jpg` classifies as level N.

When the model is trained, implement `predict()` in `api/predict/model.py`
behind the existing interface (Grad-CAM overlay as base64 PNG), set
`MOCK_MODE=false`, restart the API. **No frontend change.**

## Definition of Done — status

- [x] `npx tsc --noEmit` passes, zero `any`
- [x] Same photo always yields the same mock result (pytest-covered)
- [x] Keyboard-only navigation works; reduced-motion disables animations
- [x] `/en` and `/ar` fully translated; Arabic mirrors via logical properties
- [x] One-command demo: `docker compose up`
- [ ] Register → analyze → auto-save → history → survives logout/login —
      implemented end-to-end, but verifying it live requires the one-time
      [Supabase setup](#supabase-setup-one-time-dashboard) above
