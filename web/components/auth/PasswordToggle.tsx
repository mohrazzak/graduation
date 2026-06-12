"use client";
// Eye toggle for the password field's trailing slot; aria-pressed mirrors
// visibility. type="button" keeps it out of the submit path (Enter still submits).
import { Eye, EyeOff } from "lucide-react";
import { useTranslations } from "next-intl";

export interface PasswordToggleProps {
  visible: boolean;
  onToggle: () => void;
}

export function PasswordToggle({ visible, onToggle }: PasswordToggleProps) {
  const t = useTranslations("auth.password");
  const Icon = visible ? EyeOff : Eye;
  return (
    <button
      type="button"
      aria-pressed={visible}
      aria-label={visible ? t("hide") : t("show")}
      onClick={onToggle}
      className="flex h-7 w-7 items-center justify-center rounded text-muted transition-colors duration-150 hover:text-text"
    >
      <Icon aria-hidden="true" className="h-4 w-4" />
    </button>
  );
}
