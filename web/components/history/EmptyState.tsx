"use client";
// Quiet centered empty state for history: the brand scale, the "no assessments
// yet" line, and a CTA into the analyze flow.
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/Button";
import { ScaleStrip } from "@/components/ui/ScaleStrip";
import { DAMAGE_LEVELS } from "@/lib/levels";

export function EmptyState() {
  const t = useTranslations();

  return (
    <div className="flex flex-col items-center gap-6 py-20 text-center">
      <div className="w-28">
        <ScaleStrip size="md" />
      </div>
      {/* Mono accent: the scale's range in level digits, echoing the data voice. */}
      <p aria-hidden="true" className="flex gap-2 font-mono text-xs text-muted">
        <span>{t("common.levelDigit", { id: String(DAMAGE_LEVELS[0]?.id ?? 0) })}</span>
        <span>&ndash;</span>
        <span>
          {t("common.levelDigit", { id: String(DAMAGE_LEVELS[DAMAGE_LEVELS.length - 1]?.id ?? 5) })}
        </span>
      </p>
      <p className="max-w-sm text-sm text-muted">{t("history.empty.message")}</p>
      <Button variant="primary" size="lg" href="/analyze">
        {t("history.empty.cta")}
      </Button>
    </div>
  );
}
