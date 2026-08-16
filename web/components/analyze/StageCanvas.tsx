"use client";
// The photo beside the pipeline's intermediate outputs — Raed's interactive
// canvas. Both panels are REAL artifacts the backend produced: the building
// mask from semantic segmentation, and the edge map. They appear the moment
// each stage finishes, so the canvas fills in as the job runs.
//
// Read-only by design: no available restoration backend can honor a hand-drawn
// mask, and a canvas whose strokes were silently discarded would be a lie.
import Image from "next/image";
import { useTranslations } from "next-intl";
import { artifactUrl } from "@/lib/jobs";

export interface StageCanvasProps {
  jobId: string;
  /** Artifact names currently ready on the job. */
  artifacts: string[];
  /** Object URL of the source photo. */
  sourceSrc: string | null;
}

const PANELS = [
  { artifact: "mask", key: "mask" },
  { artifact: "edges", key: "edges" },
] as const;

export function StageCanvas({ jobId, artifacts, sourceSrc }: StageCanvasProps) {
  const t = useTranslations();

  return (
    <ul className="grid grid-cols-3 gap-2">
      <li>
        <p className="mb-1 font-mono text-[10px] uppercase tracking-wider text-muted">
          {t("repair.canvas.source")}
        </p>
        <span className="block aspect-[4/3] overflow-hidden rounded border border-line bg-bg">
          {sourceSrc !== null ? (
            // eslint-disable-next-line @next/next/no-img-element -- blob URL
            <img src={sourceSrc} alt="" className="h-full w-full object-cover" />
          ) : null}
        </span>
      </li>
      {PANELS.map((panel) => {
        const ready = artifacts.includes(panel.artifact);
        return (
          <li key={panel.artifact}>
            <p className="mb-1 font-mono text-[10px] uppercase tracking-wider text-muted">
              {t(`repair.canvas.${panel.key}`)}
            </p>
            <span className="flex aspect-[4/3] items-center justify-center overflow-hidden rounded border border-line bg-bg">
              {ready ? (
                <Image
                  src={artifactUrl(jobId, panel.artifact)}
                  alt={t(`repair.canvas.${panel.key}`)}
                  width={320}
                  height={240}
                  unoptimized
                  className="h-full w-full object-cover"
                />
              ) : (
                <span className="font-mono text-[10px] text-muted/60">
                  {t("repair.canvas.pending")}
                </span>
              )}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
