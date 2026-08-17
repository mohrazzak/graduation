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
