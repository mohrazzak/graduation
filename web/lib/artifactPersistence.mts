export type AnalysisPersistenceStatus = "idle" | "saving" | "saved" | "failed";

export type ArtifactPersistenceStatus =
  | "idle"
  | "waiting"
  | "blocked"
  | "saving"
  | "saved"
  | "failed";

export interface ArtifactPersistenceTarget {
  analysisId: string | null;
  analysisStatus: AnalysisPersistenceStatus;
  jobId: string | null;
  ready: boolean;
  kind: "repaired" | "model3d";
}

export interface ArtifactPersistenceSnapshot {
  status: ArtifactPersistenceStatus;
  targetKey: string | null;
}

type ArtifactPersistenceListener = () => void;
type ArtifactSaver = (
  analysisId: string,
  kind: ArtifactPersistenceTarget["kind"],
  jobId: string,
) => Promise<boolean>;

const idleSnapshot: ArtifactPersistenceSnapshot = Object.freeze({
  status: "idle",
  targetKey: null,
});

/**
 * Owns one generated-artifact save lifecycle independently of React or any
 * other UI framework. A target is identified by its analysis, artifact kind,
 * and producing job, so a rerun can replace an older in-flight attempt.
 */
export class ArtifactPersistenceController {
  private readonly saver: ArtifactSaver;
  private readonly listeners = new Set<ArtifactPersistenceListener>();
  private generation = 0;
  private attemptKey: string | null = null;
  private activeTarget: ArtifactPersistenceTarget | null = null;
  private activeTargetKey: string | null = null;
  private snapshot: ArtifactPersistenceSnapshot = idleSnapshot;
  private disposed = false;

  constructor(saver: ArtifactSaver) {
    this.saver = saver;
  }

  /** A stable callback suitable for useSyncExternalStore. */
  readonly subscribe = (listener: ArtifactPersistenceListener): (() => void) => {
    if (this.disposed) {
      return () => undefined;
    }
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  /** A stable callback suitable for useSyncExternalStore. */
  readonly getSnapshot = (): ArtifactPersistenceSnapshot => this.snapshot;

  readonly update = (target: ArtifactPersistenceTarget): void => {
    if (this.disposed) {
      return;
    }

    if (!target.ready) {
      this.generation += 1;
      this.activeTarget = null;
      this.activeTargetKey = null;
      this.attemptKey = null;
      this.setSnapshot(idleSnapshot.status, idleSnapshot.targetKey);
      return;
    }

    const nextKey = targetKey(target);
    const targetChanged = nextKey !== this.activeTargetKey;
    const previousTarget = this.activeTarget;
    this.activeTarget = { ...target };
    this.activeTargetKey = nextKey;

    if (targetChanged) {
      this.generation += 1;
      this.attemptKey = null;
    }

    if (target.analysisStatus === "failed") {
      if (!targetChanged && this.snapshot.status === "saving") {
        this.generation += 1;
        this.attemptKey = null;
      }
      this.setSnapshot("blocked", nextKey);
      return;
    }

    if (!target.jobId || !target.analysisId || target.analysisStatus !== "saved") {
      if (!targetChanged && this.snapshot.status === "saving") {
        this.generation += 1;
        this.attemptKey = null;
      }
      this.setSnapshot("waiting", nextKey);
      return;
    }

    // An id can arrive after the service has completed. The target key then
    // changes and starts exactly one attempt. For an unchanged target, only a
    // previously waiting lifecycle is eligible to begin.
    const becameSaveable =
      targetChanged ||
      (previousTarget?.analysisStatus !== "saved" && this.snapshot.status === "waiting");
    if (becameSaveable && this.attemptKey !== nextKey) {
      this.startAttempt(target, nextKey);
    }
  };

  readonly retry = (): void => {
    if (this.disposed || this.snapshot.status !== "failed") {
      return;
    }
    const target = this.activeTarget;
    const key = this.activeTargetKey;
    if (
      !target ||
      !key ||
      !target.ready ||
      target.analysisStatus !== "saved" ||
      !target.analysisId ||
      !target.jobId
    ) {
      return;
    }
    this.startAttempt(target, key);
  };

  readonly dispose = (): void => {
    if (this.disposed) {
      return;
    }
    this.disposed = true;
    this.generation += 1;
    this.activeTarget = null;
    this.activeTargetKey = null;
    this.attemptKey = null;
    this.listeners.clear();
  };

  private startAttempt(target: ArtifactPersistenceTarget, key: string): void {
    const analysisId = target.analysisId;
    const jobId = target.jobId;
    if (!analysisId || !jobId) {
      return;
    }

    this.generation += 1;
    const attemptGeneration = this.generation;
    this.attemptKey = key;
    this.setSnapshot("saving", key);

    let saveResult: Promise<boolean>;
    try {
      // Invoke the saver before returning from update so callers can observe
      // that this target has started exactly one attempt synchronously.
      saveResult = this.saver(analysisId, target.kind, jobId);
    } catch {
      saveResult = Promise.reject(new Error("Artifact saver threw"));
    }

    Promise.resolve(saveResult)
      .then(
        (saved) => {
          if (this.isCurrentAttempt(attemptGeneration, key)) {
            this.setSnapshot(saved ? "saved" : "failed", key);
          }
        },
        () => {
          if (this.isCurrentAttempt(attemptGeneration, key)) {
            this.setSnapshot("failed", key);
          }
        },
      );
  }

  private isCurrentAttempt(attemptGeneration: number, key: string): boolean {
    return (
      !this.disposed &&
      this.generation === attemptGeneration &&
      this.attemptKey === key &&
      this.activeTargetKey === key
    );
  }

  private setSnapshot(status: ArtifactPersistenceStatus, targetKey: string | null): void {
    if (this.snapshot.status === status && this.snapshot.targetKey === targetKey) {
      return;
    }
    this.snapshot = Object.freeze({ status, targetKey });
    for (const listener of this.listeners) {
      listener();
    }
  }
}

function targetKey(target: ArtifactPersistenceTarget): string {
  return JSON.stringify([target.analysisId, target.kind, target.jobId]);
}

export async function fetchArtifactBlob(
  url: string,
  expectedContentType: string,
  fetchImpl: typeof fetch = fetch,
): Promise<Blob> {
  const response = await fetchImpl(url);
  if (!response.ok) {
    throw new Error(`Artifact request failed with status ${response.status}`);
  }

  const contentType = response.headers.get("content-type");
  const normalizedContentType = contentType?.split(";", 1)[0]?.trim().toLowerCase();
  const normalizedExpectedType = expectedContentType.split(";", 1)[0]?.trim().toLowerCase();
  if (!normalizedContentType || normalizedContentType !== normalizedExpectedType) {
    throw new Error(
      `Artifact response media type ${contentType ?? "<missing>"} does not match ${expectedContentType}`,
    );
  }

  const blob = await response.blob();
  if (blob.size === 0) {
    throw new Error("Artifact response body is empty");
  }
  return blob;
}
