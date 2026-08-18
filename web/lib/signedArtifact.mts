// Resolves a private-storage path into an explicit UI state for History outputs.
export type SignedArtifact =
  | { status: "loading" }
  | { status: "ready"; url: string }
  | { status: "failed" };

export interface SignedUrlResult {
  data: string | null;
  error: unknown;
}

export type ArtifactSigner = (path: string) => Promise<SignedUrlResult>;
export type SignedArtifactPublisher = (artifact: SignedArtifact) => void;

export async function loadSignedArtifact(
  path: string,
  signer: ArtifactSigner,
): Promise<SignedArtifact> {
  try {
    const result = await signer(path);
    if (result.error !== null || result.data === null) {
      return { status: "failed" };
    }
    return { status: "ready", url: result.data };
  } catch {
    return { status: "failed" };
  }
}

/** Keeps overlapping signs/media failures ordered without depending on React. */
export class SignedArtifactController {
  private readonly generations = new Map<string, number>();

  async load(
    key: string,
    path: string,
    signer: ArtifactSigner,
    publish: SignedArtifactPublisher,
  ): Promise<void> {
    const generation = this.nextGeneration(key);
    publish({ status: "loading" });
    const artifact = await loadSignedArtifact(path, signer);
    if (this.generations.get(key) === generation) {
      publish(artifact);
    }
  }

  fail(key: string, publish: SignedArtifactPublisher): void {
    this.nextGeneration(key);
    publish({ status: "failed" });
  }

  private nextGeneration(key: string): number {
    const generation = (this.generations.get(key) ?? 0) + 1;
    this.generations.set(key, generation);
    return generation;
  }
}
