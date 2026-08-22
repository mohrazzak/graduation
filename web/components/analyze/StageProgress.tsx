"use client";
// The pipeline's real stages. Each line is a step the backend genuinely
// reached — nothing here is a timed animation standing in for progress.
//
// The generation step is deliberately indefinite: the image API reports no
// progress at all, so it shows elapsed time rather than a fake percentage.
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import type { JobStage, JobStatus, JobTiming } from "@/lib/jobs";

export interface StageProgressProps {
  /** Ordered stage keys for this service, from the API contract. */
  stageKeys: readonly string[];
  current: JobStage | null;
  status: JobStatus;
  timing: JobTiming;
  /** Message key namespace: "repair" or "model3d". */
  service: string;
  /** Which stage has no progress signal and shows elapsed time instead. */
  indefiniteKey?: string;
}

/** Counts up from mount. Mounted only while the indefinite stage is running,
 *  so entering and leaving that stage needs no state resetting. */
function formatElapsed(milliseconds: number): string {
  return `${(milliseconds / 1000).toFixed(1)}s`;
}

function LiveElapsed({ measuredMs }: { measuredMs: number }) {
  const [startedAt] = useState(() => Date.now() - measuredMs);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);
  return <>{formatElapsed(Math.max(measuredMs, now - startedAt))}</>;
}

export function StageProgress({
  stageKeys,
  current,
  status,
  timing,
  service,
  indefiniteKey,
}: StageProgressProps) {
  const t = useTranslations();

  return (
    <ol className="space-y-1.5 font-mono text-xs">
      {stageKeys.map((key, index) => {
        const position = index + 1;
        const done =
          status === "done" || (current !== null && position < current.index);
        const active = current?.key === key && status === "running";
        const indefinite = active && key === indefiniteKey;
        const measured = timing.stages.find((stage) => stage.key === key);
        return (
          <li
            key={key}
            className={`flex items-baseline gap-2 ${
              done || active ? "" : "text-muted/50"
            }`}
          >
            <span className="text-muted">{String(position).padStart(2, "0")}</span>
            <span className="min-w-0 flex-1 truncate">
              {t(`${service}.stages.${key}`)}
            </span>
            {done ? (
              <span className="text-hazard">
                {measured ? formatElapsed(measured.elapsed_ms) : t("services.ok")}
              </span>
            ) : active ? (
              <span className="text-hazard">
                {indefinite && measured ? (
                  <LiveElapsed measuredMs={measured.elapsed_ms} />
                ) : measured ? (
                  formatElapsed(measured.elapsed_ms)
                ) : (
                  "..."
                )}
              </span>
            ) : measured?.status === "error" ? (
              <span className="text-alert">{formatElapsed(measured.elapsed_ms)}</span>
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}
