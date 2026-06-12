"use client";
// Analyze orchestrator: explicit phase machine wiring DropZone/SampleStrip ->
// scan -> POST /predict -> result or error, owning preview-URL + request lifecycles.
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/Button";
import { ApiError, predictDamage, type ApiErrorKind } from "@/lib/api";
import type { Prediction } from "@/lib/types";
import { AnalyzeError } from "./AnalyzeError";
import { DropZone } from "./DropZone";
import { HeatmapToggle } from "./HeatmapToggle";
import { ResultPanel } from "./ResultPanel";
import { SampleStrip } from "./SampleStrip";
import { ScanOverlay } from "./ScanOverlay";

type Phase = "idle" | "ready" | "analyzing" | "done" | "error";

// The scan must read as one full 1.2s sweep even when the mock answers in
// milliseconds — without this floor the orchestrated moment would just flash.
const MIN_SCAN_MS = 1200;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

export function AnalyzeClient() {
  const t = useTranslations();
  const reduced = useReducedMotion() ?? false;
  const [phase, setPhase] = useState<Phase>("idle");
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [prediction, setPrediction] = useState<Prediction | null>(null);
  const [heatmapVisible, setHeatmapVisible] = useState(false);
  const [errorKind, setErrorKind] = useState<ApiErrorKind>("server");
  // Monotonic id: any result landing after a reset/new selection is discarded.
  const requestIdRef = useRef(0);
  const previewUrlRef = useRef<string | null>(null);

  const releasePreview = useCallback(() => {
    if (previewUrlRef.current !== null) {
      URL.revokeObjectURL(previewUrlRef.current);
      previewUrlRef.current = null;
    }
  }, []);

  // Revoke the last object URL when the page unmounts.
  useEffect(() => releasePreview, [releasePreview]);

  const selectFile = useCallback(
    (next: File) => {
      requestIdRef.current += 1; // strand any in-flight request
      releasePreview();
      const url = URL.createObjectURL(next);
      previewUrlRef.current = url;
      setFile(next);
      setPreviewUrl(url);
      setPrediction(null);
      setHeatmapVisible(false);
      setPhase("ready");
    },
    [releasePreview],
  );

  const submit = useCallback(async () => {
    if (file === null || phase === "analyzing") return;
    const requestId = ++requestIdRef.current;
    setPhase("analyzing");
    setHeatmapVisible(false);
    try {
      const [result] = await Promise.all([predictDamage(file), delay(MIN_SCAN_MS)]);
      if (requestId !== requestIdRef.current) return; // stale: user moved on
      setPrediction(result);
      setPhase("done");
    } catch (error) {
      if (requestId !== requestIdRef.current) return;
      setErrorKind(error instanceof ApiError ? error.kind : "server");
      setPhase("error");
    }
  }, [file, phase]);

  const reset = useCallback(() => {
    requestIdRef.current += 1;
    releasePreview();
    setFile(null);
    setPreviewUrl(null);
    setPrediction(null);
    setHeatmapVisible(false);
    setPhase("idle");
  }, [releasePreview]);

  const heatmapSrc = prediction?.heatmap_base64 ?? null;

  return (
    <div className="grid items-start gap-8 lg:grid-cols-2">
      <div className="flex flex-col gap-6">
        {previewUrl !== null ? (
          <figure className="relative overflow-hidden rounded border border-line bg-surface">
            {/* Plain <img>: next/image cannot optimize blob object URLs. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={previewUrl} alt={t("analyze.dropzone.previewAlt")} className="block w-full" />
            <AnimatePresence>
              {phase === "done" && heatmapVisible && heatmapSrc !== null ? (
                <motion.img
                  key="heatmap"
                  src={`data:image/png;base64,${heatmapSrc}`}
                  alt={t("analyze.heatmapAlt")}
                  initial={reduced ? false : { opacity: 0 }}
                  animate={{ opacity: 0.45 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: reduced ? 0 : 0.2 }}
                  className="absolute inset-0 h-full w-full"
                />
              ) : null}
            </AnimatePresence>
            {phase === "analyzing" ? <ScanOverlay /> : null}
          </figure>
        ) : (
          <DropZone onFile={selectFile} />
        )}
        {phase === "ready" ? (
          <Button variant="primary" size="lg" onClick={() => void submit()}>
            {t("common.actions.analyzePhoto")}
          </Button>
        ) : null}
        <SampleStrip onSample={selectFile} disabled={phase === "analyzing"} />
      </div>

      <div>
        {phase === "done" && prediction !== null ? (
          <ResultPanel prediction={prediction}>
            {heatmapSrc !== null ? (
              <HeatmapToggle
                visible={heatmapVisible}
                onToggle={() => setHeatmapVisible((visible) => !visible)}
              />
            ) : null}
            <Button variant="ghost" onClick={reset}>
              {t("common.actions.analyzeAnother")}
            </Button>
          </ResultPanel>
        ) : null}
        {phase === "error" ? (
          <AnalyzeError kind={errorKind} onRetry={() => void submit()} onReset={reset} />
        ) : null}
      </div>
    </div>
  );
}
