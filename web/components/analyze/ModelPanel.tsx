"use client";

import { useTranslations } from "next-intl";
import { CornerTicks } from "@/components/ui/CornerTicks";
import { ModelRunCard } from "./ModelRunCard";
import type { SaveStatus } from "./useSaveAnalysis";

export function ModelPanel({
  file,
  analysisId,
  analysisStatus,
  repairedJobId,
}: {
  file: File;
  analysisId: string | null;
  analysisStatus: SaveStatus;
  repairedJobId: string | null;
  primary: boolean;
}) {
  const t = useTranslations();
  return (
    <section className="relative overflow-hidden rounded border border-line bg-surface p-5">
      <CornerTicks />
      <h3 className="font-display text-lg font-extrabold uppercase tracking-tight">{t("model3d.title")}</h3>
      <p className="mt-1 max-w-[70ch] text-sm text-muted">{t("model3d.compareIntro")}</p>
      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <ModelRunCard source="before" file={file} repairedJobId={repairedJobId} analysisId={analysisId} analysisStatus={analysisStatus} />
        <ModelRunCard source="after" file={file} repairedJobId={repairedJobId} analysisId={analysisId} analysisStatus={analysisStatus} />
      </div>
    </section>
  );
}
