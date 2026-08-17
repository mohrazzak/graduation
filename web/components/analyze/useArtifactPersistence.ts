"use client";

import { useCallback, useEffect, useRef, useSyncExternalStore } from "react";
import {
  ArtifactPersistenceController,
  fetchArtifactBlob,
  type ArtifactPersistenceStatus,
  type ArtifactPersistenceTarget,
} from "@/lib/artifactPersistence.mts";
import { artifactUrl } from "@/lib/jobs";
import { attachArtifact } from "@/lib/supabase/queries";

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
  const controllerRef = useRef<ArtifactPersistenceController | null>(null);
  if (controllerRef.current === null) {
    controllerRef.current = new ArtifactPersistenceController(async (id, artifactKind, idOfJob) => {
      const spec =
        artifactKind === "repaired"
          ? { artifactName: "repaired", mediaType: "image/png" }
          : { artifactName: "model", mediaType: "model/gltf-binary" };
      const blob = await fetchArtifactBlob(
        artifactUrl(idOfJob, spec.artifactName),
        spec.mediaType,
      );
      const result = await attachArtifact(id, artifactKind, blob);
      return result.error === null;
    });
  }
  const subscribe = useCallback(
    (listener: () => void) => controllerRef.current!.subscribe(listener),
    [],
  );
  const getSnapshot = useCallback(() => controllerRef.current!.getSnapshot(), []);
  const retry = useCallback(() => controllerRef.current!.retry(), []);
  const snapshot = useSyncExternalStore(
    subscribe,
    getSnapshot,
    getSnapshot,
  );

  useEffect(() => {
    controllerRef.current!.update({ analysisId, analysisStatus, jobId, ready, kind });
  }, [analysisId, analysisStatus, jobId, kind, ready]);

  useEffect(() => () => controllerRef.current!.dispose(), []);

  return { status: snapshot.status, retry };
}
