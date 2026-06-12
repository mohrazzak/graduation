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
  save: (file: File, prediction: Prediction) => void;
  /** Back to idle; an in-flight save still persists but no longer reports. */
  reset: () => void;
}

export function useSaveAnalysis(): UseSaveAnalysis {
  const [status, setStatus] = useState<SaveStatus>("idle");
  const [errorCode, setErrorCode] = useState<QueryErrorCode | null>(null);
  // Monotonic id: a completion landing after reset() ("Analyze another", new
  // file) must not resurrect a toast/error for a result no longer on screen.
  const requestIdRef = useRef(0);

  const save = useCallback((file: File, prediction: Prediction) => {
    const requestId = ++requestIdRef.current;
    setStatus("saving");
    setErrorCode(null);
    saveAnalysis({ file, prediction })
      // saveAnalysis returns Result instead of throwing, but a defensive catch
      // keeps an unexpected rejection from leaving the status stuck on "saving".
      .catch((): { error: QueryErrorCode } => ({ error: "save_failed" }))
      .then(({ error }) => {
        if (requestId !== requestIdRef.current) return; // stale: user moved on
        if (error !== null) {
          setErrorCode(error);
          setStatus("failed");
        } else {
          setStatus("saved");
        }
      });
  }, []);

  const reset = useCallback(() => {
    requestIdRef.current += 1;
    setStatus("idle");
    setErrorCode(null);
  }, []);

  return { status, errorCode, save, reset };
}
