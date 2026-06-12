# DamageScale — AI Building-Damage Classifier (Graduation Project)

Demo web app: users register, upload a building photo, an AI model classifies it
into one of six damage levels with confidence scores and a Grad-CAM heatmap, and
the result is saved to the user's personal history.

**The model is NOT trained yet.** Everything runs against a mock prediction
endpoint (`MOCK_MODE=true`). The real model plugs into `api/predict/model.py`
later with ZERO frontend changes.

Authoritative documents — read before changing anything:

- Spec (follow exactly): [docs/superpowers/specs/2026-06-12-damagescale-design.md](docs/superpowers/specs/2026-06-12-damagescale-design.md)
- Implementation plan: [docs/superpowers/plans/2026-06-12-damagescale.md](docs/superpowers/plans/2026-06-12-damagescale.md)

## The six damage levels (the core domain)

| Level | English           | Arabic       | Ramp color |
| ----- | ----------------- | ------------ | ---------- |
| 0     | Intact            | سليم         | `#22C55E`  |
| 1     | Minor damage      | ضرر طفيف     | `#A3E635`  |
| 2     | Moderate damage   | ضرر متوسط    | `#FACC15`  |
| 3     | Severe damage     | ضرر بالغ     | `#F97316`  |
| 4     | Partial collapse  | انهيار جزئي  | `#EF4444`  |
| 5     | Total destruction | دمار كامل    | `#991B1B`  |

Single source of truth in code: `web/lib/levels.ts` (`DAMAGE_LEVELS`). Never
hardcode level colors/names anywhere else. Levels 4–5 are "alert" levels (red
hazard-stripe banner treatment; `alert` color reserved for them only).

## Tech stack (FIXED — do not substitute)

- **web/**: Next.js (App Router) + TypeScript strict + Tailwind CSS, next-intl
  (`/en` + `/ar`, RTL), @supabase/supabase-js + @supabase/ssr, framer-motion,
  react-dropzone, lucide-react.
- **api/**: FastAPI (Python 3.11+), uvicorn, python-multipart, Pillow.
  Prediction sits behind `predict(image_bytes) -> Prediction` in
  `api/predict/interface.py`; `mock.py` (deterministic, hash-seeded) vs
  `model.py` (future real model) chosen by `MOCK_MODE`.
- **Supabase cloud**: email+password auth ONLY (no OAuth), `analyses` table,
  private storage bucket `analysis-images`. Schema: `supabase/schema.sql`.
- **Deploy**: `docker compose up` → web :3000 + api :8000.

## Repo map

```
docker-compose.yml
web/                    Next.js app
  app/[locale]/         pages: landing, analyze*, history*, how-it-works, login, register  (*=auth)
  components/{ui,analyze,history,layout,...}
  lib/levels.ts         single source of truth for the 0-5 scale
  lib/types.ts          Prediction, Analysis (shared types)
  lib/api.ts            ONLY place that calls FastAPI (typed, timeout, errors)
  lib/supabase/         ONLY place that calls Supabase (client/server/queries)
  messages/{en,ar}.json ALL UI strings (zero hardcoded text in JSX)
  middleware.ts         next-intl + Supabase session refresh + auth guard
api/                    FastAPI app (main.py, schemas.py, predict/, tests/)
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
pytest -q                # must pass
ruff check .             # must be clean

# full demo (repo root)
docker compose up        # web :3000 + api :8000
```

## API contract (frozen — frontend depends on it)

- `POST /predict` — multipart field `file` (jpeg/png/webp, ≤10 MB) →
  `{"level": 0-5, "confidence": 0-1, "probabilities": [6 floats ≈ sum 1], "heatmap_base64": "<png>"|null}`;
  errors 400/500 → `{"detail": "..."}`.
- `GET /health` → `{"status": "ok", "mock": true|false}`.
- Mock is deterministic: same image bytes → same result (hash-seeded RNG).
- CORS allows `http://localhost:3000` (+ university server origin via `CORS_ORIGINS`).

## Code quality rules (NON-NEGOTIABLE, from spec §3)

- TS strict, **no `any`** anywhere. Shared types in `lib/types.ts`.
- Components: one responsibility, **< ~150 lines**, **named export**, explicit
  props interface. Server Components by default; `"use client"` only when needed.
- Supabase only via `lib/supabase/`; FastAPI only via `lib/api.ts` — never
  inside JSX components.
- No magic values — damage levels/colors/labels come from `lib/levels.ts`.
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
  numbers/percentages/timestamps/level digits), IBM Plex Sans Arabic (ar).
- Signature motif: **THE SCALE** — 6-segment strip (`components/ui/ScaleStrip`)
  reused in navbar logo, landing hero (animated), analyze result, history cards.
- Restraint: border radius ≤ 4px, hairline `line` borders, corner tick marks on
  key cards, film-grain ~3% overlay, ONE hazard-stripe (45°, 8px) used only on
  primary CTA top border + level-4/5 banner. No glassmorphism, no gradients.
- Motion: analyze flow is the one orchestrated moment (scan line 1.2s loop,
  digit count-up, bars stagger 60ms); everything else 150–200ms fades only.
- Copy voice: technical inspection register, short ("HOW BADLY IS IT DAMAGED?").

## Supabase setup (one-time, manual — needs dashboard)

1. Create project → copy URL + anon key into `web/.env.local`
   (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
   `NEXT_PUBLIC_API_URL=http://localhost:8000`).
2. Run `supabase/schema.sql` in the SQL editor (analyses table + RLS + storage
   policies).
3. Create **private** bucket `analysis-images`. Files live at
   `{user_id}/{analysis_id}.jpg` and `{user_id}/{analysis_id}_heatmap.png`;
   frontend reads via signed URLs.
4. Auth → enable Email provider only; **disable email confirmation** (demo).

## Definition of Done (spec §11)

- [ ] `npx tsc --noEmit` passes, zero `any`.
- [ ] Full flow works in BOTH `/en` and `/ar`; Arabic mirrors perfectly.
- [ ] Register → analyze sample → animated result → auto-saved → in history →
      survives logout/login.
- [ ] Same photo always yields the same mock result.
- [ ] Keyboard-only navigation works; reduced-motion disables animations.
- [ ] Looks incredible at 390px and 1440px.
- [ ] One-command demo: `docker compose up`.

## Later (out of scope until model is trained)

Real model + Grad-CAM go into `api/predict/model.py` behind the existing
`predict()` interface (pytorch-grad-cam or tf-keras-vis, overlay at 40–50%
opacity, PNG base64). No frontend change allowed.
