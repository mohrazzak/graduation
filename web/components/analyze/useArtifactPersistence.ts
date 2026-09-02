"use client";

import { useCallback, useEffect, useRef, useSyncExternalStore } from "react";
import {
  ArtifactPersistenceController,
  createReplaySafeDisposal,
  fetchArtifactBlob,
  type ArtifactPersistenceStatus,
  type ArtifactPersistenceTarget,
} from "@/lib/artifactPersistence.mts";
import { artifactUrl } from "@/lib/jobs";
import { attachArtifact } from "@/lib/supabase/artifacts";

export interface UseArtifactPersistence extends Pick<ArtifactPersistenceTarget, "kind"> {
  analysisId: string | null;
  analysisStatus: ArtifactPersistenceTarget["analysisStatus"];
  jobId: string | null;
  ready: boolean;
}

export interface UseArtifactPersistenceResult {
  status: ArtifactPersistenceStatus;
  retry: () => void;
}

export function useArtifactPersistence({
  analysisId,
  analysisStatus,
  jobId,
  ready,
  kind,
}: UseArtifactPersistence): UseArtifactPersistenceResult {
  const persistenceRef = useRef<{
    controller: ArtifactPersistenceController;
    disposal: ReturnType<typeof createReplaySafeDisposal>;
  } | null>(null);
  if (persistenceRef.current === null) {
    const controller = new ArtifactPersistenceController(async (id, artifactKind, idOfJob, signal) => {
      const spec =
        artifactKind === "repaired"
          ? { artifactName: "repaired", mediaType: "image/png" }
          : { artifactName: "model", mediaType: "model/gltf-binary" };
      const blob = await fetchArtifactBlob(
        artifactUrl(idOfJob, spec.artifactName),
        spec.mediaType,
        fetch,
        signal,
      );
      if (signal.aborted) return false;
      const result = await attachArtifact(id, artifactKind, blob);
      return result.error === null;
    });
    persistenceRef.current = {
      controller,
      disposal: createReplaySafeDisposal(controller.dispose),
    };
  }
  const subscribe = useCallback(
    (listener: () => void) => persistenceRef.current!.controller.subscribe(listener),
    [],
  );
  const getSnapshot = useCallback(() => persistenceRef.current!.controller.getSnapshot(), []);
  const retry = useCallback(() => persistenceRef.current!.controller.retry(), []);
  const snapshot = useSyncExternalStore(
    subscribe,
    getSnapshot,
    getSnapshot,
  );

  useEffect(() => {
    persistenceRef.current!.controller.update({ analysisId, analysisStatus, jobId, ready, kind });
  }, [analysisId, analysisStatus, jobId, kind, ready]);

  useEffect(() => persistenceRef.current!.disposal.mount(), []);

  return { status: snapshot.status, retry };
}
