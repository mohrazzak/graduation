"use client";
// The complete saved assessment: the verdict, what to do about it, and every
// generated output — the restored image and the 3D model — so reopening a
// history entry shows the same full result as the analyze page did.
import { useEffect, useRef, useState } from "react";
import { useFormatter, useTranslations } from "next-intl";
import { BeforeAfter } from "@/components/analyze/BeforeAfter";
import { ConfidenceBars } from "@/components/analyze/ConfidenceBars";
import { DamageGauge } from "@/components/analyze/DamageGauge";
import { ModelViewer } from "@/components/analyze/ModelViewer";
import { RecommendationCard } from "@/components/analyze/RecommendationCard";
import { HeatmapToggle } from "@/components/analyze/HeatmapToggle";
import { ImageWithHeatmap } from "@/components/analyze/ImageWithHeatmap";
import { ReportDocument } from "@/components/report/ReportDocument";
import { Button } from "@/components/ui/Button";
import type { SignedArtifact } from "@/lib/signedArtifact.mts";
import { TierStrip } from "@/components/ui/TierStrip";
import { getTier, isAlertTier } from "@/lib/tiers";
import type { Analysis } from "@/lib/types";
import { ModalShell } from "./ModalShell";

export interface AnalysisModalProps {
  analysis: Analysis;
  /** Signed image URL; null when signing failed (placeholder shown instead). */
  imageUrl: string | null;
  /** Signed heatmap URL, resolved lazily by the opener; null while pending/failed. */
  heatmapUrl: string | null;
  /** Signing state of the restored image, when one was generated. */
  repairedArtifact: SignedArtifact;
  /** Signing state of the kept 3D model, when one was generated. */
  modelArtifact: SignedArtifact;
  /** Requests a fresh signed URL for a restored image that failed to load. */
  onRetryRepaired: () => void;
  /** Requests a fresh signed URL for a 3D model that failed to load. */
  onRetryModel: () => void;
  /** Marks a signed restored image whose actual media request failed. */
  onRepairedLoadError: () => void;
  /** Marks a signed GLB whose actual media request or parse failed. */
  onModelLoadError: () => void;
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
  repairedArtifact,
  modelArtifact,
  onRetryRepaired,
  onRetryModel,
  onRepairedLoadError,
  onModelLoadError,
  onDelete,
  onClose,
}: AnalysisModalProps) {
  const t = useTranslations();
  const format = useFormatter();
  const [heatmapVisible, setHeatmapVisible] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteFailed, setDeleteFailed] = useState(false);
  const tier = getTier(analysis.tier);
  const alert = isAlertTier(tier.code);
  const tierName = t(`tiers.${tier.key}.name`);
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
      {/* GC banner treatment, mirroring ResultPanel — the only alert surfaces. */}
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
          {tierName}
        </h2>
        <Button variant="ghost" onClick={onClose}>
          {t("common.actions.close")}
        </Button>
      </div>
      {imageUrl !== null ? (
        <ImageWithHeatmap
          src={imageUrl}
          alt={tierName}
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
          {tier.code}
        </div>
      )}
      <TierStrip size="md" activeTier={tier.code} className="mt-5" />
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
      <div className="mt-5 flex flex-wrap items-end justify-between gap-4">
        <DamageGauge value={analysis.damage_percent} tier={tier.code} />
        <p className="flex items-baseline gap-2 text-xs text-muted">
          <span className="uppercase tracking-wider">{t("analyze.modelUsed")}</span>
          <span className="font-mono">{analysis.model_id}</span>
        </p>
      </div>
      <div className="mt-5">
        <RecommendationCard tier={tier.code} />
      </div>
      {/* Generated outputs. Each appears only when that service actually ran,
          so an entry never implies work it does not have. */}
      {analysis.repaired_path !== null ? (
        <div className="mt-5">
          <p className="mb-2 text-xs uppercase tracking-wider text-muted">
            {t("repair.beforeAfter")}
          </p>
          {imageUrl === null ? (
            <p role="alert" className="text-xs text-muted">
              {t("history.artifactFailed")}
            </p>
          ) : repairedArtifact.status === "ready" ? (
            <BeforeAfter
              baseSrc={imageUrl}
              overlaySrc={repairedArtifact.url}
              overlayAlt={t("repair.repairedAlt")}
              onOverlayError={onRepairedLoadError}
            />
          ) : repairedArtifact.status === "loading" ? (
            <p role="status" className="text-xs text-muted">
              {t("history.artifactLoading")}
            </p>
          ) : (
            <ArtifactFailure onRetry={onRetryRepaired} />
          )}
        </div>
      ) : null}
      {analysis.model3d_path !== null ? (
        <div className="mt-5">
          <p className="mb-2 text-xs uppercase tracking-wider text-muted">
            {t("model3d.title")}
          </p>
          {modelArtifact.status === "ready" ? (
            <ModelViewer
              src={modelArtifact.url}
              downloadName={`damagescale-${analysis.id.slice(0, 8)}.glb`}
              onError={onModelLoadError}
            />
          ) : modelArtifact.status === "loading" ? (
            <p role="status" className="text-xs text-muted">
              {t("history.artifactLoading")}
            </p>
          ) : (
            <ArtifactFailure onRetry={onRetryModel} />
          )}
        </div>
      ) : null}
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
        // Hazard, not alert: #FF3B30 is reserved for GC surfaces (spec section 8).
        <p role="alert" className="mt-3 text-sm text-hazard">
          {t("history.deleteFailed")}
        </p>
      ) : null}
      {/* Portals onto <body>; print-only (globals.css hides everything else). */}
      <ReportDocument
        imageSrc={imageUrl}
        heatmapSrc={heatmapUrl}
        tier={analysis.tier}
        confidence={analysis.confidence}
        probabilities={analysis.probabilities}
        damagePercent={analysis.damage_percent}
        modelName={analysis.model_id}
        reportId={analysis.id.slice(0, 8).toUpperCase()}
        createdAt={new Date(analysis.created_at)}
      />
    </ModalShell>
  );
}

function ArtifactFailure({ onRetry }: { onRetry: () => void }) {
  const t = useTranslations();

  return (
    <div role="alert" className="flex flex-wrap items-center gap-3">
      <p className="text-xs text-muted">{t("history.artifactFailed")}</p>
      <Button variant="ghost" onClick={onRetry}>
        {t("history.artifactRetry")}
      </Button>
    </div>
  );
}
