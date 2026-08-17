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
export type ArtifactSaver = (
  analysisId: string,
  kind: ArtifactPersistenceTarget["kind"],
  jobId: string,
  signal: AbortSignal,
) => Promise<boolean>;

const idleSnapshot: ArtifactPersistenceSnapshot = Object.freeze({
  status: "idle",
  targetKey: null,
});

/**
 * Defers disposal by one microtask so React Strict Mode's development-only
 * setup -> cleanup -> setup replay keeps one live resource. A real unmount
 * has no replacement mount, so it disposes exactly once.
 */
export function createReplaySafeDisposal(dispose: () => void): {
  mount: () => () => void;
} {
  let latestMount = 0;
  let disposed = false;

  return {
    mount: () => {
      const mount = ++latestMount;
      return () => {
        queueMicrotask(() => {
          if (!disposed && latestMount === mount) {
            disposed = true;
            dispose();
          }
        });
      };
    },
  };
}

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
  private activeAbortController: AbortController | null = null;
  private saveQueue: Promise<void> = Promise.resolve();
  private queueHasWork = false;
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
      this.abortActiveAttempt();
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
      this.abortActiveAttempt();
      this.attemptKey = null;
    }

    // A retained id is authoritative: the saved-toast may be dismissed, which
    // deliberately changes its presentation status back to idle.
    if (target.analysisStatus === "failed" && !target.analysisId) {
      if (!targetChanged && this.snapshot.status === "saving") {
        this.generation += 1;
        this.abortActiveAttempt();
        this.attemptKey = null;
      }
      this.setSnapshot("blocked", nextKey);
      return;
    }

    if (!target.jobId || !target.analysisId) {
      if (!targetChanged && this.snapshot.status === "saving") {
        this.generation += 1;
        this.abortActiveAttempt();
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
      (!previousTarget?.analysisId && this.snapshot.status === "waiting");
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
    this.abortActiveAttempt();
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
    const abortController = new AbortController();
    this.activeAbortController = abortController;
    this.setSnapshot("saving", key);

    const invokeSaver = (): Promise<boolean> => {
      if (abortController.signal.aborted || !this.isCurrentAttempt(attemptGeneration, key)) {
        return Promise.resolve(false);
      }
      try {
        return Promise.resolve(this.saver(analysisId, target.kind, jobId, abortController.signal));
      } catch {
        return Promise.reject(new Error("Artifact saver threw"));
      }
    };

    // An older fetch can be aborted, but an attachment already in progress is
    // intentionally allowed to settle. Queue the newer writer behind it so a
    // stale completion can never overwrite the newest deterministic path.
    const saveResult = this.queueHasWork
      ? this.saveQueue.then(invokeSaver, invokeSaver)
      : invokeSaver();
    const completed = Promise.resolve(saveResult).then(
      () => undefined,
      () => undefined,
    );
    this.queueHasWork = true;
    this.saveQueue = completed;
    void completed.then(() => {
      if (this.saveQueue === completed) {
        this.queueHasWork = false;
      }
    });

    void Promise.resolve(saveResult)
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

  private abortActiveAttempt(): void {
    this.activeAbortController?.abort();
    this.activeAbortController = null;
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
  signal?: AbortSignal,
): Promise<Blob> {
  throwIfAborted(signal);
  const response = await fetchImpl(url, { signal });
  throwIfAborted(signal);
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
  throwIfAborted(signal);
  if (blob.size === 0) {
    throw new Error("Artifact response body is empty");
  }
  return blob;
}

function throwIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) {
    throw new DOMException("Artifact persistence was aborted", "AbortError");
  }
}
