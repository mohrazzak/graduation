# Premium Upgrade (Backdrops + Wow Features) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Photographic backdrops on every content page plus four evaluator-facing features: live analysis log, heatmap reveal slider, history stats dashboard, and a print-CSS PDF inspection report.

**Architecture:** One fixed decorative `PageBackdrop` server component behind each page; features extend the existing client components (`ScanOverlay`, `ImageWithHeatmap`, `HistoryClient`, `ResultPanel`/`AnalysisModal`) without touching the API contract or DB schema. The PDF report is a portal-rendered print-only document — zero new dependencies.

**Tech Stack:** Next.js App Router, next/image, Tailwind v4 (logical props only), framer-motion (existing), next-intl, print CSS, Wikimedia Commons + Pillow for photo sourcing.

**Testing model:** No JS unit runner exists; gates are `npx tsc --noEmit`, `npm run lint`, `npm run build` (from `web/`), api `pytest -q` + `ruff check .` unchanged, and headless-chromium visual verification. Spec: `docs/superpowers/specs/2026-06-12-premium-upgrade-deploy-design.md`.

**Environment gotchas (read before Task 7):** snap chromium CANNOT write screenshots to `/tmp` — pass output paths under `$HOME`. For interaction-dependent captures (scan log mid-flight, slider, print emulation) use the playwright install at `/tmp/e2e` driving snap chromium over CDP: start `/snap/bin/chromium --headless=new --no-sandbox --disable-gpu --remote-debugging-port=9222 --user-data-dir=$HOME/.cache/cdp-profile about:blank &`, then `chromium.connectOverCDP("http://localhost:9222")`. Test login: `e2e.damagescale.gradproj@gmail.com` / `E2eDemo!2026`. The docker web image must be rebuilt (`docker compose up -d --build web`) before browser verification.

---

### Task 1: Source 5 backdrop photos + CREDITS.md

**Files:**
- Create: `web/public/backgrounds/{analyze,history,how-it-works,auth,404}.jpg`
- Create: `web/public/backgrounds/CREDITS.md`

- [ ] **Step 1: Search Wikimedia Commons per slot** — same `search()` helper as the landing plan (`docs/superpowers/plans/2026-06-12-landing-imagery-cairo.md` Task 1 Step 1, copy it verbatim into `/tmp/backgrounds/`), with these queries (vary terms if results are weak):

```bash
search analyze      "construction scaffolding concrete building facade"
search history      "old weathered archive building facade"
search how-it-works "reinforced concrete rebar construction detail"
search auth         "dark concrete wall texture"
search 404          "building rubble demolition site"
```

- [ ] **Step 2: Download candidates (`curl -sL -A "Mozilla/5.0" -o`), VIEW each with the Read tool.** Licenses restricted to {Public domain, CC0, CC BY x.x, CC BY-SA x.x}. Judge: each photo must read as its subject when displayed at brightness 0.18 behind an 85% scrim — prefer strong large-scale structure over fine detail. Landscape orientation strongly preferred (these are full-viewport `object-cover` fills).

- [ ] **Step 3: Resize with Pillow (api venv): max width 1920, JPEG quality 80, progressive** — same script shape as the landing plan but with `SPECS = {s: (1920, 80) for s in ("analyze","history","how-it-works","auth","404")}` and output dir `web/public/backgrounds`. Budget: ≤ 300 KB each (drop quality −10 and retry if over).

- [ ] **Step 4: Write `web/public/backgrounds/CREDITS.md`** — same table format as `web/public/landing/CREDITS.md` (file | source page URL | author, HTML stripped | license), 5 rows.

- [ ] **Step 5: Commit**

```bash
git add web/public/backgrounds && git commit -m "feat(web): free-licensed page backdrop photos + credits"
```

---

### Task 2: PageBackdrop component, wired into six pages

**Files:**
- Create: `web/components/layout/PageBackdrop.tsx`
- Modify: `web/app/[locale]/analyze/page.tsx`, `web/app/[locale]/history/page.tsx`, `web/app/[locale]/how-it-works/page.tsx`, `web/app/[locale]/login/page.tsx`, `web/app/[locale]/register/page.tsx`, `web/app/[locale]/not-found.tsx`

- [ ] **Step 1: Create `web/components/layout/PageBackdrop.tsx`** (server component — no "use client"):

```tsx
// Fixed decorative photo backdrop for content pages: grayscale, darkened far
// below the landing hero, flat scrim — content cards stay opaque bg-surface
// (spec: premium-upgrade design A1).
import Image from "next/image";

export interface PageBackdropProps {
  /** Path under public/, e.g. "/backgrounds/analyze.jpg". */
  src: string;
}

export function PageBackdrop({ src }: PageBackdropProps) {
  return (
    // -z-10 sits below the film grain (body::before, z -1) and all content,
    // but still above the propagated body background.
    <div aria-hidden="true" className="fixed inset-0 -z-10">
      <Image
        src={src}
        alt=""
        fill
        sizes="100vw"
        className="object-cover grayscale brightness-[0.18]"
      />
      {/* Flat scrim, NOT a gradient (master spec §8): guarantees AA contrast. */}
      <div className="absolute inset-0 bg-bg/85" />
    </div>
  );
}
```

- [ ] **Step 2: Wire into the six pages.** In each file, import `{ PageBackdrop } from "@/components/layout/PageBackdrop";` and insert as the first child of the page's outermost JSX (inside `AuthGuard` where present). Mapping:

| File | src |
| ---- | --- |
| analyze/page.tsx | `/backgrounds/analyze.jpg` |
| history/page.tsx | `/backgrounds/history.jpg` |
| how-it-works/page.tsx | `/backgrounds/how-it-works.jpg` |
| login/page.tsx | `/backgrounds/auth.jpg` |
| register/page.tsx | `/backgrounds/auth.jpg` |
| not-found.tsx | `/backgrounds/404.jpg` |

Example (analyze — the others follow identically):

```tsx
return (
  <AuthGuard nextPath="/analyze">
    <PageBackdrop src="/backgrounds/analyze.jpg" />
    <div className="mx-auto w-full max-w-6xl px-4 py-10">
      …existing content unchanged…
    </div>
  </AuthGuard>
);
```

`not-found.tsx` uses `useTranslations` (client-compatible page) but is a server-rendered component — `PageBackdrop` drops in the same way before the existing flex div.

- [ ] **Step 3: Gate** — from `web/`: `npx tsc --noEmit && npm run lint && npm run build`. All clean (build fails if a backgrounds file is missing — desired guard).

- [ ] **Step 4: Commit**

```bash
git add web/components/layout/PageBackdrop.tsx "web/app/[locale]" && git commit -m "feat(web): photographic backdrops on all content pages"
```

---

### Task 3: Live analysis log

**Files:**
- Modify: `web/components/analyze/ScanOverlay.tsx`
- Modify: `web/components/analyze/AnalyzeClient.tsx` (one constant + comment)
- Modify: `web/messages/en.json`, `web/messages/ar.json`

- [ ] **Step 1: Add the log lines to both catalogs** inside the `analyze` object (after `"analyzing"`). next-intl reads string arrays via `t.raw()`:

`en.json`:
```json
"scanLog": [
  "> ACQUIRING FRAME ............ OK",
  "> NORMALIZING EXPOSURE ....... OK",
  "> EDGE DENSITY MAP ........... OK",
  "> LOCATING STRUCTURE ......... OK",
  "> SCORING 6 DAMAGE CLASSES ..."
],
```

`ar.json`:
```json
"scanLog": [
  "> التقاط الإطار ............ تم",
  "> معايرة الإضاءة ........... تم",
  "> خريطة كثافة الحواف ....... تم",
  "> تحديد موقع المنشأ ........ تم",
  "> تقييم مستويات الضرر الستة .."
],
```

- [ ] **Step 2: Extend `ScanOverlay.tsx`.** Keep the sweep line and pulsing label exactly as they are; add the typed log top-start. Full new component body:

```tsx
"use client";
// Analyzing-state overlay: hazard scan line sweeps on a loop, the mono status
// line pulses, and a terminal-style log types out inspection steps (spec:
// premium-upgrade A3). Reduced motion: static text, full log, no sweep.
import { motion, useReducedMotion } from "framer-motion";
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Spinner } from "@/components/ui/Spinner";

const SWEEP_S = 1.2;
const LINE_MS = 380; // 5 lines ≈ 1.9s, inside the 2.4s scan floor

export function ScanOverlay() {
  const t = useTranslations("analyze");
  const reduced = useReducedMotion() ?? false;
  // t.raw: scanLog is an array message — typed access via cast, no `any` binding.
  const lines = t.raw("scanLog") as string[];
  const [shown, setShown] = useState(reduced ? lines.length : 1);

  useEffect(() => {
    if (reduced) return undefined;
    const id = window.setInterval(() => {
      setShown((count) => Math.min(count + 1, lines.length));
    }, LINE_MS);
    return () => window.clearInterval(id);
  }, [reduced, lines.length]);

  return (
    <div role="status" className="absolute inset-0 overflow-hidden bg-bg/40">
      <ul className="absolute start-3 top-3 space-y-1 font-mono text-[10px] leading-tight text-hazard/90">
        {lines.slice(0, shown).map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
      {reduced ? (
        <div className="flex h-full items-center justify-center gap-3">
          <Spinner />
          <span className="font-mono text-xs uppercase tracking-widest">{t("analyzing")}</span>
        </div>
      ) : (
        <>
          {/* translateY(-100%) keeps the trail behind (above) the line, so the
              sweep enters at the top edge and exits exactly at the bottom. */}
          <motion.div
            aria-hidden="true"
            className="absolute inset-x-0 -translate-y-full"
            initial={{ top: "0%" }}
            animate={{ top: "100%" }}
            transition={{ duration: SWEEP_S, repeat: Infinity, ease: "linear" }}
          >
            <div className="h-16 bg-linear-to-b from-transparent to-hazard/20" />
            <div className="h-0.5 bg-hazard shadow-[0_0_12px_var(--color-hazard)]" />
          </motion.div>
          <motion.span
            className="absolute inset-x-0 bottom-4 text-center font-mono text-xs uppercase tracking-widest text-hazard"
            animate={{ opacity: [1, 0.35, 1] }}
            transition={{ duration: SWEEP_S, repeat: Infinity, ease: "easeInOut" }}
          >
            {t("analyzing")}
          </motion.span>
        </>
      )}
    </div>
  );
}
```

(Note: `bg-linear-to-b` is the pre-existing scan-line trail, explicitly grandfathered — do not add NEW gradients.)

- [ ] **Step 3: Raise the scan floor in `AnalyzeClient.tsx`:**

```ts
// The scan must read as one full sweep AND give the inspection log time to
// type out (5 lines × 380ms) even when the mock answers in milliseconds.
const MIN_SCAN_MS = 2400;
```

- [ ] **Step 4: Gate** — `npx tsc --noEmit && npm run lint && npm run build` clean; `node -e "JSON.parse(...)"` both catalogs.

- [ ] **Step 5: Commit**

```bash
git add web/components/analyze web/messages && git commit -m "feat(web): terminal-style live analysis log during the scan"
```

---

### Task 4: Heatmap reveal slider

**Files:**
- Create: `web/components/analyze/HeatmapRevealLayer.tsx`
- Modify: `web/components/analyze/ImageWithHeatmap.tsx`
- Modify: `web/messages/en.json`, `web/messages/ar.json`

- [ ] **Step 1: Message key** in both catalogs inside `analyze` (after `heatmapAlt`): en `"heatmapReveal": "Heatmap reveal"`, ar `"heatmapReveal": "كشف الخريطة الحرارية"`.

- [ ] **Step 2: Create `web/components/analyze/HeatmapRevealLayer.tsx`:**

```tsx
"use client";
// Heatmap overlay + reveal slider: a real range input sweeps the heatmap
// across the photo via clip-path (spec: premium-upgrade A2). Mounted only
// while the heatmap is visible, so reveal state resets to 100 on each show.
import { motion } from "framer-motion";
import { useState } from "react";
import { useTranslations } from "next-intl";

export interface HeatmapRevealLayerProps {
  src: string;
  alt: string;
  /** Overlay opacity, supplied by ImageWithHeatmap (spec section 9: 0.45). */
  opacity: number;
  fadeDuration: number;
}

export function HeatmapRevealLayer({ src, alt, opacity, fadeDuration }: HeatmapRevealLayerProps) {
  const t = useTranslations("analyze");
  const [reveal, setReveal] = useState(100);
  const hidden = 100 - reveal;
  // clip-path has no logical-property form; mirror the inset side by dir.
  // SSR-safe: at reveal=100 both branches are inset(0 0 0 0), so first paint
  // matches regardless of document availability.
  const rtl = typeof document !== "undefined" && document.dir === "rtl";
  const clipPath = rtl ? `inset(0 0 0 ${hidden}%)` : `inset(0 ${hidden}% 0 0)`;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: fadeDuration }}
      className="absolute inset-0"
    >
      <img src={src} alt={alt} style={{ opacity, clipPath }} className="h-full w-full" />
      {/* Divider at the clip boundary; the range input below owns interaction. */}
      {reveal > 0 && reveal < 100 ? (
        <span
          aria-hidden="true"
          style={{ insetInlineStart: `${reveal}%` }}
          className="pointer-events-none absolute inset-y-0 w-0.5 bg-hazard shadow-[0_0_8px_var(--color-hazard)]"
        />
      ) : null}
      <input
        type="range"
        min={0}
        max={100}
        value={reveal}
        aria-label={t("heatmapReveal")}
        onChange={(event) => setReveal(Number(event.target.value))}
        className="absolute inset-x-3 bottom-3 h-1 cursor-ew-resize appearance-none rounded-none bg-line accent-hazard"
      />
    </motion.div>
  );
}
```

(`@next/next/no-img-element` is already disabled inline in `ImageWithHeatmap` for the same blob/signed-URL reason — add the same `eslint-disable-next-line` comment above this `<img>`.)

- [ ] **Step 3: Swap the overlay in `ImageWithHeatmap.tsx`.** Replace the `motion.img` block inside `<AnimatePresence>` with:

```tsx
<AnimatePresence>
  {heatmapVisible && heatmapSrc !== null ? (
    <HeatmapRevealLayer
      key="heatmap"
      src={heatmapSrc}
      alt={heatmapAlt}
      opacity={HEATMAP_OPACITY}
      fadeDuration={reduced ? 0 : 0.2}
    />
  ) : null}
</AnimatePresence>
```

Import the new component; remove the now-unused `motion` import if nothing else uses it in that file. The analyze flow AND the history modal both get the slider for free (shared component).

- [ ] **Step 4: Gate** — `npx tsc --noEmit && npm run lint && npm run build` clean.

- [ ] **Step 5: Commit**

```bash
git add web/components/analyze web/messages && git commit -m "feat(web): drag/keyboard heatmap reveal slider"
```

---

### Task 5: History stats dashboard

**Files:**
- Create: `web/components/history/HistoryStats.tsx`
- Modify: `web/components/history/HistoryClient.tsx`
- Modify: `web/messages/en.json`, `web/messages/ar.json`

- [ ] **Step 1: Messages** — inside `history` add (after `"title"`):

`en.json`:
```json
"stats": {
  "total": "Assessments",
  "avgConfidence": "Avg confidence",
  "distribution": "Level distribution"
},
```
`ar.json`:
```json
"stats": {
  "total": "التقييمات",
  "avgConfidence": "متوسط الثقة",
  "distribution": "توزيع المستويات"
},
```

- [ ] **Step 2: Create `web/components/history/HistoryStats.tsx`:**

```tsx
"use client";
// Command-center strip above the history grid: total, average confidence,
// and a six-bar level histogram in ramp colors (spec: premium-upgrade A5).
import { motion, useReducedMotion } from "framer-motion";
import { useFormatter, useTranslations } from "next-intl";
import { CornerTicks } from "@/components/ui/CornerTicks";
import { DAMAGE_LEVELS } from "@/lib/levels";
import type { Analysis } from "@/lib/types";

export interface HistoryStatsProps {
  analyses: Analysis[];
}

const STAGGER_S = 0.06;

export function HistoryStats({ analyses }: HistoryStatsProps) {
  const t = useTranslations("history.stats");
  const tCommon = useTranslations("common");
  const format = useFormatter();
  const reduced = useReducedMotion() ?? false;
  const counts = DAMAGE_LEVELS.map(
    (level) => analyses.filter((analysis) => analysis.level === level.id).length,
  );
  const max = Math.max(...counts, 1);
  const average =
    analyses.reduce((sum, analysis) => sum + analysis.confidence, 0) / analyses.length;

  return (
    <section className="relative mb-8 rounded border border-line bg-surface p-5">
      <CornerTicks />
      <div className="flex flex-wrap items-end gap-x-10 gap-y-6">
        <div>
          <p className="text-xs uppercase tracking-wider text-muted">{t("total")}</p>
          <p className="mt-1 font-mono text-4xl font-bold leading-none">
            {format.number(analyses.length)}
          </p>
        </div>
        <div>
          <p className="text-xs uppercase tracking-wider text-muted">{t("avgConfidence")}</p>
          <p className="mt-1 font-mono text-4xl font-bold leading-none">
            {format.number(average, { style: "percent", maximumFractionDigits: 1 })}
          </p>
        </div>
        <div className="min-w-48 flex-1">
          <p className="text-xs uppercase tracking-wider text-muted">{t("distribution")}</p>
          <ul className="mt-2 flex h-16 items-end gap-1.5">
            {DAMAGE_LEVELS.map((level, index) => (
              <li key={level.id} className="flex h-full flex-1 flex-col justify-end gap-1">
                <motion.span
                  className="block w-full"
                  style={{ backgroundColor: level.color }}
                  initial={reduced ? false : { height: "0%" }}
                  animate={{ height: `${Math.max((counts[level.id] / max) * 100, 3)}%` }}
                  transition={
                    reduced ? { duration: 0 } : { duration: 0.4, delay: index * STAGGER_S }
                  }
                />
                <span className="text-center font-mono text-[10px] text-muted">
                  {tCommon("levelDigit", { id: String(level.id) })}
                  {" "}
                  {format.number(counts[level.id])}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
```

- [ ] **Step 3: Wire into `HistoryClient.tsx`** — in the `ready` non-empty branch replace `<HistoryGrid …/>` with:

```tsx
<>
  <HistoryStats analyses={analyses} />
  <HistoryGrid analyses={analyses} imageUrls={imageUrls} onOpen={open} />
</>
```

plus the import.

- [ ] **Step 4: Gate** — `npx tsc --noEmit && npm run lint && npm run build` clean; JSON parse both catalogs.

- [ ] **Step 5: Commit**

```bash
git add web/components/history web/messages && git commit -m "feat(web): history stats dashboard (total, avg confidence, histogram)"
```

---

### Task 6: PDF inspection report (print CSS, zero deps)

**Files:**
- Create: `web/components/report/ReportDocument.tsx`
- Modify: `web/app/globals.css` (print block)
- Modify: `web/components/analyze/AnalyzeClient.tsx` (report button + portal)
- Modify: `web/components/history/AnalysisModal.tsx` (report button + portal)
- Modify: `web/messages/en.json`, `web/messages/ar.json`

- [ ] **Step 1: Messages** — new top-level `report` namespace in both catalogs:

`en.json`:
```json
"report": {
  "button": "Report",
  "title": "Structural assessment report",
  "id": "Report ID",
  "date": "Date",
  "verdict": "Verdict",
  "confidence": "Confidence",
  "probabilities": "Class probabilities",
  "generatedBy": "Generated by DamageScale — AI structural damage assessment (demo)"
}
```
`ar.json`:
```json
"report": {
  "button": "تقرير",
  "title": "تقرير تقييم إنشائي",
  "id": "رقم التقرير",
  "date": "التاريخ",
  "verdict": "النتيجة",
  "confidence": "الثقة",
  "probabilities": "احتمالات الفئات",
  "generatedBy": "صادر عن DamageScale — تقييم الأضرار الإنشائية بالذكاء الاصطناعي (نسخة تجريبية)"
}
```

- [ ] **Step 2: Print CSS in `web/app/globals.css`** (append at end):

```css
/* PDF inspection report (premium-upgrade A4): on screen the report document
   is display:none; under print it is the ONLY thing that renders, on white. */
.report-doc {
  display: none;
}
@media print {
  body > *:not(.report-doc) {
    display: none !important;
  }
  body::before {
    display: none; /* film grain off */
  }
  body {
    background: #fff;
  }
  .report-doc {
    display: block;
    color: #111;
  }
}
```

- [ ] **Step 3: Create `web/components/report/ReportDocument.tsx`:**

```tsx
"use client";
// Print-only structural assessment report, portal-rendered onto <body> so the
// globals.css print block can isolate it (spec: premium-upgrade A4). Light
// theme is intentional: reports print on paper; the on-screen app stays dark.
import { createPortal } from "react-dom";
import { useFormatter, useTranslations } from "next-intl";
import { ScaleStrip } from "@/components/ui/ScaleStrip";
import { DAMAGE_LEVELS, getLevel } from "@/lib/levels";

export interface ReportDocumentProps {
  imageSrc: string | null;
  heatmapSrc: string | null;
  level: number;
  confidence: number;
  probabilities: number[];
  reportId: string;
  createdAt: Date;
}

export function ReportDocument({
  imageSrc,
  heatmapSrc,
  level: levelId,
  confidence,
  probabilities,
  reportId,
  createdAt,
}: ReportDocumentProps) {
  const t = useTranslations();
  const format = useFormatter();
  const level = getLevel(levelId);
  if (typeof document === "undefined") return null;

  return createPortal(
    <article className="report-doc p-10 font-body">
      <header className="border-b-2 border-black pb-4">
        <p className="font-display text-2xl font-black uppercase">DamageScale</p>
        <h1 className="mt-1 text-lg uppercase tracking-wider">{t("report.title")}</h1>
        <p className="mt-2 font-mono text-xs">
          {t("report.id")}: {reportId} · {t("report.date")}:{" "}
          {format.dateTime(createdAt, { dateStyle: "medium", timeStyle: "short" })}
        </p>
      </header>
      {imageSrc !== null ? (
        <div className="relative mt-6 w-72">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={imageSrc} alt="" className="block w-full border border-black/20" />
          {heatmapSrc !== null ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={heatmapSrc} alt="" className="absolute inset-0 h-full w-full opacity-45" />
          ) : null}
        </div>
      ) : null}
      <section className="mt-6">
        <p className="text-xs uppercase tracking-wider">{t("report.verdict")}</p>
        <p className="mt-1 text-2xl font-bold">
          <span className="font-mono">{t("common.levelDigit", { id: String(level.id) })}</span>{" "}
          {t(`levels.${level.key}.name`)}
        </p>
        <ScaleStrip size="md" activeLevel={level.id} className="mt-3" />
        <p className="mt-3 font-mono text-sm">
          {t("report.confidence")}:{" "}
          {format.number(confidence, { style: "percent", maximumFractionDigits: 1 })}
        </p>
      </section>
      <section className="mt-6">
        <p className="text-xs uppercase tracking-wider">{t("report.probabilities")}</p>
        <ul className="mt-2 space-y-1.5">
          {DAMAGE_LEVELS.map((entry) => (
            <li key={entry.id} className="flex items-center gap-2 text-xs">
              <span className="w-40 shrink-0">
                <span className="font-mono">{t("common.levelDigit", { id: String(entry.id) })}</span>{" "}
                {t(`levels.${entry.key}.name`)}
              </span>
              <span className="h-2 flex-1 border border-black/20">
                <span
                  className="block h-full"
                  style={{
                    backgroundColor: entry.color,
                    width: `${(probabilities[entry.id] ?? 0) * 100}%`,
                  }}
                />
              </span>
              <span className="w-12 text-end font-mono">
                {format.number(probabilities[entry.id] ?? 0, {
                  style: "percent",
                  maximumFractionDigits: 1,
                })}
              </span>
            </li>
          ))}
        </ul>
      </section>
      <footer className="mt-10 border-t border-black/20 pt-3 text-[10px]">
        {t("report.generatedBy")}
      </footer>
    </article>,
    document.body,
  );
}
```

- [ ] **Step 4: Report button + portal in `AnalyzeClient.tsx`.** Add state `const [reportId, setReportId] = useState<string | null>(null);` and set it where the prediction lands (inside `submit`, next to `setPhase("done")`): `setReportId(crypto.randomUUID().slice(0, 8).toUpperCase());` and clear it in `reset()` / `selectFile` (`setReportId(null)`). In the `phase === "done"` action row (inside `<ResultPanel>` children, next to the HeatmapToggle), add:

```tsx
<Button variant="ghost" onClick={() => window.print()}>
  {t("report.button")}
</Button>
```

and after the ResultPanel block render the document (analyze has the preview object URL + data-URL heatmap):

```tsx
{phase === "done" && prediction !== null && reportId !== null ? (
  <ReportDocument
    imageSrc={previewUrl}
    heatmapSrc={heatmapSrc === null ? null : `data:image/png;base64,${heatmapSrc}`}
    level={prediction.level}
    confidence={prediction.confidence}
    probabilities={prediction.probabilities}
    reportId={reportId}
    createdAt={new Date()}
  />
) : null}
```

Hold the `new Date()` stable: create it alongside `reportId` (`const [reportedAt, setReportedAt] = useState<Date | null>(null);` set in the same place) and pass `reportedAt` — the report timestamp must not drift on re-render. Both states set together; both required non-null to render.

- [ ] **Step 5: Same in `AnalysisModal.tsx`.** Add a ghost "Report" button into the existing action row (before the Delete button): `onClick={() => window.print()}`. Render below the modal content:

```tsx
<ReportDocument
  imageSrc={imageUrl}
  heatmapSrc={heatmapUrl}
  level={analysis.level}
  confidence={analysis.confidence}
  probabilities={analysis.probabilities}
  reportId={analysis.id.slice(0, 8).toUpperCase()}
  createdAt={new Date(analysis.created_at)}
/>
```

(`analysis.probabilities` is `number[]` in `lib/types.ts` — verify and adapt if the field is `jsonb`-typed differently.)

- [ ] **Step 6: Gate** — `npx tsc --noEmit && npm run lint && npm run build` clean; JSON parse both catalogs.

- [ ] **Step 7: Commit**

```bash
git add web/components web/app/globals.css web/messages && git commit -m "feat(web): print-CSS structural assessment report (PDF via Save as PDF)"
```

---

### Task 7: Full verification (browser + print + reduced motion + E2E)

**Files:** none (verification; tuning commits only if a check fails)

- [ ] **Step 1: Rebuild and start:** `docker compose up -d --build web` (repo root), poll `http://localhost:3000/en` for 200.

- [ ] **Step 2: Static screenshot matrix** (direct chromium, output under `$HOME/premium-verify/`): pages {`/en`, `/ar`} × {1440×2600, 390×3200} for landing, how-it-works, login, and a bogus URL (404 page). VIEW every file: backdrop visible but text clearly legible, no overflow, RTL mirrored.

- [ ] **Step 3: Interactive captures via playwright-over-CDP** (see Environment gotchas): log in with the test account, then capture (a) analyze mid-scan — click a sample, click "Analyze photo", screenshot at ~1s (log lines visible); (b) result with heatmap ON, slider dragged to ~50% (set the range input value via `page.fill`/`evaluate` + dispatch `change`) — divider visible, heatmap half-wiped; (c) history page with stats strip; (d) the history detail modal. Repeat (a)–(c) in `/ar`. VIEW all screenshots.

- [ ] **Step 4: Print emulation:** with playwright, `page.emulateMedia({ media: "print" })` on the analyze-result state and screenshot — expect ONLY the light report document (header, photo+heatmap, verdict, bars, ID, timestamp). Also generate a real PDF via CDP `page.pdf()` is unsupported over connectOverCDP to non-headless? — fallback: `/snap/bin/chromium --headless=new --no-sandbox --print-to-pdf=$HOME/premium-verify/report.pdf <result URL>` is NOT possible (stateful page); the emulateMedia screenshot is the acceptance evidence.

- [ ] **Step 5: Reduced motion:** chromium `--force-prefers-reduced-motion` on `/en` analyze flow via CDP: scan shows static full log + spinner; result digit instant; stats bars instant. Screenshot + VIEW.

- [ ] **Step 6: Gates re-run:** web tsc/lint/build; api `pytest -q` + `ruff check .` (must still be 12 passed / clean — api untouched).

- [ ] **Step 7: Report.** Any visual tuning (scrim opacity per page, log timing) is a `polish(web): …` commit; re-screenshot after. Leave the stack running.

---

## Self-review notes

- Spec coverage: A1→Tasks 1–2, A2→Task 4, A3→Task 3, A4→Task 6, A5→Task 5, A6→Task 7. Deployment (B) is intentionally a separate plan (`2026-06-12-deploy-free-hosting.md`).
- Type consistency: `HeatmapRevealLayer` props match the call site (src/alt/opacity/fadeDuration); `ReportDocumentProps` match both call sites; `HistoryStatsProps` matches; message keys identical across en/ar.
- No placeholders: every code step shows the code; photo URLs/authors are execution-time data with the capture procedure fully specified (same as the landing plan).
- Components stay under ~150 lines each (largest: ReportDocument ≈ 120, ScanOverlay ≈ 80).
