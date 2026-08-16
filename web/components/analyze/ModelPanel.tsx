"use client";
// 3D reconstruction. Runs on the original photo, or — once a restoration has
// finished — on the repaired render, which is the difference between a 3D model
// of a damaged building and one of a restored building. Raed asked for both.
import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/Button";
import { CornerTicks } from "@/components/ui/CornerTicks";
import { artifactUrl, startModel3d } from "@/lib/jobs";
import { ModelViewer } from "./ModelViewer";
import { StageProgress } from "./StageProgress";
import { useJob } from "./useJob";

export interface ModelPanelProps {
  file: File;
  /** Set once a restoration finished, enabling the "from repaired" source. */
  repairedJobId: string | null;
  primary: boolean;
}

const STAGE_KEYS = ["uploading", "reconstructing", "downloading"] as const;

export function ModelPanel({ file, repairedJobId, primary }: ModelPanelProps) {
  const t = useTranslations();
  const { jobId, state, running, start } = useJob();
  const [source, setSource] = useState<"original" | "repaired">("original");

  async function run(from: "original" | "repaired"): Promise<void> {
    setSource(from);
    await start(() =>
      from === "repaired" && repairedJobId !== null
        ? startModel3d({ fromJob: repairedJobId })
        : startModel3d({ file }),
    );
  }

  const model = state?.artifacts.includes("model") ?? false;

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
              <ModelViewer
                src={artifactUrl(jobId, "model")}
                downloadName={`damagescale-${source}.glb`}
              />
            ) : null}
            {state.status === "error" ? (
              <p role="alert" className="text-sm text-hazard">
                {t(`model3d.errors.${state.detail ?? "server"}`)}
              </p>
            ) : null}
          </div>
        ) : null}
      </div>
    </section>
  );
}
