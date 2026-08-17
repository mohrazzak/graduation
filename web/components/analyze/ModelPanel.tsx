"use client";
// 3D reconstruction. Runs on the original photo, or — once a restoration has
// finished — on the repaired render, which is the difference between a 3D model
// of a damaged building and one of a restored building. Raed asked for both.
import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/Button";
import { CornerTicks } from "@/components/ui/CornerTicks";
import { model3dFixtureFor } from "@/lib/fixtures";
import { attachModel3d } from "@/lib/supabase/queries";
import { artifactUrl, startModel3d } from "@/lib/jobs";
import { ModelViewer } from "./ModelViewer";
import { StageProgress } from "./StageProgress";
import { useJob } from "./useJob";

export interface ModelPanelProps {
  file: File;
  /** Row to attach a kept model to; null until the analysis has saved. */
  analysisId: string | null;
  /** Set once a restoration finished, enabling the "from repaired" source. */
  repairedJobId: string | null;
  primary: boolean;
}

const STAGE_KEYS = ["uploading", "reconstructing", "downloading"] as const;

export function ModelPanel({
  file,
  analysisId,
  repairedJobId,
  primary,
}: ModelPanelProps) {
  const t = useTranslations();
  const { jobId, state, running, start } = useJob();
  const [source, setSource] = useState<"original" | "repaired">("original");
  // Keeping a model is explicit: a GLB is 9-17 MB against a 1 GB bucket, so the
  // user decides which are worth storing rather than every run filling it.
  const [keepState, setKeepState] = useState<"idle" | "saving" | "kept" | "failed">(
    "idle",
  );

  async function keep(): Promise<void> {
    if (jobId === null || analysisId === null) return;
    setKeepState("saving");
    try {
      const response = await fetch(artifactUrl(jobId, "model"));
      const { error } = await attachModel3d(analysisId, await response.blob());
      setKeepState(error === null ? "kept" : "failed");
    } catch {
      setKeepState("failed");
    }
  }

  async function run(from: "original" | "repaired"): Promise<void> {
    setSource(from);
    await start(() =>
      from === "repaired" && repairedJobId !== null
        ? startModel3d({ fromJob: repairedJobId })
        : startModel3d({ file }),
    );
  }

  const model = state?.artifacts.includes("model") ?? false;
  // When the service is simply out of credit, fall back to a pre-generated
  // model of THIS photo if one exists — clearly labelled, never passed off
  // as live output.
  const fixture =
    state?.status === "error" ? model3dFixtureFor(file.name, state.detail) : null;

  return (
    <section className="relative overflow-hidden rounded border border-line bg-surface">
      <div className="relative p-5">
        <CornerTicks />
        <h3 className="font-display text-lg font-extrabold uppercase tracking-tight">
          {t("model3d.title")}
        </h3>
        <p className="mt-1 text-sm text-muted">{t("model3d.intro")}</p>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <Button
            variant={primary ? "primary" : "ghost"}
            disabled={running}
            onClick={() => void run("original")}
          >
            {t("model3d.runOriginal")}
          </Button>
          {repairedJobId !== null ? (
            <Button variant="ghost" disabled={running} onClick={() => void run("repaired")}>
              {t("model3d.runRepaired")}
            </Button>
          ) : null}
        </div>

        {state !== null ? (
          <div className="mt-4 space-y-4">
            <p className="font-mono text-[10px] uppercase tracking-wider text-muted">
              {t(`model3d.source.${source}`)}
            </p>
            <StageProgress
              stageKeys={STAGE_KEYS}
              current={state.stage}
              status={state.status}
              service="model3d"
              indefiniteKey="reconstructing"
            />
            {model && jobId !== null ? (
              <>
                <ModelViewer
                  src={artifactUrl(jobId, "model")}
                  downloadName={`damagescale-${source}.glb`}
                />
                {analysisId !== null ? (
                  <p className="flex flex-wrap items-center gap-3">
                    <Button
                      variant="ghost"
                      disabled={keepState === "saving" || keepState === "kept"}
                      onClick={() => void keep()}
                    >
                      {t(`model3d.keep.${keepState === "kept" ? "kept" : "action"}`)}
                    </Button>
                    <span className="text-xs text-muted">
                      {t(`model3d.keep.${keepState === "failed" ? "failed" : "hint"}`)}
                    </span>
                  </p>
                ) : null}
              </>
            ) : null}
            {state.status === "error" ? (
              <p role="alert" className="text-sm text-hazard">
                {t(`model3d.errors.${state.detail ?? "server"}`)}
              </p>
            ) : null}
            {fixture !== null ? (
              <div>
                {/* The label comes FIRST: the viewer below is a stored example,
                    and the user must know that before they look at it. */}
                <p className="mb-2 border-s-2 border-hazard ps-3 text-sm text-hazard">
                  {t("model3d.fixtureNotice")}
                </p>
                <ModelViewer src={fixture} downloadName="damagescale-example.glb" />
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </section>
  );
}
