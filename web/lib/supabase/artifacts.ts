// Attaching a generated output to an analysis that already exists.
//
// Separate from queries.ts because the lifecycle is different: the row is
// created when the photo is classified, but a restored image or a 3D model
// arrives minutes later from a polled job. Attaching one means an upload plus
// a row update that must not leave the two disagreeing — which is why it runs
// through artifactAttachment.mts rather than being written inline.
import { attachArtifactWithOperations } from "./artifactAttachment.mts";
import { isSupabaseConfigured } from "./auth";
import { getSupabaseBrowserClient } from "./client";
import { BUCKET, type Result } from "./queries";

/** The pipeline outputs that can be attached to an analysis after the fact. */
export type GeneratedArtifact = "repaired" | "model3d_before" | "model3d_after";

const ARTIFACT_SPEC: Record<
  GeneratedArtifact,
  { extension: string; contentType: string }
> = {
  repaired: { extension: "_repaired.png", contentType: "image/png" },
  model3d_before: { extension: "_before.glb", contentType: "model/gltf-binary" },
  model3d_after: { extension: "_after.glb", contentType: "model/gltf-binary" },
};

// Attaches a generated output to an existing analysis: uploads it and records
// its path on the row, so a result survives the job's 30-minute memory TTL and
// can be reopened from history.
//
// upsert: re-running a restoration on the same analysis replaces the stored
// image rather than failing or orphaning the old one.
export async function attachArtifact(
  analysisId: string,
  kind: GeneratedArtifact,
  blob: Blob,
): Promise<Result<string>> {
  if (!isSupabaseConfigured()) {
    return { data: null, error: "not_configured" };
  }
  const supabase = getSupabaseBrowserClient();
  const { data: userData } = await supabase.auth.getUser();
  const userId = userData.user?.id;
  if (!userId) {
    return { data: null, error: "not_authenticated" };
  }

  const spec = ARTIFACT_SPEC[kind];
  const path = `${userId}/${analysisId}${spec.extension}`;
  const attachment = await attachArtifactWithOperations({
    path,
    blob,
    contentType: spec.contentType,
    operations: {
      readCurrentPath: async () => {
        const { data: row, error } = await supabase
          .from("analyses")
          .select("repaired_path, model3d_path, model3d_before_path")
          .eq("id", analysisId)
          .eq("user_id", userId)
          .maybeSingle();
        if (error || row === null) {
          return { ok: false };
        }
        return {
          ok: true,
          path:
            kind === "repaired"
              ? row.repaired_path
              : kind === "model3d_before"
                ? row.model3d_before_path
                : row.model3d_path,
        };
      },
      upload: async (uploadPath, uploadBlob, contentType) => {
        const { error } = await supabase.storage
          .from(BUCKET)
          .upload(uploadPath, uploadBlob, { contentType, upsert: true });
        return !error;
      },
      updatePath: async (updatePath) => {
        // Named explicitly rather than via a computed key: a computed key widens the
        // patch to a string index signature and loses postgrest's column checking.
        const patch = kind === "repaired"
          ? { repaired_path: updatePath }
          : kind === "model3d_before"
            ? { model3d_before_path: updatePath }
            : { model3d_path: updatePath };
        const { data, error } = await supabase
          .from("analyses")
          .update(patch)
          .eq("id", analysisId)
          .eq("user_id", userId)
          .select("id")
          .single();
        return !error && data !== null;
      },
      remove: async (removePath) => {
        const { error } = await supabase.storage.from(BUCKET).remove([removePath]);
        if (error) {
          throw error;
        }
      },
    },
  });
  if (!attachment.ok) {
    return {
      data: null,
      error: attachment.stage === "upload" ? "upload_failed" : "save_failed",
    };
  }
  return { data: attachment.path, error: null };
}
