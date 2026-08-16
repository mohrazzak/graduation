"use client";
// Loads the classifier roster once and tracks which one the user picked.
// Kept out of AnalyzeClient so the orchestrator stays about the analyze phases.
import { useCallback, useEffect, useState } from "react";
import { getModels } from "@/lib/api";
import type { ModelInfo } from "@/lib/types";

export interface UseModels {
  models: ModelInfo[];
  /** null until the roster loads, or when nothing in it is usable. */
  selected: string | null;
  select: (id: string) => void;
}

export function useModels(): UseModels {
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void getModels()
      .then((roster) => {
        if (cancelled) return;
        setModels(roster);
        // Default to the first model that can actually run, matching the API's
        // own default so the picker never disagrees with an unselected request.
        setSelected(roster.find((model) => model.available)?.id ?? null);
      })
      .catch(() => {
        // A roster we cannot read is not an error the user can act on: the
        // picker simply stays hidden and /predict uses the server default.
        if (!cancelled) setModels([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const select = useCallback((id: string) => setSelected(id), []);

  return { models, selected, select };
}
