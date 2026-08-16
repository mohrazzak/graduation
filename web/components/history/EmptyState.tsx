"use client";
// Quiet centered empty state for history: the brand scale, the "no assessments
// yet" line, and a CTA into the analyze flow.
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/Button";
import { TierStrip } from "@/components/ui/TierStrip";
import { DAMAGE_TIERS } from "@/lib/tiers";

export function EmptyState() {
  const t = useTranslations();

  return (
    <div className="flex flex-col items-center gap-6 py-20 text-center">
      <div className="w-28">
        <TierStrip size="md" />
      </div>
      {/* Mono accent: the scale's range in tier codes, echoing the data voice. */}
      <p aria-hidden="true" className="flex gap-2 font-mono text-xs text-muted">
        <span>{DAMAGE_TIERS[0]?.code}</span>
        <span>&ndash;</span>
        <span>{DAMAGE_TIERS[DAMAGE_TIERS.length - 1]?.code}</span>
      </p>
      <p className="max-w-sm text-sm text-muted">{t("history.empty.message")}</p>
      <Button variant="primary" size="lg" href="/analyze">
        {t("history.empty.cta")}
      </Button>
    </div>
  );
}
