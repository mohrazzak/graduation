# Premium visual upgrade + evaluator "wow" features + free deployment — design

Date: 2026-06-12 · Status: approved direction
Amends the master spec (`2026-06-12-damagescale-design.md`) and the landing
design (`2026-06-12-landing-imagery-cairo-design.md`). Every master-spec rule
still binds: dark instrument aesthetic, NO gradients, hairline `line` borders,
radius ≤ 4px, Tailwind logical properties only, zero hardcoded strings (all copy
via `messages/{en,ar}.json`), TS strict no `any`, components < ~150 lines named
export, every animation gated on `prefers-reduced-motion`, levels/colors only
from `lib/levels.ts`, Supabase only via `lib/supabase/`, FastAPI only via
`lib/api.ts`, alert red reserved for levels 4–5.

## Goal

Make the app read as a premium, "how did students build this?" instrument for
university evaluators: photographic backdrops on every page, and four signature
interactions (heatmap reveal slider, live analysis log, PDF inspection report,
history stats dashboard). Then deploy free at `project.razzak.me`.

This is TWO sub-projects with independent specs-of-work in one document:
**A. Visual upgrade + features** (ships first, fully testable locally) and
**B. Deployment** (depends on A, requires interactive user steps). The
implementation plan sequences B strictly after A is merged and verified.

---

## A. Visual upgrade + "wow" features

### A1. Page backdrops on every page

A new server component `components/layout/PageBackdrop.tsx` renders the proven
hero recipe (next/image `fill`, `object-cover`, `grayscale`, decorative
`alt=""` + `aria-hidden`) but tuned for content legibility, NOT drama:
`brightness-[0.18]` on the image plus a flat `bg-bg/85` scrim div (a solid
overlay, never a gradient — master spec §8). It is absolutely positioned at
`fixed inset-0 -z-10` behind all content so it does not affect layout or
intercept input, and sits ABOVE the global film grain conceptually (grain stays
visible at 3% over it, which is fine).

Props: `{ src: string }`. One photo per page, all added under
`web/public/backgrounds/` (NOT reusing landing photos):

| Page | Backdrop subject |
| ---- | ---------------- |
| analyze | inspector / scaffolding on a concrete facade |
| history | weathered archive / records-wall facade |
| how-it-works | exposed rebar + structural concrete detail |
| login + register | dark plain concrete wall (quietest) |
| 404 (not-found) | rubble field |

Landing keeps its existing hero backdrop unchanged; landing does NOT get a
`PageBackdrop` (its hero already owns the imagery).

Integration: each page's server shell wraps its content with `<PageBackdrop
src="/backgrounds/<page>.jpg" />` as the first child of the existing
`max-w-*` container's parent. Because the backdrop is `fixed`, the existing
`<main className="flex flex-1 flex-col">` layout is untouched. Cards/panels
keep `bg-surface` (opaque) so content blocks stay crisp over the photo.

Sourcing: ~5 new free-licensed photos (Wikimedia Commons), resized ≤ 1920px
wide, ≤ 300 KB each, recorded in a new `web/public/backgrounds/CREDITS.md`
(license must be Public domain / CC0 / CC BY / CC BY-SA; author + source URL per
file). Reuse the Task-1 sourcing procedure from the landing plan.

Acceptance: AA contrast preserved on every page (the `brightness-[0.18]` +
`bg/85` stack puts the effective backdrop ≤ ~#242424; muted `#8B8B93` body text
clears 4.5:1 over it — verify per page). No horizontal overflow at 390px. RTL
unaffected (backdrop is symmetric `inset-0`).

### A2. Heatmap reveal slider

Extend `components/analyze/ImageWithHeatmap.tsx` with an optional reveal mode.
When the heatmap is visible, a draggable vertical divider sweeps the heatmap
across the photo using `clip-path: inset(0 <100−p>% 0 0)` on the heatmap layer
(logical: in RTL the inset side mirrors automatically because we drive it off a
single `revealPct` and the figure is already dir-aware — verify the mirror).
The divider is a real `<input type="range" min=0 max=100>` styled as a thin
hazard line with a grab handle, so it is keyboard-operable (arrow keys),
labelled (`aria-label` from messages), and screen-reader announces percent.

The existing `HeatmapToggle` (show/hide) remains as the accessible fallback and
default entry point: toggle ON → heatmap fully overlaid at 45% AND the slider
appears initialized at 100% (fully revealed). Dragging left wipes it away to
show the bare photo. Reduced motion: no transition on the clip, but the slider
still works (it is direct manipulation, not animation).

This is used in BOTH the analyze result (`AnalyzeClient` → `ImageWithHeatmap`)
and the history modal (`AnalysisModal` → `ImageWithHeatmap`) for free, since
both already render the shared component. New message keys:
`analyze.heatmapReveal` (slider aria-label).

Component-size guard: if `ImageWithHeatmap` exceeds ~150 lines, extract the
slider UI into `components/analyze/HeatmapRevealSlider.tsx` (named export,
explicit props `{ value, onChange, label }`).

### A3. Live analysis log

Extend `components/analyze/ScanOverlay.tsx`: during the scan, a JetBrains-Mono
terminal log types out fixed inspection lines bottom-left, each line appearing
~300ms apart with a blinking cursor, e.g. (all from i18n, en + ar):

```
> ACQUIRING FRAME ............ OK
> NORMALIZING EXPOSURE ....... OK
> EDGE DENSITY MAP ........... OK
> LOCATING STRUCTURE ......... OK
> SCORING 6 DAMAGE CLASSES ...
```

Stored as an ordered array under `analyze.scanLog` (list of short strings) in
both catalogs; the component maps over them with a timed reveal index. The scan
floor in `AnalyzeClient` (`MIN_SCAN_MS`) rises 1200 → 2400ms so the log has time
to play; the sweeping scan line + pulsing label stay. Reduced motion: the full
log renders instantly as a static list (no typing, no cursor), and the floor
stays effectively immediate as it is today.

Component-size guard: extract `components/analyze/AnalysisLog.tsx` if
ScanOverlay crosses ~150 lines.

### A4. PDF inspection report

A print-optimized report, triggered by a new "Report" ghost button placed in
the action rows that already exist in `ResultPanel` (analyze) and
`AnalysisModal` (history). Approach: a dedicated print stylesheet + a
`components/report/ReportDocument.tsx` that renders a hidden, print-only
`<article>` (`hidden print:block`, or a `@media print` body-state) containing:
app wordmark + "STRUCTURAL ASSESSMENT REPORT", the photo with heatmap composited
at 45%, the level digit + bilingual name + ScaleStrip, confidence percent, the
six ConfidenceBars (static, no animation in print), report ID (= analysis UUID
for history, or a derived hash id for a fresh analyze result), and a timestamp
via the next-intl formatter. Clicking "Report" calls `window.print()`; the user
picks "Save as PDF". Global `globals.css` gains a `@media print` block: hide
navbar/footer/backdrop/grain/buttons, force white background + black text ONLY
within the print document (the on-screen app stays dark), expand to full width.

No new npm dependencies (pure print CSS). New message keys under a `report`
namespace (title, fields, button label) in both locales. Numbers/dates via
next-intl formatters (Arabic-Indic digits in /ar).

Component-size guard: `ReportDocument.tsx` is its own file; keep < ~150 lines by
reusing `ScaleStrip`, `ConfidenceBars`, `ImageWithHeatmap`.

### A5. History stats dashboard

A new `components/history/HistoryStats.tsx` (named export, props
`{ analyses: Analysis[] }`) rendered by `HistoryClient` above `HistoryGrid` when
`analyses.length > 0`. Shows, computed client-side from already-fetched rows
(no API/schema change):

- Total assessments (JetBrains Mono, large).
- Average confidence (next-intl percent).
- A six-segment mini histogram: one bar per level 0–5 in its `lib/levels.ts`
  color, height ∝ count, with the count in mono beneath. Built on the existing
  `ScaleStrip` visual language (hairline frame, corner ticks optional).

All labels from a new `history.stats` message group (both locales). Hidden in
the empty state. Counts derive only from `DAMAGE_LEVELS` (no hardcoded level
list). Bars animate height on mount with the same stagger/reduced-motion gate
used by `ConfidenceBars`.

### A6. Testing / acceptance (sub-project A)

- `npx tsc --noEmit` zero errors; `npm run lint` clean; `npm run build` passes;
  api `pytest -q` + `ruff` stay green (no api change expected in A).
- Headless-chromium screenshots (snap chromium, write to `$HOME`, not `/tmp`)
  in `/en` AND `/ar` at 1440 and 390px for: landing, analyze (idle + analyzing
  + result), history (with ≥3 saved analyses, showing stats), how-it-works,
  login, 404. View every screenshot; confirm backdrops visible-but-legible,
  features present, RTL mirrored, no overflow.
- Heatmap slider: drag + keyboard both move the reveal; works in analyze and
  history modal.
- Live log: plays in real time; renders static under reduced motion.
- PDF: `window.print()` preview (or chromium `--print-to-pdf`) shows a clean
  light report with photo+heatmap, verdict, bars, id, timestamp; on-screen app
  remains dark.
- Reduced-motion run: no perpetual animations; log/bars/digits static.
- Re-verify the live E2E once (login → analyze → result with new log+slider →
  saved → history with stats → report) using the existing test account.

---

## B. Deployment (free, custom domain)

Sequenced AFTER A is merged to `main` and verified.

### B1. Web → Vercel at `project.razzak.me`

- Deploy `web/` as a Vercel project (Next.js auto-detected). Root directory
  `web`. Build command/output are Next defaults.
- Env vars set in Vercel (Production): `NEXT_PUBLIC_SUPABASE_URL`,
  `NEXT_PUBLIC_SUPABASE_ANON_KEY` (the existing publishable key),
  `NEXT_PUBLIC_API_URL` = the deployed API origin (see B2). These are inlined at
  build time, so a redeploy is required after the API URL is known.
- Domain: add `project.razzak.me`. DNS record the user adds in Cloudflare:
  `CNAME project → cname.vercel-dns.com.`, **proxy OFF (DNS only / grey cloud)**.
  The existing `_vercel` TXT already authorizes the account for `razzak.me`.
- Interactive step (user): `npx vercel login`, then the deploy is driven from
  the CLI.

### B2. API → Render free web service

- Deploy `api/` (the existing Dockerfile works as-is) as a Render free web
  service. Render injects `$PORT`; the container CMD must bind it. The current
  CMD hardcodes `--port 8000`, so add a Render-compatible start: either a
  `render.yaml` with `dockerCommand` using `$PORT`, or change CMD to
  `sh -c 'uvicorn main:app --host 0.0.0.0 --port ${PORT:-8000}'` (keeps
  local/docker-compose on 8000 via the default). Choose the CMD-edit approach so
  one image serves localhost, compose, and Render unchanged.
- Env on Render: `MOCK_MODE=true`, `CORS_ORIGINS=https://project.razzak.me`
  (plus `https://www.razzak.me` if used). Optional custom domain
  `api.razzak.me` (CNAME to the Render target) — nice-to-have, not required;
  if skipped, `NEXT_PUBLIC_API_URL` is the `onrender.com` URL.
- Free-tier caveat: the service sleeps after ~15 min idle; first request after
  sleep takes ~30–50s (cold start). Document a pre-demo warm-up: hit
  `/health` a minute before presenting. Note this in README.
- Interactive step (user): create a free Render account and connect the repo
  (or authorize the deploy).

### B3. Acceptance (sub-project B)

- `https://project.razzak.me` serves the app over HTTPS, both `/en` and `/ar`.
- Health: `GET <api>/health` → `{"status":"ok","mock":true}`; CORS allows the
  Vercel origin (a real browser analyze call from the deployed site succeeds —
  verify register/login/analyze/save/history against live Supabase).
- README updated: deployment section (URLs, env, warm-up note, custom-domain
  DNS), so the demo is reproducible.

---

## Error handling / edge cases

- Backdrops are decorative; all info stays in text — no SR/contrast regression
  if a photo fails (build fails on a missing local asset, the desired guard).
- Heatmap slider has no data dependency beyond `heatmapSrc`; when null the
  slider is not rendered (toggle already hidden in that case).
- PDF report uses only data already in the result/analysis; no network at print
  time. If a signed image URL has expired in history, the report shows the same
  placeholder the modal already does.
- Stats dashboard divides by `analyses.length` only inside the `> 0` branch.

## Out of scope

- Real model / real Grad-CAM (still later; mock stays).
- Any DB schema or API contract change (B2's start-command edit is operational,
  not contract).
- Server-side PDF generation, charting libraries, animation libraries beyond
  the existing framer-motion.
- Paid hosting, paid fonts, analytics.
