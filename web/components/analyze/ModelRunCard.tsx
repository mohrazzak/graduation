"use client";

import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/Button";
import { artifactUrl, startModel3d } from "@/lib/jobs";
import { ArtifactPersistenceNote } from "./ArtifactPersistenceNote";
import { ModelViewer } from "./ModelViewer";
import { StageProgress } from "./StageProgress";
import { useArtifactPersistence } from "./useArtifactPersistence";
import { useJob } from "./useJob";
import type { SaveStatus } from "./useSaveAnalysis";

const STAGES = ["uploading", "reconstructing", "downloading"] as const;

export function ModelRunCard({
  source,
  file,
  repairedJobId,
  analysisId,
  analysisStatus,
}: {
  source: "before" | "after";
  file: File;
  repairedJobId: string | null;
  analysisId: string | null;
  analysisStatus: SaveStatus;
}) {
  const t = useTranslations();
  const job = useJob();
  const enabled = source === "before" || repairedJobId !== null;
  const ready = job.state?.artifacts.includes("model") ?? false;
  const persistence = useArtifactPersistence({
    analysisId,
    analysisStatus,
    jobId: job.jobId,
    ready,
    kind: source === "before" ? "model3d_before" : "model3d_after",
  });

  const run = () => job.start(() =>
    source === "after" && repairedJobId
      ? startModel3d({ fromJob: repairedJobId })
      : startModel3d({ file }),
  );

  return (
    <div className="min-w-0 border-t border-line pt-4 first:border-t-0 first:pt-0 lg:border-s lg:border-t-0 lg:ps-5 lg:first:border-s-0 lg:first:ps-0">
      <h4 className="font-display text-base font-bold uppercase">{t(`model3d.${source}.title`)}</h4>
      <p className="mt-1 text-sm text-muted">{t(`model3d.${source}.description`)}</p>
      <div className="mt-3">
        <Button disabled={!enabled || job.running} onClick={() => void run()}>
          {t(`model3d.${source}.run`)}
        </Button>
      </div>
      {!enabled ? <p className="mt-2 text-xs text-muted">{t("model3d.after.disabled")}</p> : null}
      {job.state ? (
        <div className="mt-4 space-y-4">
          <StageProgress stageKeys={STAGES} current={job.state.stage} status={job.state.status} timing={job.state.timing} service="model3d" indefiniteKey="reconstructing" />
          {ready && job.jobId ? (
            <>
              <ModelViewer src={artifactUrl(job.jobId, "model")} downloadName={`damagescale-${source}.glb`} />
              <ArtifactPersistenceNote status={persistence.status} onRetry={persistence.retry} />
            </>
          ) : null}
          {job.state.status === "error" ? <p role="alert" className="text-sm text-hazard">{t(`model3d.errors.${job.state.detail ?? "server"}`)}</p> : null}
        </div>
      ) : null}
    </div>
  );
}
