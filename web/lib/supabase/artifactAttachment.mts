export interface ArtifactAttachmentOperations {
  readCurrentPath: () => Promise<{ ok: true; path: string | null } | { ok: false }>;
  upload: (path: string, blob: Blob, contentType: string) => Promise<boolean>;
  updatePath: (path: string) => Promise<boolean>;
  remove: (path: string) => Promise<void>;
}

export async function attachArtifactWithOperations(input: {
  path: string;
  blob: Blob;
  contentType: string;
  operations: ArtifactAttachmentOperations;
}): Promise<
  { ok: true; path: string } | { ok: false; stage: "read" | "upload" | "update" }
> {
  let currentPath: string | null;
  try {
    const current = await input.operations.readCurrentPath();
    if (!current.ok) {
      return { ok: false, stage: "read" };
    }
    currentPath = current.path;
  } catch {
    return { ok: false, stage: "read" };
  }

  try {
    if (!(await input.operations.upload(input.path, input.blob, input.contentType))) {
      return { ok: false, stage: "upload" };
    }
  } catch {
    return { ok: false, stage: "upload" };
  }

  try {
    if (await input.operations.updatePath(input.path)) {
      return { ok: true, path: input.path };
    }
  } catch {
    // The uploaded object still needs the same cleanup as a false update result.
  }

  if (currentPath !== input.path) {
    try {
      await input.operations.remove(input.path);
    } catch {
      // Preserve the primary update failure when best-effort cleanup also fails.
    }
  }
  return { ok: false, stage: "update" };
}
