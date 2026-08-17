"use client";
// Owns the auto-save lifecycle after a prediction: tracks saving/saved/failed
// (+ stable error code) and discards completions that land after a reset.
import { useCallback, useRef, useState } from "react";
import { saveAnalysis, type QueryErrorCode } from "@/lib/supabase/queries";
import type { Prediction } from "@/lib/types";

export type SaveStatus = "idle" | "saving" | "saved" | "failed";

export interface UseSaveAnalysis {
  status: SaveStatus;
  /** Set only while status is "failed". */
  errorCode: QueryErrorCode | null;
  /** Id of the saved row, so later artifacts can be attached to it. */
  analysisId: string | null;
  save: (file: File, prediction: Prediction) => void;
  /**
   * Stop reporting the outcome (the toast was dismissed) WITHOUT forgetting
   * what was saved. Dismissing a notification does not unsave the row, and
   * later artifacts still need its id to attach to.
   */
  dismiss: () => void;
  /** Back to idle for a NEW analysis; forgets the previous row entirely. */
  reset: () => void;
}

export function useSaveAnalysis(): UseSaveAnalysis {
  const [status, setStatus] = useState<SaveStatus>("idle");
  const [errorCode, setErrorCode] = useState<QueryErrorCode | null>(null);
  const [analysisId, setAnalysisId] = useState<string | null>(null);
  // Monotonic id: a completion landing after reset() ("Analyze another", new
  // file) must not resurrect a toast/error for a result no longer on screen.
  const requestIdRef = useRef(0);

  const save = useCallback((file: File, prediction: Prediction) => {
    const requestId = ++requestIdRef.current;
    setStatus("saving");
    setErrorCode(null);
    setAnalysisId(null);
    saveAnalysis({ file, prediction })
      // saveAnalysis returns Result instead of throwing, but a defensive catch
      // keeps an unexpected rejection from leaving the status stuck on "saving".
      .catch((): { data: null; error: QueryErrorCode } => ({
        data: null,
        error: "save_failed",
      }))
      .then(({ data, error }) => {
        if (requestId !== requestIdRef.current) return; // stale: user moved on
        if (error !== null) {
          setErrorCode(error);
          setStatus("failed");
        } else {
          setAnalysisId(data?.id ?? null);
          setStatus("saved");
        }
      });
  }, []);

  const dismiss = useCallback(() => {
    setStatus("idle");
    setErrorCode(null);
  }, []);

  const reset = useCallback(() => {
    requestIdRef.current += 1;
    setStatus("idle");
    setErrorCode(null);
    setAnalysisId(null);
  }, []);

  return { status, errorCode, analysisId, save, dismiss, reset };
}
