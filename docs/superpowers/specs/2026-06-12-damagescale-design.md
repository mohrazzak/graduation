# DamageScale — Design Spec (verbatim from project owner, 2026-06-12)

> This spec was provided complete by the project owner with the instruction:
> "Follow this document exactly. Ask before deviating." It is the authoritative
> design document for this repository.

================================================================================
PROJECT SPEC — AI BUILDING-DAMAGE CLASSIFIER (GRADUATION PROJECT)
================================================================================

WORKING NAME: "DamageScale"

--------------------------------------------------------------------------------
1. WHAT THIS IS
--------------------------------------------------------------------------------
A demo web app for a graduation project. An AI model classifies a photo of a
building into one of SIX damage levels:

  0 = Intact          (no damage)
  1 = Minor damage    (hairline cracks)
  2 = Moderate damage (visible cracks, broken windows)
  3 = Severe damage   (structural cracks, partial wall failure)
  4 = Partial collapse
  5 = Total destruction

Users register, upload a building photo, the backend predicts the level with
confidence scores and a Grad-CAM heatmap, and the result + image are saved to
the user's personal history.

IMPORTANT CONTEXT: The AI model is NOT trained yet. The entire app must be
built and fully demo-able against a MOCK prediction endpoint. The real model
will be plugged into FastAPI later WITHOUT any frontend changes.

--------------------------------------------------------------------------------
2. TECH STACK (FIXED — do not substitute)
--------------------------------------------------------------------------------
Frontend:
  - Next.js 14+ (App Router), TypeScript (strict mode), Tailwind CSS
  - next-intl            -> i18n routing /en and /ar, RTL support
  - @supabase/supabase-js + @supabase/ssr  -> auth, DB, storage
  - framer-motion        -> animations
  - react-dropzone       -> image upload
  - lucide-react         -> icons
Backend:
  - FastAPI (Python 3.11+), uvicorn, python-multipart
  - MOCK_MODE env flag. When true, returns realistic fake predictions.
  - Model framework (PyTorch vs TensorFlow) is DEFERRED. Structure the
    prediction code behind a single `predict(image) -> Prediction` interface
    so either framework can be dropped in later.
Database/Auth/Storage:
  - Supabase (cloud). Email + password auth ONLY. No OAuth.
Deployment target:
  - University server / localhost demo. Provide a docker-compose.yml that
    runs web (port 3000) + api (port 8000) with one command.

--------------------------------------------------------------------------------
3. CODE QUALITY RULES (NON-NEGOTIABLE)
--------------------------------------------------------------------------------
- TypeScript strict: no `any`. Shared types live in `lib/types.ts`.
- Every component: one responsibility, < ~150 lines, named export,
  props typed with an explicit interface.
- Server Components by default; "use client" only where interaction requires.
- All Supabase access goes through typed helpers in `lib/supabase/` —
  never call supabase directly inside JSX components.
- All FastAPI access goes through `lib/api.ts` (single fetch wrapper with
  typed request/response, error handling, and timeout).
- No magic values: damage levels, colors, labels live in `lib/levels.ts`
  as a single exported const array used EVERYWHERE (badges, bars, history).
- Comments explain WHY, not what. File header comment on every non-trivial
  file: 1-2 lines stating its purpose.
- Python: type hints everywhere, pydantic models for request/response,
  ruff-clean, docstrings on public functions.
- Accessibility floor: keyboard focus visible, alt text, labels on inputs,
  prefers-reduced-motion respected for all animations.
- Error/empty states are designed, not apologetic: say what happened and
  what to do next.

--------------------------------------------------------------------------------
4. REPO STRUCTURE
--------------------------------------------------------------------------------
/
├── docker-compose.yml
├── web/                          # Next.js app
│   ├── app/
│   │   └── [locale]/             # next-intl locale segment (en | ar)
│   │       ├── layout.tsx        # html dir=rtl/ltr, fonts, nav, footer
│   │       ├── page.tsx          # Landing
│   │       ├── analyze/page.tsx  # Core demo (protected)
│   │       ├── history/page.tsx  # Saved analyses (protected)
│   │       ├── how-it-works/page.tsx
│   │       ├── login/page.tsx
│   │       └── register/page.tsx
│   ├── components/
│   │   ├── ui/                   # Button, Card, Badge, Input, Spinner...
│   │   ├── analyze/              # DropZone, ScanOverlay, ResultPanel,
│   │   │                         # ConfidenceBars, HeatmapToggle, SampleStrip
│   │   ├── history/              # AnalysisCard, HistoryGrid, EmptyState
│   │   └── layout/               # Navbar, Footer, LocaleSwitcher, AuthGuard
│   ├── lib/
│   │   ├── levels.ts             # THE single source of truth for 0-5 scale
│   │   ├── types.ts              # Prediction, Analysis, etc.
│   │   ├── api.ts                # FastAPI client
│   │   └── supabase/             # client.ts, server.ts, queries.ts
│   ├── messages/en.json          # all UI strings (no hardcoded text in JSX)
│   ├── messages/ar.json
│   └── middleware.ts             # next-intl + Supabase session refresh
└── api/                          # FastAPI app
    ├── main.py                   # app factory, CORS, routes
    ├── schemas.py                # pydantic: PredictionResponse
    ├── predict/
    │   ├── interface.py          # predict(image_bytes) -> Prediction
    │   ├── mock.py               # MOCK_MODE implementation
    │   └── model.py              # placeholder for real model + Grad-CAM
    ├── requirements.txt
    └── Dockerfile

--------------------------------------------------------------------------------
5. SUPABASE SETUP (run this SQL in the Supabase dashboard)
--------------------------------------------------------------------------------
-- Analyses table
create table public.analyses (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  image_path    text not null,          -- storage path of uploaded photo
  heatmap_path  text,                   -- storage path of heatmap (nullable)
  level         smallint not null check (level between 0 and 5),
  confidence    real not null check (confidence between 0 and 1),
  probabilities jsonb not null,         -- array of 6 floats, sums ~1
  created_at    timestamptz not null default now()
);

alter table public.analyses enable row level security;

create policy "own rows select" on public.analyses
  for select using (auth.uid() = user_id);
create policy "own rows insert" on public.analyses
  for insert with check (auth.uid() = user_id);
create policy "own rows delete" on public.analyses
  for delete using (auth.uid() = user_id);

-- Storage: create PRIVATE bucket "analysis-images".
-- Files are stored at: {user_id}/{analysis_id}.jpg  and  {user_id}/{analysis_id}_heatmap.png
create policy "own files read"  on storage.objects for select
  using (bucket_id = 'analysis-images' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "own files write" on storage.objects for insert
  with check (bucket_id = 'analysis-images' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "own files delete" on storage.objects for delete
  using (bucket_id = 'analysis-images' and (storage.foldername(name))[1] = auth.uid()::text);

-- Frontend reads images via createSignedUrl (bucket is private).

Auth config: enable Email provider only. For the local demo, disable email
confirmation in Supabase Auth settings so registration works instantly.

Env vars (web/.env.local):
  NEXT_PUBLIC_SUPABASE_URL=
  NEXT_PUBLIC_SUPABASE_ANON_KEY=
  NEXT_PUBLIC_API_URL=http://localhost:8000

--------------------------------------------------------------------------------
6. FASTAPI CONTRACT
--------------------------------------------------------------------------------
POST /predict
  Request : multipart/form-data, field "file" (jpeg/png/webp, max 10 MB)
  Response: 200 application/json
  {
    "level": 3,
    "confidence": 0.91,
    "probabilities": [0.01, 0.02, 0.04, 0.91, 0.01, 0.01],
    "heatmap_base64": "iVBORw0KG..."   // PNG, nullable in mock mode v1
  }
  Errors: 400 (bad file type/size) and 500 return {"detail": "..."}.

GET /health -> {"status": "ok", "mock": true|false}

CORS: allow http://localhost:3000 (and the university server origin).

MOCK IMPLEMENTATION (mock.py):
  - Deterministic per image: seed RNG with a hash of the file bytes, so the
    same photo always returns the same level (feels real in demos).
  - Generate a plausible probability vector (one dominant class 0.6-0.95,
    rest distributed), pick level = argmax.
  - heatmap_base64: generate a soft radial blob PNG with Pillow as a stand-in.

REAL MODEL (later, model.py):
  - Implement predict() behind the same interface.
  - Grad-CAM via pytorch-grad-cam (PyTorch) or tf-keras-vis (TF/Keras),
    overlaid on the input at 40-50% opacity, returned as PNG base64.
  - Nothing in the frontend changes.

--------------------------------------------------------------------------------
7. i18n + RTL (ENGLISH + ARABIC)
--------------------------------------------------------------------------------
- next-intl with locale prefix routing: /en/... and /ar/...
- <html lang dir> set from locale in [locale]/layout.tsx (ar -> dir="rtl").
- ZERO hardcoded UI strings in components. Everything via messages/*.json.
- Use Tailwind LOGICAL properties everywhere: ms-/me-/ps-/pe-/text-start/
  text-end/start-/end-. Never ml-/mr-/pl-/pr-. Layout must mirror perfectly
  in Arabic with no extra CSS.
- Numbers/dates formatted with next-intl formatters per locale.
- Arabic copy must be written properly (formal, technical register), not
  machine-translated word-by-word. Damage level names in Arabic:
  0 سليم · 1 ضرر طفيف · 2 ضرر متوسط · 3 ضرر بالغ · 4 انهيار جزئي · 5 دمار كامل
- LocaleSwitcher in navbar: "EN | ع", preserves current route.

--------------------------------------------------------------------------------
8. DESIGN SYSTEM — "STRUCTURAL ASSESSMENT" AESTHETIC
--------------------------------------------------------------------------------
The design must feel like a precision engineering instrument inspecting
damaged structures: dark, serious, technical — with one unforgettable
signature. It must NOT look like a generic dark SaaS template.

PALETTE (exact tokens, define in tailwind config as named colors):
  bg          #0C0C0E   near-black concrete
  surface     #161619   panels/cards
  line        #2A2A2F   hairline borders
  text        #EDEDEF   primary text
  muted       #8B8B93   secondary text
  hazard      #FFB000   amber — primary accent, CTAs, focus rings
  alert       #FF3B30   reserved for level 4-5 only

DAMAGE LEVEL RAMP (the product's visual identity — used identically in
badges, confidence bars, history cards, landing animation):
  L0 #22C55E · L1 #A3E635 · L2 #FACC15 · L3 #F97316 · L4 #EF4444 · L5 #991B1B

TYPOGRAPHY (3 roles, via next/font):
  Display : "Archivo" (or "Space Grotesk") — Black/ExtraBold, tight tracking,
            uppercase for hero + level labels. Big and confident.
  Body    : "Inter" — regular UI text.
  Data    : "JetBrains Mono" — ALL numbers, percentages, timestamps, level
            digits. Monospace numerals are part of the identity.
  Arabic  : "IBM Plex Sans Arabic" for body/display when locale=ar.

SIGNATURE ELEMENT — "THE SCALE":
  A horizontal 6-segment damage scale (L0->L5 ramp colors) is the brand mark.
  - Landing hero: large animated scale; segments light up 0->5 in sequence
    on load while the level descriptions cycle.
  - Analyze result: the predicted level's segment is highlighted on the same
    scale, the rest dimmed.
  - History cards: a mini 6-segment strip with the level segment lit.
  - Navbar logo mark: a tiny 6-segment strip beside the wordmark.
  This single recurring motif is the one bold idea; keep everything else
  quiet and disciplined.

TEXTURE & DETAIL (use sparingly, with restraint):
  - Subtle film-grain/noise overlay on the bg (CSS, ~3% opacity).
  - Hairline 1px borders (#2A2A2F), corner tick marks on key cards
    (like crosshair registration marks on survey photos).
  - One diagonal hazard-stripe (hazard color, 45deg, 8px) used ONLY as a
    thin top border on the primary CTA and on the level-4/5 result banner.
  - No glassmorphism, no purple/blue gradients, no rounded-2xl everywhere:
    border radius is 4px max — this is an instrument, not a toy.

MOTION (framer-motion, all gated by prefers-reduced-motion):
  - Analyze flow is the orchestrated moment:
    upload -> image appears -> thin hazard-amber scan line sweeps top->bottom
    over the photo (1.2s loop) while "ANALYZING STRUCTURE..." ticks in mono
    -> result: level digit counts up 0->N in mono, segment lights, confidence
    bars stagger-fill 60ms apart, heatmap fades in on toggle.
  - Everything else: fast 150-200ms fades/slides only. No parallax,
    no floating blobs, no decorative perpetual animations.

COPY VOICE:
  Technical inspection register. Short. e.g. hero: "HOW BADLY IS IT DAMAGED?"
  / sub: "AI structural damage assessment, levels 0-5." Buttons say what they
  do: "Analyze photo", "Save result", "View history". Empty history state:
  "No assessments yet. Run your first analysis." Errors state cause + fix.

--------------------------------------------------------------------------------
9. PAGE SPECS
--------------------------------------------------------------------------------
LANDING /
  - Navbar: logo mark + wordmark, How it works, EN|ع, Login / "Open app".
  - Hero: display headline, sub, primary CTA "Try the demo" -> /analyze.
    THE SCALE animated beneath, cycling levels with name + description.
  - Section "How assessment works": 3 quiet steps (Upload -> Analyze -> Save)
    with hairline dividers. No marketing fluff.
  - Section: the 6 levels explained — 6 cards, each with its ramp color,
    Arabic/English name, one-line description.
  - Footer: project name, university, supervisor, year.

ANALYZE /analyze (auth required; redirect to /login if not)
  - Two-column on desktop (image | result), stacked on mobile.
  - DropZone: drag/drop or tap, validates type+size, shows preview.
  - SampleStrip: 6 thumbnail sample photos (placeholder images in /public,
    one roughly matching each level) — tap to run instantly. Critical for
    demo day when judges have no photos.
  - On submit: ScanOverlay animation -> POST /predict -> ResultPanel:
      * Giant level digit (mono) + level name + THE SCALE highlighted
      * Confidence % + 6 ConfidenceBars (ramp colors, mono percentages)
      * HeatmapToggle: overlay heatmap_base64 on the photo at 45% opacity
      * Level 4-5 results get the hazard-stripe banner treatment
  - Auto-save: upload image (+heatmap) to storage, insert analyses row,
    toast "Saved to history" with link.
  - "Analyze another" resets state.

HISTORY /history (auth required)
  - Responsive grid of AnalysisCard: signed-url thumbnail, mini scale strip,
    level name, confidence (mono), localized date. Click -> modal/expand with
    full result incl. heatmap toggle. Delete with confirm.
  - EmptyState with CTA to /analyze.

HOW IT WORKS /how-it-works
  - The 0-5 classification scale in depth.
  - Dataset + labeling process description (placeholder text to be filled by
    the student), model architecture placeholder, metrics placeholders
    (accuracy, confusion matrix slot) — structured so real numbers drop in
    after training.
  - "What is the heatmap?" — one paragraph explaining Grad-CAM simply.

LOGIN / REGISTER
  - Minimal centered card, email+password, inline validation, clear errors
    ("Wrong email or password." not "Something went wrong").
  - Register asks display name (stored in user_metadata).
  - AuthGuard middleware protects /analyze and /history.

--------------------------------------------------------------------------------
10. BUILD ORDER (do in this exact sequence, each phase runnable)
--------------------------------------------------------------------------------
Phase 1  Scaffold: Next.js + TS strict + Tailwind tokens + next-intl (en/ar
         working, dir flips) + fonts + Navbar/Footer + Landing static.
Phase 2  Supabase: auth (login/register/logout), middleware session refresh,
         protected routes. Run section-5 SQL.
Phase 3  FastAPI mock: /predict + /health per contract. Test with curl.
Phase 4  Analyze page end-to-end against mock (full design + motion).
Phase 5  Persistence: storage upload, analyses insert, History page,
         delete, signed URLs.
Phase 6  How-it-works + Landing polish + Arabic copy pass + a11y pass.
Phase 7  docker-compose.yml (web + api), README with setup steps,
         .env.example files.
Later    Real model + Grad-CAM into api/predict/model.py. No frontend change.

--------------------------------------------------------------------------------
11. DEFINITION OF DONE
--------------------------------------------------------------------------------
[ ] npx tsc --noEmit passes, zero `any`.
[ ] Full flow works in BOTH /en and /ar; Arabic layout mirrors perfectly.
[ ] Register -> analyze sample image -> result animates -> auto-saved ->
    appears in history -> survives logout/login.
[ ] Same photo always yields the same mock result.
[ ] Keyboard-only navigation works; reduced-motion disables animations.
[ ] Looks incredible on mobile (390px) and desktop (1440px).
[ ] One command demo: docker compose up.
================================================================================
