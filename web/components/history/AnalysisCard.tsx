"use client";
// One saved assessment in the history grid: thumbnail, mini scale, tier name,
// confidence + date in mono. The whole card is a button opening the detail modal.
import { useFormatter, useTranslations } from "next-intl";
import { CornerTicks } from "@/components/ui/CornerTicks";
import { TierStrip } from "@/components/ui/TierStrip";
import { getTier } from "@/lib/tiers";
import type { Analysis } from "@/lib/types";

export interface AnalysisCardProps {
  analysis: Analysis;
  /** Signed thumbnail URL; null when signing failed (placeholder shown instead). */
  imageUrl: string | null;
  onOpen: () => void;
}

export function AnalysisCard({ analysis, imageUrl, onOpen }: AnalysisCardProps) {
  const t = useTranslations();
  const format = useFormatter();
  const tier = getTier(analysis.tier);
  const tierName = t(`tiers.${tier.key}.name`);

  return (
    // A real <button> so the whole card is keyboard-operable for free; inner
    // markup stays phrasing-level (span/img) to keep the HTML valid.
    <button
      type="button"
      onClick={onOpen}
      className="relative block w-full rounded border border-line bg-surface p-4 text-start transition-colors duration-150 hover:border-hazard"
    >
      <CornerTicks />
      {imageUrl !== null ? (
        // Plain <img>: short-lived signed URLs gain nothing from next/image.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={imageUrl}
          alt={tierName}
          className="block aspect-[4/3] w-full rounded object-cover"
        />
      ) : (
        // Signing failed for this item only: keep the card usable with a
        // quiet mono tier placeholder instead of a broken image.
        <span className="flex aspect-[4/3] w-full items-center justify-center rounded bg-bg font-mono text-4xl text-muted">
          {tier.code}
        </span>
      )}
      <TierStrip size="md" activeTier={tier.code} className="mt-4" />
      {/* Which services this assessment actually has stored, so the grid shows
          at a glance where the full pipeline was run. */}
      {analysis.repaired_path !== null || analysis.model3d_path !== null ? (
        <span className="mt-3 flex flex-wrap gap-1.5">
          {analysis.repaired_path !== null ? (
            <span className="border border-line px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider text-muted">
              {t("history.badges.repaired")}
            </span>
          ) : null}
          {analysis.model3d_path !== null ? (
            <span className="border border-line px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider text-muted">
              {t("history.badges.model3d")}
            </span>
          ) : null}
        </span>
      ) : null}
      <span className="mt-3 block font-display text-sm font-bold uppercase tracking-wider">
        {tierName}
      </span>
      <span className="mt-2 flex items-baseline justify-between gap-3 font-mono text-xs text-muted">
        <span>
          {format.number(analysis.confidence, {
            style: "percent",
            maximumFractionDigits: 1,
          })}
        </span>
        <time dateTime={analysis.created_at}>
          {format.dateTime(new Date(analysis.created_at), { dateStyle: "medium" })}
        </time>
      </span>
    </button>
  );
}
