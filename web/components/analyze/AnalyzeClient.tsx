"use client";
// Analyze orchestrator: explicit phase machine wiring DropZone/SampleStrip ->
// scan -> POST /predict -> result + auto-save, owning preview/request lifecycles.
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { ReportDocument } from "@/components/report/ReportDocument";
import { Button } from "@/components/ui/Button";
import { Toast } from "@/components/ui/Toast";
import { ApiError, predictDamage, type ApiErrorKind } from "@/lib/api";
import { getTier } from "@/lib/tiers";
import type { Prediction } from "@/lib/types";
import { AnalyzeError } from "./AnalyzeError";
import { DropZone } from "./DropZone";
import { HeatmapToggle } from "./HeatmapToggle";
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
  const [heatmapVisible, setHeatmapVisible] = useState(false);
  const [errorKind, setErrorKind] = useState<ApiErrorKind>("server");
  // Report identity is fixed the moment the verdict lands; deriving it at
  // render time would mint a new id/timestamp on every re-render.
  const [reportId, setReportId] = useState<string | null>(null);
  const [reportedAt, setReportedAt] = useState<Date | null>(null);
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
      setHeatmapVisible(false);
      setReportId(null);
      setReportedAt(null);
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
      const [result] = await Promise.all([
        predictDamage(file, selectedModel ?? undefined),
        delay(MIN_SCAN_MS),
      ]);
      if (requestId !== requestIdRef.current) return; // stale: user moved on
      setPrediction(result);
      setPhase("done");
      setReportId(crypto.randomUUID().slice(0, 8).toUpperCase());
      setReportedAt(new Date());
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
    setHeatmapVisible(false);
    setReportId(null);
    setReportedAt(null);
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
            {heatmapSrc !== null ? (
              <HeatmapToggle
                visible={heatmapVisible}
                onToggle={() => setHeatmapVisible((visible) => !visible)}
              />
            ) : null}
            <Button variant="ghost" onClick={() => window.print()}>
              {t("report.button")}
            </Button>
            <Button variant="ghost" onClick={reset}>
              {t("common.actions.analyzeAnother")}
            </Button>
          </ResultPanel>
        ) : null}
        {/* What to DO about the verdict — the reason a tier matters to a user. */}
        {phase === "done" && prediction !== null ? (
          <RecommendationCard tier={prediction.tier} />
        ) : null}
        {/* What to do next with this building — gated by the tier. */}
        {phase === "done" && prediction !== null && file !== null ? (
          <ServiceRail
            file={file}
            tier={prediction.tier}
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
        {phase === "done" && prediction !== null && reportId !== null && reportedAt !== null ? (
          <ReportDocument
            imageSrc={previewUrl}
            heatmapSrc={heatmapSrc === null ? null : `data:image/png;base64,${heatmapSrc}`}
            tier={prediction.tier}
            confidence={prediction.confidence}
            probabilities={prediction.probabilities}
            damagePercent={prediction.damage_percent}
            modelName={prediction.model.name}
            reportId={reportId}
            createdAt={reportedAt}
          />
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
              name: t(`tiers.${getTier(prediction.tier).key}.name`),
            })
          : null}
      </div>
    </div>
  );
}
