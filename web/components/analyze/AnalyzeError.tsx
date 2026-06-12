"use client";
// Inline analysis-failure card: states cause + fix per ApiError kind and
// offers retry / start-over. Never apologetic (spec section 3).
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/Button";
import type { ApiErrorKind } from "@/lib/api";

export interface AnalyzeErrorProps {
  kind: ApiErrorKind;
  onRetry: () => void;
  onReset: () => void;
}

// bad_file is the only kind with a distinct user remedy; the rest all mean
// "the analysis service did not answer usefully — check it, then retry".
const ERROR_KEY: Record<ApiErrorKind, "badFileType" | "predictionFailed"> = {
  bad_file: "badFileType",
  server: "predictionFailed",
  network: "predictionFailed",
  timeout: "predictionFailed",
};

export function AnalyzeError({ kind, onRetry, onReset }: AnalyzeErrorProps) {
  const t = useTranslations();

  return (
    // Hazard, not alert: #FF3B30 is reserved for level-4/5 surfaces (spec section 8).
    <div role="alert" className="rounded border border-hazard/40 bg-hazard/10 p-5">
      <p className="text-sm text-hazard">{t(`analyze.errors.${ERROR_KEY[kind]}`)}</p>
      <div className="mt-4 flex flex-wrap gap-3">
        <Button variant="primary" onClick={onRetry}>
          {t("common.actions.retry")}
        </Button>
        <Button variant="ghost" onClick={onReset}>
          {t("common.actions.analyzeAnother")}
        </Button>
      </div>
    </div>
  );
}
