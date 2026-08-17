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

const artifactByteLimits: Readonly<Record<string, number>> = Object.freeze({
  "image/png": 25 * 1024 * 1024,
  "model/gltf-binary": 32 * 1024 * 1024,
});

const pngSignature = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
const pngCrcTable = new Uint32Array(256);
for (let index = 0; index < pngCrcTable.length; index += 1) {
  let value = index;
  for (let bit = 0; bit < 8; bit += 1) {
    value = (value & 1) !== 0 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  }
  pngCrcTable[index] = value >>> 0;
}

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
    // Teardown detaches UI state but must not cancel persistence that already
    // started: navigation should not lose a successful generated result.
    // Superseding updates still abort through abortActiveAttempt() above.
    this.activeAbortController = null;
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

  const byteLimit = artifactByteLimits[normalizedExpectedType];
  if (byteLimit === undefined) {
    throw new Error(`Unsupported artifact media type ${expectedContentType}`);
  }
  const declaredLength = response.headers.get("content-length")?.trim();
  if (declaredLength && /^\d+$/.test(declaredLength)) {
    const declaredBytes = Number(declaredLength);
    if (!Number.isSafeInteger(declaredBytes) || declaredBytes > byteLimit) {
      throw new Error(`Artifact response is too large for ${normalizedExpectedType}`);
    }
  }

  const bytes = await readBoundedBody(response, byteLimit, signal);
  throwIfAborted(signal);
  if (bytes.byteLength === 0) {
    throw new Error("Artifact response body is empty");
  }
  if (normalizedExpectedType === "image/png" && !isValidPng(bytes)) {
    throw new Error("Artifact response is not a valid PNG");
  }
  if (normalizedExpectedType === "model/gltf-binary" && !isValidGlb(bytes)) {
    throw new Error("Artifact response is not a valid GLB");
  }
  return new Blob([bytes.buffer as ArrayBuffer], { type: normalizedExpectedType });
}

async function readBoundedBody(
  response: Response,
  byteLimit: number,
  signal: AbortSignal | undefined,
): Promise<Uint8Array> {
  if (response.body === null) {
    return new Uint8Array();
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      throwIfAborted(signal);
      const { done, value } = await reader.read();
      throwIfAborted(signal);
      if (done) break;
      total += value.byteLength;
      if (total > byteLimit) {
        void reader.cancel().catch(() => undefined);
        throw new Error("Artifact response body is too large");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

function isValidPng(bytes: Uint8Array): boolean {
  if (bytes.byteLength < pngSignature.byteLength + 12) return false;
  if (!pngSignature.every((value, index) => bytes[index] === value)) return false;

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = pngSignature.byteLength;
  let chunkIndex = 0;
  let sawImageData = false;
  while (offset < bytes.byteLength) {
    if (offset + 12 > bytes.byteLength) return false;
    const length = view.getUint32(offset, false);
    const typeOffset = offset + 4;
    const dataOffset = typeOffset + 4;
    const crcOffset = dataOffset + length;
    const nextOffset = crcOffset + 4;
    if (nextOffset > bytes.byteLength) return false;

    const type = ascii(bytes, typeOffset, 4);
    if (view.getUint32(crcOffset, false) !== pngCrc32(bytes, typeOffset, crcOffset)) {
      return false;
    }
    if (chunkIndex === 0) {
      if (type !== "IHDR" || length !== 13) return false;
      const width = view.getUint32(dataOffset, false);
      const height = view.getUint32(dataOffset + 4, false);
      const bitDepth = bytes[dataOffset + 8];
      const colorType = bytes[dataOffset + 9];
      const validDepths: Readonly<Record<number, readonly number[]>> = {
        0: [1, 2, 4, 8, 16],
        2: [8, 16],
        3: [1, 2, 4, 8],
        4: [8, 16],
        6: [8, 16],
      };
      if (
        width === 0 ||
        height === 0 ||
        bitDepth === undefined ||
        colorType === undefined ||
        !validDepths[colorType]?.includes(bitDepth) ||
        bytes[dataOffset + 10] !== 0 ||
        bytes[dataOffset + 11] !== 0 ||
        ![0, 1].includes(bytes[dataOffset + 12] ?? -1)
      ) {
        return false;
      }
    } else if (type === "IHDR") {
      return false;
    }

    if (type === "IDAT") sawImageData = true;
    if (type === "IEND") {
      return length === 0 && sawImageData && nextOffset === bytes.byteLength;
    }
    offset = nextOffset;
    chunkIndex += 1;
  }
  return false;
}

function pngCrc32(bytes: Uint8Array, start: number, end: number): number {
  let crc = 0xffffffff;
  for (let index = start; index < end; index += 1) {
    const byte = bytes[index];
    if (byte === undefined) return -1;
    crc = (pngCrcTable[(crc ^ byte) & 0xff] ?? 0) ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function isValidGlb(bytes: Uint8Array): boolean {
  if (bytes.byteLength < 20 || ascii(bytes, 0, 4) !== "glTF") return false;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint32(4, true) !== 2 || view.getUint32(8, true) !== bytes.byteLength) {
    return false;
  }

  let offset = 12;
  let chunkIndex = 0;
  while (offset < bytes.byteLength) {
    if (offset + 8 > bytes.byteLength) return false;
    const chunkLength = view.getUint32(offset, true);
    const chunkType = view.getUint32(offset + 4, true);
    const nextOffset = offset + 8 + chunkLength;
    if (chunkLength % 4 !== 0 || nextOffset > bytes.byteLength) return false;
    if (chunkIndex === 0 && chunkType !== 0x4e4f534a) return false;
    offset = nextOffset;
    chunkIndex += 1;
  }
  return chunkIndex > 0 && offset === bytes.byteLength;
}

function ascii(bytes: Uint8Array, start: number, length: number): string {
  let value = "";
  for (let index = start; index < start + length; index += 1) {
    const byte = bytes[index];
    if (byte === undefined) return "";
    value += String.fromCharCode(byte);
  }
  return value;
}

function throwIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) {
    throw new DOMException("Artifact persistence was aborted", "AbortError");
  }
}
