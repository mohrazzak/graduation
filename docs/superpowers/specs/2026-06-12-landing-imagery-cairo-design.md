# Landing imagery + Cairo Arabic font — design

Date: 2026-06-12 · Status: approved direction (option B + Cairo)
Amends the master spec (`2026-06-12-damagescale-design.md`) §8: this document
overrides the Arabic font choice and adds photographic imagery to the landing
page. Everything else in the master spec still applies (restraint rules,
logical properties, zero hardcoded strings, reduced-motion gates, <150-line
components).

## Goal

The landing page reads as "empty black" — pure typography. Add real photographs
of damaged/destroyed buildings so the subject matter is visible at first paint,
and replace the flat-feeling Arabic font with Cairo so `/ar` headlines carry
the same weight as the English Archivo ones.

## 1. Fonts

- `web/lib/fonts.ts`: replace `IBM_Plex_Sans_Arabic` (weights 400–700) with
  `Cairo` from `next/font/google` — variable font, load weights 400–900,
  subsets `["arabic", "latin"]`, keep the CSS variable name `--font-arabic`.
- Nothing else changes: `globals.css` already remaps `--font-display` and
  `--font-body` to `var(--font-arabic)` under `html[dir="rtl"]`, JetBrains Mono
  keeps the data role with the Arabic fallback chain, and the RTL
  letter-spacing neutralization stays.
- Win: Cairo's 800/900 weights give Arabic display headings real punch
  (Plex Arabic stops at 700). Latin stack (Archivo/Inter/JetBrains Mono) is
  unchanged — it is the design identity.
- `CLAUDE.md` and the master spec §8 font row get a one-line correction
  (IBM Plex Sans Arabic → Cairo) so docs stay truthful.

## 2. Landing imagery (option B)

### Sourcing

- 7 free-licensed photos (Unsplash / Pexels / Wikimedia Commons): one dramatic
  collapsed building for the hero + one per damage level 0–5 whose visible
  damage plausibly matches the level (intact facade → hairline cracks →
  broken windows/cracked masonry → heavy structural cracks → partial
  collapse → rubble field).
- Stored at `web/public/landing/hero.jpg` and `web/public/landing/level-{0..5}.jpg`,
  downscaled (hero ≤ 1920px wide, cards ≤ 800px) and recompressed so the
  combined payload stays small (target: hero ≤ 350 KB, cards ≤ 120 KB each).
- `web/public/landing/CREDITS.md` records source URL, photographer, and
  license per file (required for a university submission).

### Hero (`components/landing/Hero.tsx`)

- Full-bleed background photo behind the existing headline/CTA/scale: an
  absolutely positioned `next/image` (`fill`, `object-cover`, `priority`)
  inside the hero `<section>`, marked `aria-hidden` (decorative — the headline
  carries the meaning).
- Treatment to preserve readability and the instrument aesthetic: CSS
  `grayscale` + reduced `brightness` on the image, plus a solid
  `bg-bg/70`-style scrim overlay (a flat overlay, NOT a gradient — spec §8
  forbids gradients). Global film grain already sits above it. Hairline
  `line` border on the section's bottom edge.
- The animated ScaleStrip, cycling captions, and reduced-motion legend are
  untouched; contrast of headline/muted text over the darkened photo must
  still meet WCAG AA (the scrim guarantees an effectively ≤ #2e2e2e backdrop).

### Level cards (`components/landing/LevelsGrid.tsx`)

- Each of the six cards gains a photo thumbnail at the top: `next/image`,
  fixed aspect (3:2), `object-cover`, near-grayscale treatment, hairline
  border below it. The existing color bar / digit / bilingual names move
  beneath the photo unchanged; levels 4–5 keep their existing alert styling.
- Alt text is informative and translated: new message keys
  `landing.levelPhotoAlt` (en/ar) interpolating the level name — no hardcoded
  strings in JSX.
- If the card markup outgrows ~150 lines, extract a `LevelCard` component
  (named export, explicit props).

## Error handling / edge cases

- Local static images — no network failure mode beyond Next's own 404 (build
  fails if files are missing, which is the desired guard).
- Photos are decorative reinforcements; all information remains in text, so
  nothing degrades for screen readers.
- No new animation → no new reduced-motion work.

## Testing / acceptance

- `npx tsc --noEmit` zero errors; `npm run lint` clean; `npm run build` passes.
- Visual check at 390px and 1440px in `/en` and `/ar` (RTL mirror intact):
  hero photo visible but type legible; six card photos render with correct
  severity ordering.
- `/ar` headlines render in Cairo (verify via served `@font-face` rules and a
  screenshot comparison), numbers still JetBrains Mono.
- Docker image rebuilds and serves the new assets (`docker compose up --build`).

## Out of scope

- "How it works" photo band (option C — rejected: fights the restraint rule).
- Any change to analyze/history pages, the Latin fonts, or the sample images.
