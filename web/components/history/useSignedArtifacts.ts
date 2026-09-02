"use client";
// Signing state for the three generated outputs a saved analysis can carry.
//
// All three behave identically — sign on open, cache per analysis id, expose a
// retry and a load-failure mark — and differ only in which column holds the
// path. Written once and keyed by kind, rather than three near-identical copies
// of the same state, callbacks and retry handlers.
//
// Signing is lazy on purpose: only an opened analysis needs these, and a GLB is
// far too large to sign for every card in the grid.
import { useCallback, useRef, useState } from "react";
import { getSignedUrl } from "@/lib/supabase/queries";
import {
  SignedArtifactController,
  type SignedArtifact,
  type SignedArtifactPublisher,
} from "@/lib/signedArtifact.mts";
import type { Analysis } from "@/lib/types";
import type { ArtifactSlot } from "./GeneratedOutputs";

export type ArtifactKind = "repaired" | "model" | "model-before";

const ARTIFACT_KINDS: readonly ArtifactKind[] = ["repaired", "model", "model-before"];

/** Which column holds each kind's storage path. Null means it was never generated. */
const PATH_OF: Record<ArtifactKind, (analysis: Analysis) => string | null> = {
  repaired: (analysis) => analysis.repaired_path,
  model: (analysis) => analysis.model3d_path,
  "model-before": (analysis) => analysis.model3d_before_path,
};

type ArtifactMap = Record<string, SignedArtifact>;
type KindMaps = Record<ArtifactKind, ArtifactMap>;

const EMPTY_MAPS: KindMaps = { repaired: {}, model: {}, "model-before": {} };
const LOADING: SignedArtifact = { status: "loading" };

export interface SignedArtifacts {
  /** Signs every output this analysis actually has, skipping ones already cached. */
  signAll: (analysis: Analysis) => void;
  /** The props GeneratedOutputs needs for one kind of the selected analysis. */
  slotFor: (kind: ArtifactKind, analysis: Analysis) => ArtifactSlot;
}

export function useSignedArtifacts(): SignedArtifacts {
  const [maps, setMaps] = useState<KindMaps>(EMPTY_MAPS);
  const controllerRef = useRef<SignedArtifactController | null>(null);
  if (controllerRef.current === null) {
    controllerRef.current = new SignedArtifactController();
  }

  // Keyed by kind AND id so a late result can never attach to another analysis.
  const publish = useCallback(
    (kind: ArtifactKind, id: string): SignedArtifactPublisher =>
      (artifact) => {
        setMaps((current) => ({
          ...current,
          [kind]: { ...current[kind], [id]: artifact },
        }));
      },
    [],
  );

  const sign = useCallback(
    (kind: ArtifactKind, analysis: Analysis) => {
      const path = PATH_OF[kind](analysis);
      if (path === null) return;
      void controllerRef.current!.load(
        `${kind}:${analysis.id}`,
        path,
        getSignedUrl,
        publish(kind, analysis.id),
      );
    },
    [publish],
  );

  const signAll = useCallback(
    (analysis: Analysis) => {
      for (const kind of ARTIFACT_KINDS) {
        if (PATH_OF[kind](analysis) === null) continue;
        // Already signed for this analysis: reopening costs nothing.
        if (maps[kind][analysis.id] !== undefined) continue;
        sign(kind, analysis);
      }
    },
    [maps, sign],
  );

  const slotFor = useCallback(
    (kind: ArtifactKind, analysis: Analysis): ArtifactSlot => ({
      artifact: maps[kind][analysis.id] ?? LOADING,
      onRetry: () => sign(kind, analysis),
      onLoadError: () =>
        controllerRef.current!.fail(
          `${kind}:${analysis.id}`,
          publish(kind, analysis.id),
        ),
    }),
    [maps, publish, sign],
  );

  return { signAll, slotFor };
}
