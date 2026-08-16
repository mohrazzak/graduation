"use client";
// The pipeline's real stages. Each line is a step the backend genuinely
// reached — nothing here is a timed animation standing in for progress.
//
// The generation step is deliberately indefinite: the image API reports no
// progress at all, so it shows elapsed time rather than a fake percentage.
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import type { JobStage, JobStatus } from "@/lib/jobs";

export interface StageProgressProps {
  /** Ordered stage keys for this service, from the API contract. */
  stageKeys: readonly string[];
  current: JobStage | null;
  status: JobStatus;
  /** Message key namespace: "repair" or "model3d". */
  service: string;
  /** Which stage has no progress signal and shows elapsed time instead. */
  indefiniteKey?: string;
}

/** Counts up from mount. Mounted only while the indefinite stage is running,
 *  so entering and leaving that stage needs no state resetting. */
function ElapsedSeconds() {
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => setSeconds((n) => n + 1), 1000);
    return () => window.clearInterval(id);
  }, []);
  return <>{seconds > 0 ? `${seconds}s` : "..."}</>;
}

export function StageProgress({
  stageKeys,
  current,
  status,
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
              <span className="text-hazard">{t("services.ok")}</span>
            ) : active ? (
              <span className="text-hazard">
                {indefinite ? <ElapsedSeconds /> : "..."}
              </span>
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}
