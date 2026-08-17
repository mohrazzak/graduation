"use client";
// The interactive 3D result: orbit, zoom, environment lighting, and a real
// download of the GLB. <model-viewer> covers every one of those natively,
// which is why it earns its place in a stack that otherwise adds nothing.
import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { useReducedMotion } from "framer-motion";

export interface ModelViewerProps {
  /** URL of the GLB to display. */
  src: string;
  /** Filename offered when the user downloads it. */
  downloadName: string;
}

export function ModelViewer({ src, downloadName }: ModelViewerProps) {
  const t = useTranslations();
  const reduced = useReducedMotion() ?? false;
  const [ready, setReady] = useState(false);
  const hostRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<HTMLElement | null>(null);
  // A string, so effects keyed on it are stable by VALUE — unlike the
  // translator function, whose identity churn is what broke this before.
  const alt = t("model3d.viewerAlt");

  // Loaded on demand rather than in the bundle: nobody who never reconstructs a
  // building should pay for the viewer.
  useEffect(() => {
    let cancelled = false;
    void import("@google/model-viewer")
      .then(() => !cancelled && setReady(true))
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  // WHY the element is created ONCE and then mutated, never re-created:
  // <model-viewer> starts fetching and parsing the GLB the moment it is
  // attached. Replacing the node on a re-render restarts that work from
  // scratch, so a large model can loop forever and never fire `load` — which is
  // exactly what happened when this effect also depended on the translator
  // function. Create on mount; update attributes in place afterwards.
  useEffect(() => {
    if (!ready || hostRef.current === null || viewerRef.current !== null) return;
    const el = document.createElement("model-viewer");
    el.setAttribute("camera-controls", "");
    el.setAttribute("touch-action", "pan-y");
    el.setAttribute("shadow-intensity", "1");
    el.setAttribute("exposure", "1");
    el.setAttribute("style", "width:100%;height:100%;background-color:#0C0C0E;");
    hostRef.current.replaceChildren(el);
    viewerRef.current = el;
  }, [ready]);

  // Source and label changes update the element in place rather than
  // rebuilding the viewer.
  useEffect(() => {
    viewerRef.current?.setAttribute("src", src);
  }, [src, ready]);

  useEffect(() => {
    viewerRef.current?.setAttribute("alt", alt);
  }, [alt, ready]);

  // auto-rotate is an animation, so it follows the reduced-motion preference.
  useEffect(() => {
    const el = viewerRef.current;
    if (el === null) return;
    if (reduced) {
      el.removeAttribute("auto-rotate");
    } else {
      el.setAttribute("auto-rotate", "");
      el.setAttribute("auto-rotate-delay", "600");
    }
  }, [reduced, ready]);

  return (
    <div>
      <div
        ref={hostRef}
        className="flex aspect-[4/3] w-full items-center justify-center overflow-hidden rounded border border-line bg-bg"
      >
        {!ready ? (
          <span className="font-mono text-xs text-muted">{t("model3d.loading")}</span>
        ) : null}
      </div>
      <p className="mt-3">
        <a
          href={src}
          download={downloadName}
          className="inline-block rounded border border-line px-3 py-1.5 text-xs uppercase tracking-wider transition-colors duration-150 hover:border-hazard focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-hazard"
        >
          {t("model3d.download")}
        </a>
      </p>
    </div>
  );
}
