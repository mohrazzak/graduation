"use client";

import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/Button";
import type { ArtifactPersistenceStatus } from "@/lib/artifactPersistence.mts";

export interface ArtifactPersistenceNoteProps {
  status: ArtifactPersistenceStatus;
  onRetry: () => void;
}

export function ArtifactPersistenceNote({
  status,
  onRetry,
}: ArtifactPersistenceNoteProps) {
  const t = useTranslations();

  if (status === "idle") return null;

  if (status === "failed") {
    return (
      <div role="alert" className="flex flex-wrap items-center gap-3 text-sm text-hazard">
        <span>{t("artifactSave.failed")}</span>
        <Button variant="ghost" onClick={onRetry}>
          {t("artifactSave.retry")}
        </Button>
      </div>
    );
  }

  const messageKey = status === "blocked" ? "blocked" : status;
  return (
    <p role="status" className="text-sm text-muted">
      {t(`artifactSave.${messageKey}`)}
    </p>
  );
}
