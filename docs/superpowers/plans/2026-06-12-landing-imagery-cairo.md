# Landing Imagery + Cairo Arabic Font Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the landing page's "empty black" with treated photos of damaged buildings (hero backdrop + one photo per level card) and swap the Arabic font from IBM Plex Sans Arabic to Cairo.

**Architecture:** Static, free-licensed photos live in `web/public/landing/` and are rendered with `next/image` (no config changes needed for local assets). The font swap touches only `web/lib/fonts.ts` + the import in the locale layout — the `--font-arabic` CSS variable name is kept so the existing RTL remap in `globals.css` keeps working untouched.

**Tech Stack:** Next.js App Router, next/font/google, next/image, Tailwind v4 (logical properties only), next-intl messages, Wikimedia Commons API for sourcing, Pillow (from `api/.venv`) for resizing.

**Testing model:** This repo has no JS unit-test runner; the project's quality gates are `npx tsc --noEmit` (zero errors), `npm run lint`, `npm run build`, and visual verification via headless-chromium screenshots in BOTH `/en` and `/ar` (the snap chromium at `/snap/bin/chromium` works — see Task 5). Spec: `docs/superpowers/specs/2026-06-12-landing-imagery-cairo-design.md`.

---

### Task 1: Source, review, and resize the 7 photos

**Files:**
- Create: `web/public/landing/hero.jpg`, `web/public/landing/level-0.jpg` … `level-5.jpg`
- Create: `web/public/landing/CREDITS.md`

- [ ] **Step 1: Search Wikimedia Commons for candidates (one query per slot)**

Commons is preferred: scriptable API, explicit license metadata, lots of post-earthquake photography. Run for each slot, adjusting `gsrsearch` if results are weak:

```bash
mkdir -p /tmp/landing && cd /tmp/landing
search() {  # $1 = slot name, $2 = query
  curl -s "https://commons.wikimedia.org/w/api.php?action=query&format=json&generator=search&gsrsearch=filetype:bitmap%20$(python3 -c "import urllib.parse,sys;print(urllib.parse.quote(sys.argv[1]))" "$2")&gsrlimit=8&gsrnamespace=6&prop=imageinfo&iiprop=url%7Cextmetadata&iiurlwidth=1920" > "$1.json"
  python3 - "$1" <<'PY'
import json, sys
slot = sys.argv[1]
data = json.load(open(f"{slot}.json"))
for p in (data.get("query", {}).get("pages", {}) or {}).values():
    ii = p["imageinfo"][0]; meta = ii.get("extmetadata", {})
    lic = meta.get("LicenseShortName", {}).get("value", "?")
    artist = meta.get("Artist", {}).get("value", "?")[:60]
    print(f"{lic:14} | {p['title'][:70]}\n  thumb: {ii.get('thumburl')}\n  page:  {ii.get('descriptionurl')}\n  by:    {artist}")
PY
}
search hero    "collapsed building earthquake damage"
search level-0 "modern apartment building facade"
search level-1 "cracked plaster wall building"
search level-2 "broken windows damaged building"
search level-3 "earthquake structural damage cracks building"
search level-4 "partially collapsed building earthquake"
search level-5 "earthquake destroyed building rubble"
```

- [ ] **Step 2: Download the best candidates and review them visually**

Only accept licenses in {Public domain, CC0, CC BY x.x, CC BY-SA x.x}. Download each chosen `thumburl` as `/tmp/landing/<slot>-raw.jpg` with `curl -sL -o`, then **view every file with the Read tool** and judge: hero must be dramatic and read at 25–35% brightness; each level photo must plausibly match its severity (0 intact … 5 rubble). If a slot has no good candidate, re-run `search` with alternate terms (e.g. "war damaged building", "abandoned house cracks", "demolition rubble site") until it does.

- [ ] **Step 3: Resize and compress with Pillow from the api venv**

```bash
/home/mohrazzak/projects/grad_proj/api/.venv/bin/python - <<'PY'
from PIL import Image, ImageOps
from pathlib import Path
OUT = Path("/home/mohrazzak/projects/grad_proj/web/public/landing"); OUT.mkdir(exist_ok=True)
SPECS = {"hero": (1920, 80)} | {f"level-{i}": (800, 75) for i in range(6)}
for slot, (max_w, quality) in SPECS.items():
    src = Path(f"/tmp/landing/{slot}-raw.jpg")
    img = ImageOps.exif_transpose(Image.open(src)).convert("RGB")
    if img.width > max_w:
        img = img.resize((max_w, round(img.height * max_w / img.width)), Image.LANCZOS)
    img.save(OUT / f"{slot}.jpg", "JPEG", quality=quality, optimize=True, progressive=True)
    print(slot, img.size, (OUT / f"{slot}.jpg").stat().st_size // 1024, "KB")
PY
```

- [ ] **Step 4: Check budgets**

Run: `ls -la web/public/landing/`
Expected: `hero.jpg` ≤ ~350 KB, each `level-*.jpg` ≤ ~120 KB. If over, rerun Step 3 with quality −10.

- [ ] **Step 5: Write `web/public/landing/CREDITS.md`** — one entry per file using the metadata captured in Step 1 (university submissions need this):

```markdown
# Landing image credits

All photos are free-licensed; treated (grayscale/darkened/resized) for this site.

| File | Source | Author | License |
| ---- | ------ | ------ | ------- |
| hero.jpg | <Commons page URL> | <artist> | <license short name> |
| level-0.jpg | <Commons page URL> | <artist> | <license short name> |
| … one row per remaining file … |
```

(The `<…>` cells are filled from Step 1's printed `page:`/`by:`/license values — they are data captured at execution time, not design decisions.)

- [ ] **Step 6: Commit**

```bash
git add web/public/landing && git commit -m "feat(web): add free-licensed landing photos + credits"
```

---

### Task 2: Swap Arabic font to Cairo

**Files:**
- Modify: `web/lib/fonts.ts` (whole file below)
- Modify: `web/app/[locale]/layout.tsx:10-15,52` (import + className)
- Modify: `web/app/globals.css:21-22` (comment only)
- Modify: `CLAUDE.md` (font row), `docs/superpowers/specs/2026-06-12-damagescale-design.md` (§8 font row)

- [ ] **Step 1: Replace `web/lib/fonts.ts` with:**

```ts
// Three typographic roles — display (Archivo), body (Inter), data (JetBrains Mono) —
// plus the Arabic variant (Cairo) are part of the design identity (spec section 8,
// Arabic font amended by specs/2026-06-12-landing-imagery-cairo-design.md).
import { Archivo, Cairo, Inter, JetBrains_Mono } from "next/font/google";

export const archivo = Archivo({
  weight: ["700", "800", "900"],
  subsets: ["latin"],
  variable: "--font-archivo",
});

export const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
});

export const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains",
});

// Cairo is a variable font (wght 200-1000): one file covers every weight, so
// Arabic display headings get the same heavy punch as Archivo's Latin ones.
export const cairo = Cairo({
  subsets: ["arabic"],
  variable: "--font-arabic",
});
```

- [ ] **Step 2: Update `web/app/[locale]/layout.tsx`** — the import block becomes:

```ts
import { archivo, cairo, inter, jetbrainsMono } from "@/lib/fonts";
```

and the `<html>` className swaps `${ibmPlexSansArabic.variable}` for `${cairo.variable}` (keep the other three and `h-full antialiased` exactly as they are).

- [ ] **Step 3: Update the two comments in `web/app/globals.css`** that name the old font. Line 21–22 comment becomes:

```css
/* Arabic remaps display + body roles to Cairo; the data role
   stays JetBrains Mono — monospace digits are part of the identity (spec section 8). */
```

and in the comment above `--font-mono` (lines 26–29) replace "IBM Plex Sans Arabic" with "Cairo". Same for the comment on line ~50 (`/* --font-body resolves per locale (Inter / Cairo via the dir remap above). */`). No rule changes — comments only.

- [ ] **Step 4: Correct the docs**

In `CLAUDE.md`, in the "Design system" fonts row, replace `IBM Plex Sans Arabic (ar)` with `Cairo (ar)`.
In `docs/superpowers/specs/2026-06-12-damagescale-design.md`, find the §8 font line: `grep -n "IBM Plex Sans Arabic" docs/superpowers/specs/2026-06-12-damagescale-design.md` and replace each hit with `Cairo` plus the suffix `(amended 2026-06-12, see landing-imagery-cairo design doc)` on the first hit only.

- [ ] **Step 5: Gate**

Run (from `web/`): `npx tsc --noEmit && npm run lint`
Expected: zero errors. (`ibmPlexSansArabic` no longer exists, so a stale reference anywhere fails the type gate — that's the test.)

- [ ] **Step 6: Commit**

```bash
git add web/lib/fonts.ts "web/app/[locale]/layout.tsx" web/app/globals.css CLAUDE.md docs/superpowers/specs/2026-06-12-damagescale-design.md
git commit -m "feat(web): swap Arabic font to Cairo (400-900) behind --font-arabic"
```

---

### Task 3: Hero photo backdrop

**Files:**
- Modify: `web/components/landing/Hero.tsx` (imports + the returned JSX shell; the headline/CTA/ScaleStrip content moves inside unchanged)

- [ ] **Step 1: Add the image import** at the top of `Hero.tsx`:

```ts
import Image from "next/image";
```

- [ ] **Step 2: Re-shell the returned JSX.** The current root is
`<section className="mx-auto w-full max-w-6xl px-4 py-16 sm:py-24">…</section>`.
Replace it with (existing children — `<h1>` through the closing of the ScaleStrip block — move verbatim into the inner div):

```tsx
return (
  <section className="relative isolate overflow-hidden border-b border-line">
    {/* Decorative backdrop: meaning stays in the headline, so alt="" + aria-hidden. */}
    <Image
      src="/landing/hero.jpg"
      alt=""
      aria-hidden="true"
      fill
      priority
      sizes="100vw"
      className="object-cover grayscale brightness-[0.3]"
    />
    {/* Flat scrim, NOT a gradient (spec §8 bans gradients): guarantees AA contrast
        for text over any photo region. */}
    <div aria-hidden="true" className="absolute inset-0 bg-bg/70" />
    <div className="relative mx-auto w-full max-w-6xl px-4 py-16 sm:py-24">
      {/* …existing h1 / p / Button / ScaleStrip block, unchanged… */}
    </div>
  </section>
);
```

No logical-property violations (only `inset-0`/centered utilities). The reduced-motion behavior is untouched — the photo is static.

- [ ] **Step 3: Gate**

Run (from `web/`): `npx tsc --noEmit && npm run build`
Expected: both clean. The build also fails loudly if `/landing/hero.jpg` is missing.

- [ ] **Step 4: Commit**

```bash
git add web/components/landing/Hero.tsx
git commit -m "feat(web): hero backdrop photo with grayscale + flat scrim treatment"
```

---

### Task 4: Level-card photos + translated alt text

**Files:**
- Modify: `web/components/landing/LevelsGrid.tsx`
- Modify: `web/messages/en.json`, `web/messages/ar.json` (one key each in `landing`)

- [ ] **Step 1: Add the message key** inside the `landing` object of both catalogs (next to `levelsSub`):

`web/messages/en.json`:
```json
"levelPhotoAlt": "Example building photo — {name}"
```

`web/messages/ar.json`:
```json
"levelPhotoAlt": "صورة مبنى توضيحية — {name}"
```

- [ ] **Step 2: Add the thumbnail to each card** in `LevelsGrid.tsx`. Add `import Image from "next/image";` to the imports, then insert as the FIRST child inside `<Card ticks className="h-full">` (above the color-bar div):

```tsx
<div className="relative mb-4 aspect-3/2 overflow-hidden rounded border border-line">
  <Image
    src={`/landing/level-${level.id}.jpg`}
    alt={t("landing.levelPhotoAlt", { name: t(`levels.${level.key}.name`) })}
    fill
    sizes="(min-width: 1024px) 360px, (min-width: 640px) 50vw, 100vw"
    className="object-cover grayscale-60"
  />
</div>
```

Framed inside the card padding (not bleeding to the edges) so the CornerTicks registration marks stay visible — the photo reads as a mounted survey print. `grayscale-60` keeps a trace of color; levels 4–5 card styling is unchanged.

- [ ] **Step 3: Gate**

Run (from `web/`): `npx tsc --noEmit && npm run lint && npm run build`
Expected: all clean. LevelsGrid stays well under the 150-line component cap (≈65 lines) — no extraction needed.

- [ ] **Step 4: Commit**

```bash
git add web/components/landing/LevelsGrid.tsx web/messages/en.json web/messages/ar.json
git commit -m "feat(web): severity-matched photos on the six level cards"
```

---

### Task 5: Full visual verification + docker rebuild

**Files:** none (verification only)

- [ ] **Step 1: Rebuild and start the demo**

Run (repo root): `docker compose up -d --build web`
Expected: exits 0; `curl -s -o /dev/null -w '%{http_code}' http://localhost:3000/en` → `200` (retry up to ~60 s for boot).

- [ ] **Step 2: Confirm Cairo is actually served**

```bash
css=$(curl -s http://localhost:3000/ar | grep -oE 'href="[^"]*\.css[^"]*"' | head -1 | sed 's/href="//;s/"//')
curl -s "http://localhost:3000$css" | grep -c "font-family:Cairo"
```
Expected: ≥ 1 (and `grep -c "IBM Plex"` on the same CSS returns 0).

- [ ] **Step 3: Screenshot matrix — view EVERY file with the Read tool**

```bash
for combo in "en 1440,2600" "ar 1440,2600" "en 390,3200" "ar 390,3200"; do
  set -- $combo
  /snap/bin/chromium --headless=new --no-sandbox --disable-gpu \
    --window-size=$2 --screenshot=/tmp/landing-$1-${2%%,*}.png "http://localhost:3000/$1" 2>/dev/null
done
```

Acceptance per screenshot: hero photo visible but headline/CTA clearly legible; six card photos present with severity increasing 0→5; `/ar` fully mirrored with Cairo headlines (visibly heavier than before); nothing overflows at 390 px.

- [ ] **Step 4: Reduced-motion + keyboard spot-check** — the change adds no animation, so verify only that the hero photo doesn't break the reduced-motion legend layout: re-screenshot `/en` with `--force-prefers-reduced-motion` and confirm the static legend renders over the backdrop.

- [ ] **Step 5: Final commit (if any fixups were needed) and report**

Fixups discovered by screenshots (brightness, scrim opacity, photo swaps) are tuned by editing the `brightness-[0.3]` / `bg-bg/70` values or re-running Task 1 Step 3, then re-running this task. Commit fixups as `polish(web): tune landing photo treatment`.

---

## Self-review notes

- Spec coverage: sourcing/budgets/credits → Task 1; fonts + doc corrections → Task 2; hero → Task 3; cards + alt keys → Task 4; acceptance checks (tsc/lint/build, both locales, Cairo served, 390/1440, docker) → Tasks 2–5. No gaps.
- No placeholders beyond execution-time data capture (image URLs/authors can only be known at search time; the capture procedure is fully specified).
- Naming consistency: `cairo` export (Task 2) matches the layout import; `--font-arabic` variable unchanged everywhere; `/landing/<slot>.jpg` paths identical across Tasks 1, 3, 4.
