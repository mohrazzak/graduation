"use client";
// Ghost eye-toggle for the Grad-CAM overlay; aria-pressed mirrors visibility.
import { Eye, EyeOff } from "lucide-react";
import { useTranslations } from "next-intl";

export interface HeatmapToggleProps {
  visible: boolean;
  onToggle: () => void;
  disabled?: boolean;
}

export function HeatmapToggle({ visible, onToggle, disabled = false }: HeatmapToggleProps) {
  const t = useTranslations("analyze");
  const Icon = visible ? EyeOff : Eye;

  return (
    <button
      type="button"
      aria-pressed={visible}
      disabled={disabled}
      onClick={onToggle}
      className="inline-flex h-9 select-none items-center justify-center gap-2 rounded border border-line px-4 text-xs font-semibold uppercase tracking-wider text-text transition-colors duration-150 hover:border-muted disabled:pointer-events-none disabled:opacity-40"
    >
      <Icon aria-hidden="true" className="h-3.5 w-3.5" />
      {visible ? t("heatmapHide") : t("heatmapShow")}
    </button>
  );
}
