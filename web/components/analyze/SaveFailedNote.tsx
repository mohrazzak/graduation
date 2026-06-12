"use client";
// Inline save-failure note for the result column: states why the result was
// not stored and offers retry. Inline (not a toast) so the retry control
// stays on screen until the user resolves it.
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/Button";
import type { QueryErrorCode } from "@/lib/supabase/queries";

export interface SaveFailedNoteProps {
  errorCode: QueryErrorCode;
  onRetry: () => void;
}

type SaveErrorKey = "saveFailed" | "notConfigured" | "notAuthenticated";

// Only these two codes carry a remedy different from "check connection, retry".
const ERROR_KEYS: Partial<Record<QueryErrorCode, SaveErrorKey>> = {
  not_configured: "notConfigured",
  not_authenticated: "notAuthenticated",
};

export function SaveFailedNote({ errorCode, onRetry }: SaveFailedNoteProps) {
  const t = useTranslations();
  const key = ERROR_KEYS[errorCode] ?? "saveFailed";

  return (
    <div role="alert" className="rounded border border-alert/40 bg-alert/10 p-5">
      <p className="text-sm text-alert">{t(`analyze.errors.${key}`)}</p>
      <Button variant="ghost" className="mt-4" onClick={onRetry}>
        {t("common.actions.retry")}
      </Button>
    </div>
  );
}
