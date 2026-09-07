"use client";
// The complete saved assessment: the verdict, what to do about it, and every
// generated output — the restored image and the 3D model — so reopening a
// history entry shows the same full result as the analyze page did.
import { useEffect, useRef, useState } from "react";
import { useFormatter, useTranslations } from "next-intl";
import { ConfidenceBars } from "@/components/analyze/ConfidenceBars";
import { RecommendationCard } from "@/components/analyze/RecommendationCard";
import { HeatmapToggle } from "@/components/analyze/HeatmapToggle";
import { DetectionOverlay } from "@/components/analyze/DetectionOverlay";
import { ImageWithHeatmap } from "@/components/analyze/ImageWithHeatmap";
import { Button } from "@/components/ui/Button";
import { GeneratedOutputs, type ArtifactSlot } from "./GeneratedOutputs";
import { ReportDocument } from "@/components/report/ReportDocument";
import { DamageStrip } from "@/components/ui/DamageStrip";
import { getDamageClass } from "@/lib/damage-classes";
import type { Analysis } from "@/lib/types";
import { ModalShell } from "./ModalShell";
import { useModelName } from "@/lib/model-names";

export interface AnalysisModalProps {
  analysis: Analysis;
  /** Signed image URL; null when signing failed (placeholder shown instead). */
  imageUrl: string | null;
  /** Signed heatmap URL, resolved lazily by the opener; null while pending/failed. */
  heatmapUrl: string | null;
  /** Signing state and recovery handlers for each generated output. */
  repaired: ArtifactSlot;
  model: ArtifactSlot;
  beforeModel: ArtifactSlot;
  /** Resolves true on success (the opener closes the modal), false on failure. */
  onDelete: () => Promise<boolean>;
  onClose: () => void;
}

// Static id is safe: only one analysis modal exists at a time.
const TITLE_ID = "analysis-modal-title";

export function AnalysisModal({
  analysis,
  imageUrl,
  heatmapUrl,
  repaired,
  model,
  beforeModel,
  onDelete,
  onClose,
}: AnalysisModalProps) {
  const t = useTranslations();
  const modelName = useModelName();
  const modelLabel = modelName(analysis.model_id);
  const format = useFormatter();
  const [heatmapVisible, setHeatmapVisible] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteFailed, setDeleteFailed] = useState(false);
  const entry = getDamageClass(analysis.class_code);
  const alert = analysis.class_code === "TD";
  const name = t(`damageClasses.${entry.key}.name`);
  const confirmRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    // WHY: entering confirm unmounts the Delete button out from under keyboard
    // focus; moving focus onto Confirm keeps Tab/Enter in the delete flow
    // instead of silently dropping to <body>.
    if (confirming) {
      confirmRef.current?.focus();
    }
  }, [confirming]);

  async function confirmDelete(): Promise<void> {
    setDeleting(true);
    setDeleteFailed(false);
    const deleted = await onDelete();
    if (!deleted) {
      // On success the opener unmounts this modal; only failure needs state.
      setDeleting(false);
      setDeleteFailed(true);
    }
  }

  return (
    <ModalShell labelledBy={TITLE_ID} onClose={onClose}>
      {/* TD banner treatment, mirroring ResultPanel — the only alert surfaces. */}
      {alert ? (
        <span aria-hidden="true" className="hazard-stripe absolute inset-x-0 top-0" />
      ) : null}
      <div className="flex items-start justify-between gap-4">
        <h2
          id={TITLE_ID}
          className={`font-display text-xl font-extrabold uppercase tracking-tight ${
            alert ? "text-alert" : ""
          }`}
        >
          {name}
        </h2>
        <Button variant="ghost" onClick={onClose}>
          {t("common.actions.close")}
        </Button>
      </div>
      {imageUrl !== null ? (
        <ImageWithHeatmap
          src={imageUrl}
          alt={name}
          heatmapSrc={heatmapUrl}
          heatmapAlt={t("analyze.heatmapAlt")}
          heatmapVisible={heatmapVisible}
          className="mt-4"
        >
          {/* Same evidence the analyze page drew, from the persisted
              detections, so a reopened entry is the whole original result. */}
          <DetectionOverlay
            detections={analysis.detections}
            classCode={analysis.class_code}
            confidence={analysis.confidence}
          />
        </ImageWithHeatmap>
      ) : (
        <div
          aria-hidden="true"
          className="mt-4 flex aspect-[4/3] items-center justify-center rounded border border-line bg-bg font-mono text-5xl text-muted"
        >
          {entry.code}
        </div>
      )}
      <DamageStrip active={analysis.class_code} className="mt-5" />
      <p className="mt-4 flex flex-wrap items-baseline justify-between gap-3">
        <span className="flex items-baseline gap-3">
          <span className="text-xs uppercase tracking-wider text-muted">
            {t("history.confidence")}
          </span>
          <span className="font-mono text-lg">
            {format.number(analysis.confidence, {
              style: "percent",
              maximumFractionDigits: 1,
            })}
          </span>
        </span>
        <time dateTime={analysis.created_at} className="font-mono text-xs text-muted">
          {format.dateTime(new Date(analysis.created_at), {
            dateStyle: "medium",
            timeStyle: "short",
          })}
        </time>
      </p>
      <div className="mt-4">
        <ConfidenceBars scores={analysis.scores} />
      </div>
      <div className="mt-5 flex flex-wrap items-end justify-between gap-4">
        <p className="flex items-baseline gap-2 text-xs text-muted">
          <span className="uppercase tracking-wider">{t("analyze.modelUsed")}</span>
          <span className="font-mono">{modelLabel}</span>
        </p>
      </div>
      <div className="mt-5">
        <RecommendationCard classCode={analysis.class_code} />
      </div>
      <GeneratedOutputs
        analysis={analysis}
        imageUrl={imageUrl}
        repaired={repaired}
        model={model}
        beforeModel={beforeModel}
      />
      <div className="mt-6 flex flex-wrap items-center gap-3">
        {analysis.heatmap_path !== null ? (
          <HeatmapToggle
            visible={heatmapVisible}
            onToggle={() => setHeatmapVisible((visible) => !visible)}
            disabled={heatmapUrl === null}
          />
        ) : null}
        <Button variant="ghost" onClick={() => window.print()}>
          {t("report.button")}
        </Button>
        {confirming ? (
          <>
            <span className="text-sm text-muted">{t("history.deleteConfirm")}</span>
            <Button
              ref={confirmRef}
              variant="danger"
              disabled={deleting}
              onClick={() => void confirmDelete()}
            >
              {t("common.actions.confirm")}
            </Button>
            <Button variant="ghost" disabled={deleting} onClick={() => setConfirming(false)}>
              {t("common.actions.cancel")}
            </Button>
          </>
        ) : (
          <Button variant="danger" onClick={() => setConfirming(true)}>
            {t("common.actions.delete")}
          </Button>
        )}
      </div>
      {deleteFailed ? (
        // Hazard, not alert: #FF3B30 is reserved for TD surfaces (spec section 8).
        <p role="alert" className="mt-3 text-sm text-hazard">
          {t("history.deleteFailed")}
        </p>
      ) : null}
      {/* Mounted, not conditional on the button: window.print() opens the print
          dialog synchronously, so the page it prints has to already exist. It
          portals to <body> and is display:none until then. The restored image
          joins it only once its signed URL is ready — a loading or failed slot
          prints the assessment alone rather than a broken frame. */}
      <ReportDocument
        analysis={analysis}
        imageSrc={imageUrl}
        restoredSrc={repaired.artifact.status === "ready" ? repaired.artifact.url : null}
        modelName={modelLabel}
      />
    </ModalShell>
  );
}
