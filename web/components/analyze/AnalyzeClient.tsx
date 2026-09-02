"use client";
// Analyze orchestrator: explicit phase machine wiring DropZone/SampleStrip ->
// scan -> POST /predict -> result + auto-save, owning preview/request lifecycles.
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/Button";
import { Toast } from "@/components/ui/Toast";
import { ApiError, predictDamage, type ApiErrorKind } from "@/lib/api";
import { getDamageClass } from "@/lib/damage-classes";
import type { Prediction } from "@/lib/types";
import { AnalyzeError } from "./AnalyzeError";
import { DropZone } from "./DropZone";
import { ImageWithHeatmap } from "./ImageWithHeatmap";
import { ModelPicker } from "./ModelPicker";
import { RecommendationCard } from "./RecommendationCard";
import { ResultPanel } from "./ResultPanel";
import { ServiceRail } from "./ServiceRail";
import { SampleStrip } from "./SampleStrip";
import { SaveFailedNote } from "./SaveFailedNote";
import { ScanOverlay } from "./ScanOverlay";
import { useModels } from "./useModels";
import { useSaveAnalysis } from "./useSaveAnalysis";

type Phase = "idle" | "ready" | "analyzing" | "done" | "error";

// The scan must read as one full sweep AND give the inspection log time to
// type out (lines 2-5 × 380ms ≈ 1.5s) even when the mock answers in milliseconds.
const MIN_SCAN_MS = 2400;

const delay = (ms: number): Promise<void> =>
  new Promise((resolve) => void window.setTimeout(resolve, ms));

export function AnalyzeClient() {
  const t = useTranslations();
  const [phase, setPhase] = useState<Phase>("idle");
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [prediction, setPrediction] = useState<Prediction | null>(null);
  const [errorKind, setErrorKind] = useState<ApiErrorKind>("server");
  // Report identity is fixed the moment the verdict lands; deriving it at
  // render time would mint a new id/timestamp on every re-render.
  const {
    status: saveStatus,
    errorCode: saveError,
    analysisId,
    save,
    dismiss: dismissSave,
    reset: resetSave,
  } = useSaveAnalysis();
  const { models, selected: selectedModel, select: selectModel } = useModels();
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
      resetSave();
      setPhase("ready");
    },
    [releasePreview, resetSave],
  );

  const submit = useCallback(async () => {
    if (file === null || phase === "analyzing") return;
    const requestId = ++requestIdRef.current;
    setPhase("analyzing");
    try {
      const [result] = await Promise.all([
        predictDamage(file, selectedModel ?? undefined),
        delay(MIN_SCAN_MS),
      ]);
      if (requestId !== requestIdRef.current) return; // stale: user moved on
      setPrediction(result);
      setPhase("done");
      save(file, result); // auto-save to history (spec section 9)
    } catch (error) {
      if (requestId !== requestIdRef.current) return;
      setErrorKind(error instanceof ApiError ? error.kind : "server");
      setPhase("error");
    }
  }, [file, phase, save, selectedModel]);

  const reset = useCallback(() => {
    requestIdRef.current += 1;
    releasePreview();
    setFile(null);
    setPreviewUrl(null);
    setPrediction(null);
    resetSave();
    setPhase("idle");
  }, [releasePreview, resetSave]);

  return (
    <div className="grid items-start gap-8 lg:grid-cols-2">
      <div className="flex flex-col gap-6">
        {previewUrl !== null ? (
          <ImageWithHeatmap
            src={previewUrl}
            alt={t("analyze.dropzone.previewAlt")}
            heatmapSrc={null}
            heatmapAlt={t("analyze.heatmapAlt")}
            heatmapVisible={false}
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
        <ModelPicker
          models={models}
          value={selectedModel}
          onChange={selectModel}
          disabled={phase === "analyzing"}
        />
        <SampleStrip onSample={selectFile} disabled={phase === "analyzing"} />
      </div>

      <div className="flex flex-col gap-4">
        {phase === "done" && prediction !== null ? (
          <ResultPanel prediction={prediction}>
            <Button variant="ghost" onClick={reset}>
              {t("common.actions.analyzeAnother")}
            </Button>
          </ResultPanel>
        ) : null}
        {/* What to DO about the verdict — the reason a tier matters to a user. */}
        {phase === "done" && prediction !== null ? (
          <RecommendationCard classCode={prediction.class_code} />
        ) : null}
        {/* What to do next with this building — gated by the tier. */}
        {phase === "done" && prediction !== null && file !== null ? (
          <ServiceRail
            file={file}
            classCode={prediction.class_code}
            sourceSrc={previewUrl}
            analysisId={analysisId}
            analysisStatus={saveStatus}
          />
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
          linkLabel={t("analyze.savedLink")} onDismiss={dismissSave} />
      ) : null}

      {/* Persistent polite live region: visual focus never moves to the result,
          so this is the screen-reader signal that the verdict landed. */}
      <div aria-live="polite" role="status" className="sr-only">
        {phase === "done" && prediction !== null
          ? t("analyze.resultAnnouncement", {
              name: t(`damageClasses.${getDamageClass(prediction.class_code).key}.name`),
            })
          : null}
      </div>
    </div>
  );
}
