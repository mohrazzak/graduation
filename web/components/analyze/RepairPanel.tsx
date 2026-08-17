"use client";
// 2D restoration: runs the job, shows the real stages and their artifacts, and
// lets the user edit the instruction and re-run.
//
// GC gets a warning first: at total collapse the output is a conceptual
// reconstruction, not a repair plan, and the user should know that before the
// image appears rather than after.
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/Button";
import { CornerTicks } from "@/components/ui/CornerTicks";
import { artifactUrl, startRepair } from "@/lib/jobs";
import { policyFor } from "@/lib/services";
import { isAlertTier, type TierCode } from "@/lib/tiers";
import { ArtifactPersistenceNote } from "./ArtifactPersistenceNote";
import { BeforeAfter } from "./BeforeAfter";
import { StageCanvas } from "./StageCanvas";
import { StageProgress } from "./StageProgress";
import { useArtifactPersistence } from "./useArtifactPersistence";
import { useJob } from "./useJob";
import type { SaveStatus } from "./useSaveAnalysis";

export interface RepairPanelProps {
  file: File;
  tier: TierCode;
  sourceSrc: string | null;
  /** Row to attach the restored image to; null until the analysis has saved. */
  analysisId: string | null;
  analysisStatus: SaveStatus;
  /** Told the job id once a restoration finishes, so 3D can reconstruct from it. */
  onRepaired: (jobId: string | null) => void;
}

const STAGE_KEYS = ["isolating", "edges", "generating", "composing"] as const;

export function RepairPanel({
  file,
  tier,
  sourceSrc,
  analysisId,
  analysisStatus,
  onRepaired,
}: RepairPanelProps) {
  const t = useTranslations();
  const policy = policyFor(tier);
  const { jobId, state, running, start } = useJob();
  const [prompt, setPrompt] = useState("");
  const [editing, setEditing] = useState(false);

  async function run(): Promise<void> {
    onRepaired(null);
    await start(async () => {
      const id = await startRepair(file, tier, prompt.trim() || undefined);
      return id;
    });
  }

  const repaired = state?.artifacts.includes("repaired") ?? false;
  const { status: artifactSaveStatus, retry: retryArtifactSave } = useArtifactPersistence({
    analysisId,
    analysisStatus,
    jobId,
    ready: repaired,
    kind: "repaired",
  });
  // Notify the parent from an effect: calling a setter during render loops.
  useEffect(() => {
    if (repaired && jobId !== null) onRepaired(jobId);
  }, [repaired, jobId, onRepaired]);

  return (
    <section className="relative overflow-hidden rounded border border-line bg-surface">
      <div className="relative p-5">
        <CornerTicks />
        <h3 className="font-display text-lg font-extrabold uppercase tracking-tight">
          {t("repair.title")}
        </h3>
        <p className="mt-1 text-sm text-muted">{t("repair.intro")}</p>

        {policy.restoreWarns ? (
          // Hazard, not alert: alert styling stays reserved for the GC verdict.
          <p className="mt-3 border-s-2 border-hazard ps-3 text-sm text-hazard">
            {t("repair.gcWarning")}
          </p>
        ) : null}

        {state === null ? (
          <div className="mt-4">
            <Button variant="primary" onClick={() => void run()}>
              {t(isAlertTier(tier) ? "repair.runAnyway" : "repair.run")}
            </Button>
          </div>
        ) : (
          <div className="mt-4 space-y-4">
            <StageProgress
              stageKeys={STAGE_KEYS}
              current={state.stage}
              status={state.status}
              service="repair"
              indefiniteKey="generating"
            />

            {jobId !== null ? (
              <StageCanvas
                jobId={jobId}
                artifacts={state.artifacts}
                sourceSrc={sourceSrc}
              />
            ) : null}

            {repaired && jobId !== null && sourceSrc !== null ? (
              <div>
                <p className="mb-2 text-xs uppercase tracking-wider text-muted">
                  {t("repair.beforeAfter")}
                </p>
                {/* The same wipe slider the heatmap uses — already keyboard
                    operable and direction-aware, so before/after costs nothing. */}
                <BeforeAfter
                  baseSrc={sourceSrc}
                  overlaySrc={artifactUrl(jobId, "repaired")}
                  overlayAlt={t("repair.repairedAlt")}
                />
                <div className="mt-3">
                  <ArtifactPersistenceNote
                    status={artifactSaveStatus}
                    onRetry={retryArtifactSave}
                  />
                </div>
              </div>
            ) : null}

            {state.status === "error" ? (
              <p role="alert" className="text-sm text-hazard">
                {t(`repair.errors.${state.detail ?? "server"}`)}
              </p>
            ) : null}

            {!running ? (
              <div className="flex flex-wrap items-center gap-3">
                <Button variant="ghost" onClick={() => setEditing((open) => !open)}>
                  {t("repair.editPrompt")}
                </Button>
                <Button variant="ghost" onClick={() => void run()}>
                  {t("repair.rerun")}
                </Button>
              </div>
            ) : null}

            {editing ? (
              <div>
                <label
                  htmlFor="repair-prompt"
                  className="block text-xs uppercase tracking-wider text-muted"
                >
                  {t("repair.promptLabel")}
                </label>
                <textarea
                  id="repair-prompt"
                  rows={4}
                  value={prompt}
                  placeholder={t("repair.promptPlaceholder")}
                  onChange={(event) => setPrompt(event.target.value)}
                  className="mt-1 w-full rounded border border-line bg-bg p-2 text-xs text-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-hazard"
                />
                <p className="mt-1 text-xs text-muted">{t("repair.promptHint")}</p>
              </div>
            ) : null}
          </div>
        )}
      </div>
    </section>
  );
}
