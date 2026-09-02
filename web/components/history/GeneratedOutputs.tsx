"use client";
// The outputs a saved assessment accumulated after its classification: the
// restored image and the two 3D models.
//
// Each block renders only when that service actually ran, so a history entry
// never implies work it does not have. Each also has three visible states —
// its signed URL is loading, ready, or failed — because a signed URL expires
// and the media request behind it can fail independently of the signing.
import { useTranslations } from "next-intl";
import { BeforeAfter } from "@/components/analyze/BeforeAfter";
import { ModelViewer } from "@/components/analyze/ModelViewer";
import { Button } from "@/components/ui/Button";
import type { SignedArtifact } from "@/lib/signedArtifact.mts";
import type { Analysis } from "@/lib/types";

/** One generated output's signing state plus the two ways it can be recovered. */
export interface ArtifactSlot {
  artifact: SignedArtifact;
  /** Requests a fresh signed URL after a load or signing failure. */
  onRetry: () => void;
  /** Marks a signed URL whose actual media request or parse failed. */
  onLoadError: () => void;
}

export interface GeneratedOutputsProps {
  analysis: Analysis;
  /** Signed original image; the "before" half of the restoration comparison. */
  imageUrl: string | null;
  repaired: ArtifactSlot;
  model: ArtifactSlot;
  beforeModel: ArtifactSlot;
}

export function GeneratedOutputs({
  analysis,
  imageUrl,
  repaired,
  model,
  beforeModel,
}: GeneratedOutputsProps) {
  const t = useTranslations();
  const shortId = analysis.id.slice(0, 8);

  return (
    <>
      {analysis.repaired_path !== null ? (
        <Output title={t("repair.beforeAfter")}>
          {imageUrl === null ? (
            <p role="alert" className="text-xs text-muted">
              {t("history.artifactFailed")}
            </p>
          ) : (
            <ArtifactState slot={repaired}>
              {(url) => (
                <BeforeAfter
                  baseSrc={imageUrl}
                  overlaySrc={url}
                  overlayAlt={t("repair.repairedAlt")}
                  onOverlayError={repaired.onLoadError}
                />
              )}
            </ArtifactState>
          )}
        </Output>
      ) : null}

      {analysis.model3d_path !== null ? (
        <Output title={t("model3d.title")}>
          <ArtifactState slot={model}>
            {(url) => (
              <ModelViewer
                src={url}
                downloadName={`damagescale-${shortId}.glb`}
                onError={model.onLoadError}
              />
            )}
          </ArtifactState>
        </Output>
      ) : null}

      {analysis.model3d_before_path !== null ? (
        <Output title={t("model3d.before.title")}>
          <ArtifactState slot={beforeModel}>
            {(url) => (
              <ModelViewer
                src={url}
                downloadName={`damagescale-${shortId}-before.glb`}
                onError={beforeModel.onLoadError}
              />
            )}
          </ArtifactState>
        </Output>
      ) : null}
    </>
  );
}

function Output({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mt-5">
      <p className="mb-2 text-xs uppercase tracking-wider text-muted">{title}</p>
      {children}
    </div>
  );
}

// The loading/ready/failed fork, written once. `children` receives the signed
// URL so each caller only describes what it renders when one exists.
function ArtifactState({
  slot,
  children,
}: {
  slot: ArtifactSlot;
  children: (url: string) => React.ReactNode;
}) {
  const t = useTranslations();

  if (slot.artifact.status === "ready") return <>{children(slot.artifact.url)}</>;
  if (slot.artifact.status === "loading") {
    return (
      <p role="status" className="text-xs text-muted">
        {t("history.artifactLoading")}
      </p>
    );
  }
  return (
    <div role="alert" className="flex flex-wrap items-center gap-3">
      <p className="text-xs text-muted">{t("history.artifactFailed")}</p>
      <Button variant="ghost" onClick={slot.onRetry}>
        {t("history.artifactRetry")}
      </Button>
    </div>
  );
}
