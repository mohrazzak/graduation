# Evaluator wow-pack + page backdrops + free deployment — design

Date: 2026-06-12 · Status: approved (user: all four wow features + backdrops + deploy)
Amends the master spec (`2026-06-12-damagescale-design.md`): adds photographic
backdrops beyond the landing page, four presentation features, and stretches
the scan floor from 1.2 s to 2.4 s. All other master-spec rules still bind:
no gradients, logical properties only, zero hardcoded strings, TS strict,
components < ~150 lines, reduced-motion gates every animation, `alert` color
reserved for levels 4–5.

Two sub-projects, implemented in order:
- **Part A — visual/wow upgrade** (one implementation plan, starts now).
- **Part B — deployment** (small follow-up plan; blocks on user accounts).

## Part A

### A1. Page backdrops (`components/layout/PageBackdrop.tsx`)

- New server component, named export, props `{ photo: string }`. Renders a
  `position: fixed; inset: 0` layer behind everything: `next/image` (`fill`,
  `priority`, `object-cover`, `alt=""`, `aria-hidden`) with `grayscale`
  `brightness-[0.2]`, plus a flat `bg-bg/85` scrim (no gradients). The layer
  sits at `z-index: -2` so the existing film-grain `body::before` (z -1) still
  textures it, and content stacks above untouched.
- Used on: analyze, history, how-it-works, login, register, not-found pages
  (first child of the page wrapper). Landing keeps its bespoke hero treatment.
- Five new free-licensed photos in `web/public/backdrops/` with a CREDITS.md
  (same sourcing/budget workflow as landing: Wikimedia Commons, ≤1920px,
  ≤350 KB each): `analyze.jpg` (inspection/scaffolding), `history.jpg`
  (weathered facade rows), `how.jpg` (rebar/concrete structural detail),
  `auth.jpg` (dark concrete texture; shared by login+register), `notfound.jpg`
  (rubble). Severity-neutral subjects — backdrops must not look like a verdict.
- Readability is the hard constraint: with brightness 0.2 + bg/85 scrim the
  effective backdrop is darker than `surface`, so all existing AA contrast
  margins hold. Cards/panels render on `surface` exactly as today.

### A2. Heatmap reveal slider (in `components/analyze/ImageWithHeatmap.tsx`)

- When the heatmap is visible, a draggable vertical divider sweeps it across
  the photo: the heatmap layer gets `clip-path: inset(...)` from 0–100 % and a
  handle line sits at the boundary. Pointer events (mouse + touch) drag it;
  the handle is also a real keyboard slider (`role="slider"`,
  `aria-valuemin/max/now`, Arrow ±5, Home/End, visible focus ring).
- Direction-aware: the sweep origin follows the document direction (starts
  from the inline-start edge in both LTR and RTL). Initial position 50 %.
- The existing show/hide HeatmapToggle stays (accessible fallback and the
  reveal's on/off switch). Works on the analyze result and in the history
  detail modal through the same component. New message keys under
  `analyze.reveal.*` (label + aria description), en + ar.
- Not an animation (user-driven), so no reduced-motion gate needed; no
  transition on the clip-path while dragging.

### A3. Live analysis log (in `components/analyze/ScanOverlay.tsx`)

- During the analyzing phase, a terminal-style checklist types onto the scan
  overlay (JetBrains Mono, text-xs): six lines from `analyze.scanLog.lines.*`
  (en: "ACQUIRING FRAME", "NORMALIZING EXPOSURE", "EDGE DENSITY MAP",
  "SCORING 6 DAMAGE CLASSES", "GENERATING GRAD-CAM", "COMPILING VERDICT";
  Arabic equivalents in the same technical register), each gaining a
  hazard-colored "OK" tick (`analyze.scanLog.ok`) as it completes, one line
  every ~350 ms.
- `MIN_SCAN_MS` in AnalyzeClient: 1200 → 2400 so the log completes one full
  pass (master-spec timing amended by this doc).
- `useReducedMotion`: render the complete list statically — no interval, no
  typing. Screen readers: the overlay stays `aria-hidden`; the existing
  "ANALYZING STRUCTURE..." status text remains the announced state.

### A4. PDF inspection report (print stylesheet, zero dependencies)

- New `components/report/ReportSheet.tsx` (named export, props
  `{ analysis-shaped data: image src, heatmap src or