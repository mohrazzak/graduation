"use client";
// Full assessment detail inside the dialog shell: image with the shared
// heatmap overlay, scale, confidence bars, date, and a two-step inline delete.
import { useState } from "react";
import { useFormatter, useTranslations } from "next-intl";
import { ConfidenceBars } from "@/components/analyze/ConfidenceBars";
import { HeatmapToggle } from "@/components/analyze/HeatmapToggle";
import { ImageWithHeatmap } from "@/components/analyze/ImageWithHeatmap";
import { Button } from "@/components/ui/Button";
import { ScaleStrip } from "@/components/ui/ScaleStrip";
import { getLevel, isAlertLevel } from "@/lib/levels";
import type { Analysis } from "@/lib/types";
import { ModalShell } from "./ModalShell";

export interface AnalysisModalProps {
  analysis: Analysis;
  /** Signed image URL; null when signing failed (placeholder shown instead). */
  imageUrl: string | null;
  /** Signed heatmap URL, resolved lazily by the opener; null while pending/failed. */
  heatmapUrl: string | null;
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
  onDelete,
  onClose,
}: AnalysisModalProps) {
  const t = useTranslations();
  const format = useFormatter();
  const [heatmapVisible, setHeatmapVisible] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteFailed, setDeleteFailed] = useState(false);
  const level = getLevel(analysis.level);
  const alert = isAlertLevel(level.id);
  const levelName = t(`levels.${level.key}.name`);

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
      {/* Level-4/5 banner treatment, mirroring ResultPanel — the only alert surfaces. */}
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
          {levelName}
        </h2>
        <Button variant="ghost" onClick={onClose}>
          {t("common.actions.close")}
        </Button>
      </div>
      {imageUrl !== null ? (
        <ImageWithHeatmap
          src={imageUrl}
          alt={levelName}
          heatmapSrc={heatmapUrl}
          heatmapAlt={t("analyze.heatmapAlt")}
          heatmapVisible={heatmapVisible}
          className="mt-4"
        />
      ) : (
        <div
          aria-hidden="true"
          className="mt-4 flex aspect-[4/3] items-center justify-center rounded border border-line bg-bg font-mono text-5xl text-muted"
        >
          {t("common.levelDigit", { id: String(level.id) })}
        </div>
      )}
      <ScaleStrip size="md" activeLevel={level.id} className="mt-5" />
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
        <ConfidenceBars probabilities={analysis.probabilities} />
      </div>
      <div className="mt-6 flex flex-wrap items-center gap-3">
        {analysis.heatmap_path !== null ? (
          <HeatmapToggle
            visible={heatmapVisible}
            onToggle={() => setHeatmapVisible((visible) => !visible)}
            disabled={heatmapUrl === null}
          />
        ) : null}
        {confirming ? (
          <>
            <span className="text-sm text-muted">{t("history.deleteConfirm")}</span>
            <Button variant="danger" disabled={deleting} onClick={() => void confirmDelete()}>
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
        // Hazard, not alert: #FF3B30 is reserved for level-4/5 surfaces (spec section 8).
        <p role="alert" className="mt-3 text-sm text-hazard">
          {t("history.deleteFailed")}
        </p>
      ) : null}
    </ModalShell>
  );
}
