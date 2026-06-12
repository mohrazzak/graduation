"use client";
// Analyze orchestrator: explicit phase machine wiring DropZone/SampleStrip ->
// scan -> POST /predict -> result + auto-save, owning preview/request lifecycles.
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/Button";
import { Toast } from "@/components/ui/Toast";
import { ApiError, predictDamage, type ApiErrorKind } from "@/lib/api";
import { getLevel } from "@/lib/levels";
import type { Prediction } from "@/lib/types";
import { AnalyzeError } from "./AnalyzeError";
import { DropZone } from "./DropZone";
import { HeatmapToggle } from "./HeatmapToggle";
import { ImageWithHeatmap } from "./ImageWithHeatmap";
import { ResultPanel } from "./ResultPanel";
import { SampleStrip } from "./SampleStrip";
import { SaveFailedNote } from "./SaveFailedNote";
import { ScanOverlay } from "./ScanOverlay";
import { useSaveAnalysis } from "./useSaveAnalysis";

type Phase = "idle" | "ready" | "analyzing" | "done" | "error";

// The scan must read as one full 1.2s sweep even when the mock answers in
// milliseconds — without this floor the orchestrated moment would just flash.
const MIN_SCAN_MS = 1200;

const delay = (ms: number): Promise<void> =>
  new Promise((resolve) => void window.setTimeout(resolve, ms));

export function AnalyzeClient() {
  const t = useTranslations();
  const [phase, setPhase] = useState<Phase>("idle");
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [prediction, setPrediction] = useState<Prediction | null>(null);
  const [heatmapVisible, setHeatmapVisible] = useState(false);
  const [errorKind, setErrorKind] = useState<ApiErrorKind>("server");
  const { status: saveStatus, errorCode: saveError, save, reset: resetSave } = useSaveAnalysis();
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
      resetSave();
      setPhase("ready");
    },
    [releasePreview, resetSave],
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
      save(file, result); // auto-save to history (spec section 9)
    } catch (error) {
      if (requestId !== requestIdRef.current) return;
      setErrorKind(error instanceof ApiError ? error.kind : "server");
      setPhase("error");
    }
  }, [file, phase, save]);

  const reset = useCallback(() => {
    requestIdRef.current += 1;
    releasePreview();
    setFile(null);
    setPreviewUrl(null);
    setPrediction(null);
    setHeatmapVisible(false);
    resetSave();
    setPhase("idle");
  }, [releasePreview, resetSave]);

  const heatmapSrc = prediction?.heatmap_base64 ?? null;

  return (
    <div className="grid items-start gap-8 lg:grid-cols-2">
      <div className="flex flex-col gap-6">
        {previewUrl !== null ? (
          <ImageWithHeatmap
            src={previewUrl}
            alt={t("analyze.dropzone.previewAlt")}
            heatmapSrc={heatmapSrc === null ? null : `data:image/png;base64,${heatmapSrc}`}
            heatmapAlt={t("analyze.heatmapAlt")}
            heatmapVisible={phase === "done" && heatmapVisible}
          >
            {phase === "analyzing" ? <ScanOverlay /> : null}
          </ImageWithHeatmap>
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

      <div className="flex flex-col gap-4">
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
        {phase === "done" && saveError !== null ? (
          <SaveFailedNote
            errorCode={saveError}
            onRetry={() => file !== null && prediction !== null && save(file, prediction)}
          />
        ) : null}
        {phase === "error" ? (
          <AnalyzeError kind={errorKind} onRetry={() => void submit()} onReset={reset} />
        ) : null}
      </div>

      {saveStatus === "saved" ? (
        <Toast message={t("analyze.savedToast")} href="/history"
          linkLabel={t("analyze.savedLink")} onDismiss={resetSave} />
      ) : null}

      {/* Persistent polite live region: visual focus never moves to the result,
          so this is the screen-reader signal that the verdict landed. */}
      <div aria-live="polite" role="status" className="sr-only">
        {phase === "done" && prediction !== null
          ? t("analyze.resultAnnouncement", {
              name: t(`levels.${getLevel(prediction.level).key}.name`),
            })
          : null}
      </div>
    </div>
  );
}
