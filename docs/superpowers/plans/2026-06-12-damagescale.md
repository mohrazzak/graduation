# DamageScale Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the complete DamageScale demo app — Next.js web app (en/ar, RTL) + FastAPI mock prediction API + Supabase auth/db/storage — per `docs/superpowers/specs/2026-06-12-damagescale-design.md` (the authoritative spec; this plan never overrides it).

**Architecture:** Monorepo with `web/` (Next.js 15 App Router, TS strict, Tailwind, next-intl v4, @supabase/ssr) and `api/` (FastAPI behind a `predict(image_bytes) -> Prediction` interface with a deterministic mock). Frontend talks to FastAPI only through `web/lib/api.ts` and to Supabase only through `web/lib/supabase/*`. docker-compose runs both.

**Tech Stack:** Next.js 15 (satisfies "14+"), TypeScript strict, Tailwind CSS, next-intl, @supabase/supabase-js + @supabase/ssr, framer-motion, react-dropzone, lucide-react, FastAPI + uvicorn + python-multipart + Pillow, pytest + httpx for API tests, ruff.

**Toolchain on this machine:** Node 22, npm + pnpm, Python 3.12.3, Docker 29.

**Key decisions locked here (consistent across all tasks):**
- Ramp colors come ONLY from `web/lib/levels.ts` and are applied via inline `style={{ backgroundColor }}` / `style={{ color }}` (Tailwind can't generate dynamic classes from runtime hex). UI chrome colors (bg/surface/line/text/muted/hazard/alert) are Tailwind named tokens.
- Analysis IDs are generated client-side with `crypto.randomUUID()` so the storage path `{user_id}/{analysis_id}.jpg` can be written before the DB row insert.
- The API client uploads the ORIGINAL file bytes to `/predict` (determinism requirement: same photo → same bytes → same hash → same mock result).
- next-intl v4 layout: `web/i18n/routing.ts`, `web/i18n/request.ts`, `web/i18n/navigation.ts`; `middleware.ts` composes the next-intl middleware with Supabase session refresh and the auth guard.
- Verification gates per phase: `npx tsc --noEmit` (zero errors), `npm run build`, `pytest`, `ruff check .`. Frontend behavior is verified by running dev servers and exercising the flow (curl for API, browser/HTTP checks for web).
- TDD applies fully to the FastAPI service (pytest written before implementation). Web verification is gate-driven (tsc/build/runtime) per the spec's Definition of Done — the spec defines the web acceptance criteria and does not require a JS unit-test harness; do not add one.

---

## Phase 0 — Repo skeleton

### Task 0.1: Repo init + CLAUDE.md

**Files:**
- Create: `.gitignore`, `CLAUDE.md`, `README.md` (stub, completed in Phase 7)

- [ ] **Step 1:** `.gitignore` covering: `node_modules/`, `.next/`, `web/.env.local`, `api/.venv/`, `__pycache__/`, `*.pyc`, `.pytest_cache/`, `.ruff_cache/`, `.DS_Store`, `*.tsbuildinfo`, `api/.env`.
- [ ] **Step 2:** `CLAUDE.md` at repo root containing: project one-liner, the six damage levels table, fixed tech stack, repo map, ALL code-quality rules from spec §3 (verbatim constraints: no `any`, <150-line components, named exports, logical properties only, no hardcoded strings, single source of truth `lib/levels.ts`, 4px max radius, ramp/palette hex values), commands (dev, build, tsc, pytest, ruff, docker compose up), FastAPI contract summary, Supabase setup pointer to `supabase/schema.sql`, build-order status, and Definition of Done checklist. This file is the onboarding document the user explicitly required ("CLAUDE.MD FILE THAT HAVE EVERYTHING FOR THE PROJECT").
- [ ] **Step 3:** Commit: `chore: repo skeleton, spec, plan, CLAUDE.md`

---

## Phase 1 — Web scaffold: Next.js + tokens + i18n + fonts + Navbar/Footer + static Landing

### Task 1.1: Scaffold Next.js app

**Files:** Create `web/` via scaffold.

- [ ] **Step 1:** Run:
  ```bash
  cd /home/mohrazzak/projects/grad_proj && npx --yes create-next-app@latest web --ts --tailwind --eslint --app --src-dir=false --import-alias "@/*" --use-npm --no-turbopack
  ```
  (If the installed create-next-app version doesn't accept a listed flag, drop only that flag and keep defaults matching: TS, Tailwind, ESLint, App Router, no src dir, `@/*` alias.)
- [ ] **Step 2:** Install deps:
  ```bash
  cd web && npm i next-intl @supabase/supabase-js @supabase/ssr framer-motion react-dropzone lucide-react
  ```
- [ ] **Step 3:** Verify `web/tsconfig.json` has `"strict": true`. Add `"noUncheckedIndexedAccess": true`.
- [ ] **Step 4:** `npx tsc --noEmit` passes. Commit.

### Task 1.2: Design tokens + global CSS

**Files:**
- Modify: `web/app/globals.css` (Tailwind v4 CSS-first config) — if scaffold produced Tailwind v3, put the same tokens in `tailwind.config.ts` `theme.extend.colors` instead.

- [ ] **Step 1:** Define named color tokens exactly: `bg #0C0C0E`, `surface #161619`, `line #2A2A2F`, `text #EDEDEF`, `muted #8B8B93`, `hazard #FFB000`, `alert #FF3B30`. Tailwind v4 form:
  ```css
  @import "tailwindcss";
  @theme {
    --color-bg: #0C0C0E;
    --color-surface: #161619;
    --color-line: #2A2A2F;
    --color-text: #EDEDEF;
    --color-muted: #8B8B93;
    --color-hazard: #FFB000;
    --color-alert: #FF3B30;
    --font-display: var(--font-archivo);
    --font-body: var(--font-inter);
    --font-mono: var(--font-jetbrains);
    --radius-DEFAULT: 4px;
  }
  ```
- [ ] **Step 2:** Global CSS: body bg/text colors; visible focus ring (`:focus-visible { outline: 2px solid #FFB000; outline-offset: 2px; }`); film-grain noise overlay as a `body::before` fixed full-viewport layer using an inline SVG `feTurbulence` data-URI at ~3% opacity, `pointer-events: none`; `.hazard-stripe` utility (45deg repeating-linear-gradient, 8px period, hazard color) for the CTA top border and L4/5 banner; corner-tick utility for cards (4 small L-shaped marks via pseudo-elements or a `CornerTicks` component in Task 1.6).
- [ ] **Step 3:** `prefers-reduced-motion` global: framer-motion handles its own gating via `useReducedMotion`; additionally add a CSS `@media (prefers-reduced-motion: reduce)` block disabling the scan-line/grain animations.
- [ ] **Step 4:** tsc + build pass. Commit.

### Task 1.3: next-intl wiring (routing, messages, middleware v1)

**Files:**
- Create: `web/i18n/routing.ts`, `web/i18n/request.ts`, `web/i18n/navigation.ts`, `web/messages/en.json`, `web/messages/ar.json`, `web/middleware.ts`
- Modify: `web/next.config.ts`
- Create: `web/app/[locale]/layout.tsx`, `web/app/[locale]/page.tsx` (placeholder); delete scaffold `web/app/page.tsx`/`layout.tsx` content accordingly (keep a root `app/layout.tsx` that just renders children if required by Next, else move everything under `[locale]`).

- [ ] **Step 1:** `i18n/routing.ts`:
  ```ts
  import { defineRouting } from "next-intl/routing";
  export const routing = defineRouting({ locales: ["en", "ar"], defaultLocale: "en" });
  ```
  `i18n/request.ts` standard `getRequestConfig` loading `../messages/${locale}.json`. `i18n/navigation.ts` via `createNavigation(routing)` exporting `Link, useRouter, usePathname, redirect`.
- [ ] **Step 2:** `next.config.ts` wraps with `createNextIntlPlugin("./i18n/request.ts")`.
- [ ] **Step 3:** `middleware.ts` v1: next-intl middleware only (Supabase added in Phase 2). Matcher excludes `/_next`, files with extensions, and `/api`.
- [ ] **Step 4:** `[locale]/layout.tsx`: validate locale against `routing.locales` (else `notFound()`), `setRequestLocale`, `<html lang={locale} dir={locale === "ar" ? "rtl" : "ltr"}>`, `NextIntlClientProvider`, font variables on `<body>` (Task 1.4), Navbar/Footer slots (Task 1.6).
- [ ] **Step 5:** Message files: full key tree for ALL pages up front so later tasks only fill values: `common`, `nav`, `footer`, `landing`, `levels` (per-level `name` + `description`, 0–5), `analyze`, `history`, `howItWorks`, `auth`, `errors`. Arabic copy: formal technical register; level names exactly: سليم / ضرر طفيف / ضرر متوسط / ضرر بالغ / انهيار جزئي / دمار كامل.
- [ ] **Step 6:** Verify: `npm run dev`, `curl -s localhost:3000/en | grep 'dir="ltr"'` and `curl -s localhost:3000/ar | grep 'dir="rtl"'`. tsc passes. Commit.

### Task 1.4: Fonts

**Files:** Modify `web/app/[locale]/layout.tsx`; create `web/lib/fonts.ts`.

- [ ] **Step 1:** `lib/fonts.ts` via `next/font/google`: Archivo (weights 700–900, `variable: "--font-archivo"`), Inter (`--font-inter`), JetBrains_Mono (`--font-jetbrains`), IBM_Plex_Sans_Arabic (weights 400–700, `--font-arabic`).
- [ ] **Step 2:** In layout, attach all four variables; when `locale === "ar"`, body class swaps display/body font stacks to IBM Plex Sans Arabic (CSS: `html[dir="rtl"] { --font-display-active: var(--font-arabic); ... }` or conditional class). Mono stays JetBrains for digits in both locales.
- [ ] **Step 3:** tsc + build. Commit.

### Task 1.5: `lib/levels.ts` + `lib/types.ts`

**Files:** Create `web/lib/levels.ts`, `web/lib/types.ts`.

- [ ] **Step 1:** `lib/levels.ts` — THE single source of truth:
  ```ts
  // Single source of truth for the 0-5 damage scale. Every badge, bar,
  // scale segment, and history strip derives color + i18n key from here.
  export type DamageLevelId = 0 | 1 | 2 | 3 | 4 | 5;

  export interface DamageLevel {
    readonly id: DamageLevelId;
    readonly key: "intact" | "minor" | "moderate" | "severe" | "partialCollapse" | "totalDestruction";
    readonly color: string; // ramp hex, applied via inline style
  }

  export const DAMAGE_LEVELS: readonly DamageLevel[] = [
    { id: 0, key: "intact", color: "#22C55E" },
    { id: 1, key: "minor", color: "#A3E635" },
    { id: 2, key: "moderate", color: "#FACC15" },
    { id: 3, key: "severe", color: "#F97316" },
    { id: 4, key: "partialCollapse", color: "#EF4444" },
    { id: 5, key: "totalDestruction", color: "#991B1B" },
  ] as const;

  export const ALERT_LEVEL_THRESHOLD: DamageLevelId = 4; // L4-L5 get hazard banner

  export function getLevel(id: number): DamageLevel { /* clamp + lookup, throws on out-of-range */ }
  export function isAlertLevel(id: DamageLevelId): boolean { return id >= ALERT_LEVEL_THRESHOLD; }
  ```
  i18n names/descriptions live in `messages/*.json` under `levels.<key>.name|description` (strings never live in TS files).
- [ ] **Step 2:** `lib/types.ts`:
  ```ts
  import type { DamageLevelId } from "./levels";

  export interface Prediction {
    level: DamageLevelId;
    confidence: number;            // 0..1
    probabilities: number[];       // length 6, sums ~1
    heatmap_base64: string | null; // PNG, no data: prefix
  }

  export interface Analysis {
    id: string;
    user_id: string;
    image_path: string;
    heatmap_path: string | null;
    level: DamageLevelId;
    confidence: number;
    probabilities: number[];
    created_at: string; // ISO
  }
  ```
- [ ] **Step 3:** tsc. Commit.

### Task 1.6: UI primitives + layout components + static Landing

**Files:**
- Create: `web/components/ui/Button.tsx`, `Card.tsx`, `Badge.tsx`, `Input.tsx`, `Spinner.tsx`, `CornerTicks.tsx`
- Create: `web/components/ui/ScaleStrip.tsx` (THE SCALE: sizes `sm|md|lg`, props `{ activeLevel?: DamageLevelId; animateIn?: boolean }` — reused by navbar logo, hero, result, history)
- Create: `web/components/layout/Navbar.tsx`, `Footer.tsx`, `LocaleSwitcher.tsx`
- Create: `web/components/landing/Hero.tsx`, `HowItWorksSection.tsx`, `LevelsGrid.tsx`
- Modify: `web/app/[locale]/page.tsx`

- [ ] **Step 1:** Primitives per spec §8: 4px max radius, hairline `line` borders, hazard focus rings, Button variants (`primary` = hazard bg + `.hazard-stripe` top border, `ghost`, `danger`), mono `Badge` for level chips. All named exports, explicit prop interfaces, <150 lines, logical properties only.
- [ ] **Step 2:** `ScaleStrip`: 6 flex segments colored from `DAMAGE_LEVELS`; `activeLevel` dims others (opacity 0.25); `lg` + `animateIn` does the 0→5 sequential light-up (framer-motion, `useReducedMotion`-gated). Includes `aria-hidden` (decorative) or labelled variant for the result panel.
- [ ] **Step 3:** Navbar: ScaleStrip `sm` + wordmark "DAMAGESCALE" (display font), links (How it works), LocaleSwitcher ("EN | ع" — preserves route via `i18n/navigation` `Link`/`usePathname`), Login / "Open app" buttons (auth-aware later in Phase 2). Footer per spec §9 (project name, university, supervisor, year — values from messages files with sensible placeholders for the student to edit).
- [ ] **Step 4:** Landing static: Hero (display headline "HOW BADLY IS IT DAMAGED?" via messages, sub, CTA → `/analyze`, large animated ScaleStrip + cycling level name/description), HowItWorksSection (3 steps, hairline dividers), LevelsGrid (6 cards: ramp color swatch, en/ar name, one-line description, CornerTicks).
- [ ] **Step 5:** Verify: tsc + build; dev server renders `/en` and `/ar` mirrored. Commit: `feat(web): phase 1 — scaffold, tokens, i18n, fonts, landing`.

---

## Phase 2 — Supabase auth

### Task 2.1: Supabase helpers + schema file

**Files:**
- Create: `web/lib/supabase/client.ts` (browser client via `createBrowserClient`), `web/lib/supabase/server.ts` (server client via `createServerClient` + Next cookies), `web/lib/supabase/middleware.ts` (session refresh helper `updateSession(request, response)`), `web/lib/supabase/auth.ts` (typed `signUp(email, password, displayName)`, `signIn`, `signOut`, `getUser` helpers — JSX never touches supabase directly)
- Create: `supabase/schema.sql` (verbatim spec §5 SQL + bucket creation note)
- Create: `web/.env.local` (placeholders), `web/.env.example`

- [ ] **Step 1:** Write helpers with full types (`SignUpResult = { error: AuthErrorCode | null }` style discriminated results; map Supabase error messages to stable error codes consumed by messages files — e.g. `invalid_credentials`, `email_taken`, `weak_password`, `network`).
- [ ] **Step 2:** `supabase/schema.sql` exactly per spec §5.
- [ ] **Step 3:** tsc. Commit.

### Task 2.2: middleware (intl + session refresh + guard)

**Files:** Modify `web/middleware.ts`.

- [ ] **Step 1:** Compose: run next-intl middleware → get response; run Supabase `updateSession` writing refreshed cookies onto that response; if path (locale-stripped) is `/analyze` or `/history` and no user → redirect to `/{locale}/login?next=<path>`.
- [ ] **Step 2:** Build-time safety: if `NEXT_PUBLIC_SUPABASE_URL` is a placeholder, middleware must not crash (guard so the app still renders pre-setup, with auth simply failing).
- [ ] **Step 3:** Verify: unauthenticated `curl -sI localhost:3000/en/analyze` → 307 to `/en/login`. Commit.

### Task 2.3: Login/Register pages + auth-aware navbar

**Files:**
- Create: `web/app/[locale]/login/page.tsx`, `web/app/[locale]/register/page.tsx`, `web/components/auth/AuthForm.tsx` (client; shared email+password fields, inline validation, mode prop), `web/components/auth/LogoutButton.tsx`
- Modify: `web/components/layout/Navbar.tsx` (server component reads user via `lib/supabase/server`, shows Login vs user name + Logout + "Open app")

- [ ] **Step 1:** Centered minimal card per spec §9; labels on inputs, inline validation (email format, password ≥8), error copy from `errors.*` keys ("Wrong email or password." style, both locales). Register collects display name → `user_metadata.display_name`. On success redirect to `/analyze`.
- [ ] **Step 2:** Verify tsc/build; manual flow happens once user supplies Supabase credentials (note in README). Commit: `feat(web): phase 2 — supabase auth, guarded routes`.

---

## Phase 3 — FastAPI mock (TDD)

### Task 3.1: API scaffold + tests first

**Files:**
- Create: `api/requirements.txt` (fastapi, uvicorn[standard], python-multipart, pillow, pydantic; dev: pytest, httpx, ruff), `api/pyproject.toml` (ruff config, line-length 100), `api/schemas.py`, `api/predict/__init__.py`, `api/predict/interface.py`, `api/predict/mock.py`, `api/predict/model.py` (NotImplementedError placeholder documenting the future Grad-CAM contract), `api/main.py`, `api/tests/test_api.py`, `api/Dockerfile` (Phase 7 may adjust), `api/.env.example` (`MOCK_MODE=true`, `CORS_ORIGINS=http://localhost:3000`)

- [ ] **Step 1 (tests first):** `api/tests/test_api.py` with httpx `TestClient`:
  - `test_health` → 200 `{"status": "ok", "mock": True}`
  - `test_predict_returns_contract_shape` (valid 1px PNG bytes): 200; `level` int 0–5; `confidence` 0.6–0.95; `probabilities` length 6, each ≥0, `sum ≈ 1` (±0.01); `argmax(probabilities) == level`; `confidence == probabilities[level]`; `heatmap_base64` decodes as a PNG (Pillow opens it).
  - `test_predict_deterministic`: same bytes twice → identical JSON.
  - `test_predict_different_images_can_differ`: craft bytes until two seeds give different levels (loop a few candidate payloads; assert at least two distinct levels observed — guards against a constant mock).
  - `test_rejects_bad_type` (text/plain) → 400 with `detail`.
  - `test_rejects_oversize` (>10MB bytes) → 400 with `detail`.
- [ ] **Step 2:** Run pytest → all fail (no app yet).
- [ ] **Step 3 (implement):**
  - `schemas.py`: `PredictionResponse(BaseModel)` with `level: int` (ge=0, le=5), `confidence: float` (ge=0, le=1), `probabilities: list[float]` (min/max length 6), `heatmap_base64: str | None`.
  - `interface.py`: `Prediction` dataclass mirroring the schema + `get_predictor() -> Callable[[bytes], Prediction]` choosing mock vs model from `MOCK_MODE` env (default true).
  - `mock.py`: `seed = int.from_bytes(hashlib.sha256(data).digest()[:8], "big")`; `rng = random.Random(seed)`; `level = rng.randint(0, 5)`; dominant prob = `rng.uniform(0.6, 0.95)`; remainder split across other 5 via rng weights, normalized; heatmap = Pillow 224×224: black-transparent base + soft radial blob (center jittered by rng, red→yellow→transparent gradient via per-pixel falloff or `ImageFilter.GaussianBlur` on a drawn ellipse), saved PNG → base64 (no data: prefix).
  - `main.py`: app factory; CORS from `CORS_ORIGINS` env (comma-split, default `http://localhost:3000`); `GET /health`; `POST /predict` validating content-type in {image/jpeg, image/png, image/webp} and size ≤ 10 MB (read bytes, check len) → 400 `{"detail": ...}` otherwise.
- [ ] **Step 4:** `pytest -q` all pass; `ruff check .` clean.
- [ ] **Step 5:** Manual contract check:
  ```bash
  uvicorn main:app --port 8000 &  # from api/, venv active
  curl -s localhost:8000/health
  curl -s -F "file=@sample.png;type=image/png" localhost:8000/predict | head -c 300
  ```
- [ ] **Step 6:** Commit: `feat(api): phase 3 — mock /predict + /health, tests`.

---

## Phase 4 — Analyze page end-to-end vs mock

### Task 4.1: `lib/api.ts`

**Files:** Create `web/lib/api.ts`.

- [ ] **Step 1:**
  ```ts
  // Single FastAPI client. All frontend → API traffic goes through here.
  export class ApiError extends Error {
    constructor(readonly kind: "bad_file" | "server" | "network" | "timeout", message: string) { super(message); }
  }
  const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
  const PREDICT_TIMEOUT_MS = 30_000;

  export async function predictDamage(file: File | Blob): Promise<Prediction> { /* multipart POST /predict, AbortController timeout, maps 400→bad_file, 5xx→server, fetch fail→network; validates shape (level int 0-5, probabilities length 6) before returning */ }
  export async function getHealth(): Promise<{ status: string; mock: boolean }> { ... }
  ```
- [ ] **Step 2:** tsc. Commit.

### Task 4.2: Analyze components

**Files:**
- Create: `web/components/analyze/DropZone.tsx` (react-dropzone; accepts jpeg/png/webp ≤10MB; preview via object URL; validation errors from messages), `ScanOverlay.tsx` (hazard scan line sweeping top→bottom 1.2s loop + "ANALYZING STRUCTURE…" mono ticker; reduced-motion → static pulse text only), `ResultPanel.tsx` (giant mono digit count-up 0→N, level name display font, ScaleStrip md with activeLevel, confidence %, hazard-stripe banner when `isAlertLevel`), `ConfidenceBars.tsx` (6 bars, ramp colors, mono %, stagger 60ms), `HeatmapToggle.tsx` (toggle overlays `data:image/png;base64,...` at 45% opacity, fade in), `SampleStrip.tsx` (6 thumbnails from `/public/samples/level-{0..5}.jpg`; click → fetch the file → run pipeline)
- Create: `web/app/[locale]/analyze/page.tsx` (server shell) + `web/components/analyze/AnalyzeClient.tsx` (client orchestrator: state machine `idle → ready → analyzing → done | error`)
- Create: `web/public/samples/level-0.jpg` … `level-5.jpg` (generated placeholder images — Pillow script `scripts/make_samples.py` producing 6 distinct gray-concrete-toned images labeled L0–L5 so each hashes to a stable mock result; ALSO: since mock level is hash-derived, iterate generation salt per image until the mock ACTUALLY returns the matching level for each sample — script calls mock.predict directly to verify, so demo samples match their labels)
- Create: `web/components/ui/Toast.tsx` (minimal toast for "Saved to history")

- [ ] **Step 1:** Build components per spec §8/§9 (two-column desktop / stacked mobile, all strings from messages, logical props, <150 lines each, reduced-motion gates on every animation).
- [ ] **Step 2:** Wire AnalyzeClient: DropZone/sample → preview → "Analyze photo" → ScanOverlay while `predictDamage` runs (min display time ~1.2s so the scan reads) → ResultPanel; "Analyze another" resets; error state per copy voice (cause + fix).
- [ ] **Step 3:** Generate sample images; verify with the mock that levels match labels.
- [ ] **Step 4:** Verify: tsc/build; with api up, full /en/analyze and /ar/analyze flow works (auth bypass note: requires Supabase creds; for pre-creds testing temporarily verify via middleware guard disabled — NO, instead verify after Phase 2 creds or by signing up once creds exist; structural verification = build + manual once creds present).
- [ ] **Step 5:** Commit: `feat(web): phase 4 — analyze flow vs mock`.

---

## Phase 5 — Persistence + History

### Task 5.1: queries.ts (storage + analyses CRUD)

**Files:** Create `web/lib/supabase/queries.ts`.

- [ ] **Step 1:** Typed helpers (browser client):
  ```ts
  export async function saveAnalysis(input: { file: Blob; prediction: Prediction; userId: string }): Promise<Result<Analysis>>
  // - id = crypto.randomUUID()
  // - upload file → `${userId}/${id}.jpg` (contentType from blob)
  // - if heatmap: decode base64 → Blob → `${userId}/${id}_heatmap.png`
  // - insert row { id, user_id, image_path, heatmap_path, level, confidence, probabilities }
  // - on row-insert failure after upload: best-effort remove uploaded objects (no orphans)
  export async function listAnalyses(): Promise<Result<Analysis[]>>            // order created_at desc
  export async function deleteAnalysis(a: Analysis): Promise<Result<null>>     // delete storage objects then row
  export async function getSignedUrl(path: string): Promise<Result<string>>    // 1h expiry
  ```
  `Result<T> = { data: T; error: null } | { data: null; error: string }` (error = stable code for messages).
- [ ] **Step 2:** tsc. Commit.

### Task 5.2: Auto-save in Analyze + History page

**Files:**
- Modify: `web/components/analyze/AnalyzeClient.tsx` (after successful predict: fire `saveAnalysis`, toast "Saved to history" with link to `/history`; failure toast states cause + retry button)
- Create: `web/components/history/AnalysisCard.tsx` (signed-url thumbnail, mini ScaleStrip, level name, mono confidence, localized date via `useFormatter`), `HistoryGrid.tsx`, `EmptyState.tsx`, `AnalysisModal.tsx` (full result, heatmap toggle, delete w/ confirm)
- Create: `web/app/[locale]/history/page.tsx` (server shell) + `web/components/history/HistoryClient.tsx`

- [ ] **Step 1:** Implement; delete confirm is an inline two-step button (no browser confirm()); modal keyboard-dismissable (Esc), focus-trapped.
- [ ] **Step 2:** Verify tsc/build + full flow once Supabase creds exist: analyze → toast → history shows card → delete works → survives logout/login.
- [ ] **Step 3:** Commit: `feat(web): phase 5 — persistence + history`.

---

## Phase 6 — How-it-works, polish, Arabic + a11y pass

### Task 6.1: How-it-works page

**Files:** Create `web/app/[locale]/how-it-works/page.tsx` + `web/components/how-it-works/*` (sections: scale-in-depth using LevelsGrid data, dataset/labeling placeholder, model architecture placeholder, metrics placeholders with clearly slotted "TBD after training" cards, Grad-CAM explainer paragraph).

- [ ] **Step 1:** Build (server components only — static page). All copy in both message files.
- [ ] **Step 2:** tsc/build. Commit.

### Task 6.2: Polish + Arabic + a11y sweep

- [ ] **Step 1:** Sweep all components: logical-properties audit (`grep -rnE "\b(ml-|mr-|pl-|pr-|left-|right-|text-left|text-right)" web/components web/app` → zero hits except justified `left-0 right-0` full-bleed cases which must be converted to `inset-x-0`), hardcoded-string audit (no literal UI text in JSX), alt text on all images, labels on all inputs, focus-visible everywhere, reduced-motion on every `motion.` usage.
- [ ] **Step 2:** Arabic copy quality pass over `messages/ar.json` (formal register, level names exact per spec §7).
- [ ] **Step 3:** Landing polish per spec §8 motion rules. Mobile 390px / desktop 1440px layout check.
- [ ] **Step 4:** Commit: `feat(web): phase 6 — how-it-works, polish, i18n/a11y pass`.

---

## Phase 7 — Docker + README + env examples

### Task 7.1: Containers + compose + docs

**Files:**
- Create: `web/Dockerfile` (multi-stage: deps → build → `output: "standalone"` runner, port 3000; `NEXT_PUBLIC_*` as build args), `api/Dockerfile` (python:3.12-slim, install requirements, uvicorn, port 8000, non-root user), `docker-compose.yml` (services `web` + `api`, env from `.env`, web depends_on api), `.env.example` (root, for compose), final `README.md` (setup: Supabase project creation + run `supabase/schema.sql` + create private bucket `analysis-images` + disable email confirmation; local dev commands; docker one-command demo; project structure; DoD checklist).
- Modify: `web/next.config.ts` (`output: "standalone"`).

- [ ] **Step 1:** Implement; `docker compose build` succeeds; `docker compose up` serves :3000/:8000; `curl localhost:8000/health` ok from host.
- [ ] **Step 2:** Update CLAUDE.md status section. Final commit: `feat: phase 7 — docker compose + docs`.

---

## Final verification (Definition of Done)

- [ ] `cd web && npx tsc --noEmit` → 0 errors; `grep -rn ": any" web --include="*.ts*" -l` → nothing (excluding node_modules/generated).
- [ ] `cd api && pytest -q` all pass; `ruff check .` clean.
- [ ] `npm run build` succeeds.
- [ ] `/en` and `/ar` render with correct `dir`; layout mirrors.
- [ ] Mock determinism proven by pytest + double-curl same file.
- [ ] Keyboard navigation + reduced-motion verified.
- [ ] `docker compose up` one-command demo works.
- [ ] Items requiring user input (cannot be done by agent): create Supabase cloud project, run `supabase/schema.sql`, create private bucket `analysis-images`, disable email confirmation, fill `web/.env.local` — README documents all; flow re-verified end-to-end after creds are supplied.
