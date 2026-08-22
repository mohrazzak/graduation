// The ONLY data-access layer for analyses + their stored images: storage
// upload/remove/signed-url and analyses CRUD over the browser Supabase client.
import type { SupabaseClient } from "@supabase/supabase-js";
import { DAMAGE_TIERS, getTier } from "../tiers";
import { DAMAGE_CLASSES, getDamageClass } from "../damage-classes";
import type { Analysis, DamageDetection, DamageScores, Prediction, TierProbabilities } from "../types";
import { isSupabaseConfigured } from "./auth";
import { attachArtifactWithOperations } from "./artifactAttachment.mts";
import { getSupabaseBrowserClient } from "./client";
import type { Database, Json } from "./database.types";

export type QueryErrorCode =
  | "not_configured"
  | "not_authenticated"
  | "upload_failed"
  | "save_failed"
  | "load_failed"
  | "delete_failed"
  | "url_failed";

export type Result<T> =
  | { data: T; error: null }
  | { data: null; error: QueryErrorCode };

const BUCKET = "analysis-images";
// One hour: comfortably outlives any history-browsing session without leaving
// long-lived URLs to a private bucket floating around.
const SIGNED_URL_TTL_SECONDS = 3600;

type AnalysesRow = Database["public"]["Tables"]["analyses"]["Row"];

// Uploads the photo (+ optional heatmap) to storage, inserts the analyses row,
// and returns it as the shared Analysis type. No orphans: any failure removes
// whatever was already uploaded before reporting the error.
export async function saveAnalysis(input: {
  file: Blob;
  prediction: Prediction;
}): Promise<Result<Analysis>> {
  if (!isSupabaseConfigured()) {
    return { data: null, error: "not_configured" };
  }
  const supabase = getSupabaseBrowserClient();
  // WHY resolve the user here: spec section 3 forbids direct supabase calls
  // inside JSX components, so callers must not have to look up the user id.
  const { data: userData } = await supabase.auth.getUser();
  const userId = userData.user?.id;
  if (!userId) {
    return { data: null, error: "not_authenticated" };
  }

  const id = crypto.randomUUID();
  // WHY ".jpg" always: spec section 5 fixes the literal path convention
  // {user_id}/{analysis_id}.jpg even when the upload was PNG/WebP; the real
  // MIME type travels as contentType so signed-URL responses render correctly.
  const imagePath = `${userId}/${id}.jpg`;
  const uploaded: string[] = [];

  const { error: imageError } = await supabase.storage
    .from(BUCKET)
    .upload(imagePath, input.file, { contentType: input.file.type });
  if (imageError) {
    return { data: null, error: "upload_failed" };
  }
  uploaded.push(imagePath);

  const { data: row, error: insertError } = await supabase
    .from("analyses")
    .insert({
      id,
      user_id: userId,
      image_path: imagePath,
      heatmap_path: null,
      scale_version: "raed4",
      tier: null,
      confidence: input.prediction.confidence,
      probabilities: null,
      damage_percent: null,
      class_code: input.prediction.class_code,
      scores: input.prediction.scores,
      detections: input.prediction.detections as unknown as Json,
      model_id: input.prediction.model.id,
    })
    .select()
    .single();
  if (insertError || row === null) {
    await removeQuietly(supabase, uploaded);
    return { data: null, error: "save_failed" };
  }

  // Unreachable in practice (the DB check constraint enforces NC/PC/GC),
  // but mapping through toAnalysis keeps the narrowing in one place.
  const analysis = toAnalysis(row);
  if (analysis === null) {
    return { data: null, error: "save_failed" };
  }
  return { data: analysis, error: null };
}

// Lists the signed-in user's analyses, newest first. RLS already scopes the
// select to the owner, so no explicit user_id filter is needed.
export async function listAnalyses(): Promise<Result<Analysis[]>> {
  if (!isSupabaseConfigured()) {
    return { data: null, error: "not_configured" };
  }
  const supabase = getSupabaseBrowserClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) {
    return { data: null, error: "not_authenticated" };
  }

  const { data: rows, error } = await supabase
    .from("analyses")
    .select()
    .order("created_at", { ascending: false });
  if (error || rows === null) {
    return { data: null, error: "load_failed" };
  }
  // WHY filter instead of throw: one row with an impossible tier value (e.g.
  // after a manual DB edit) must not crash the whole history page; dropping
  // it defensively keeps every valid assessment visible.
  const analyses = rows
    .map((row) => toAnalysis(row))
    .filter((analysis): analysis is Analysis => analysis !== null);
  return { data: analyses, error: null };
}

// Deletes the analyses ROW first, then best-effort removes the stored objects.
// WHY this order: the row is the source of truth for history, so a failure
// must never leave a ghost row pointing at deleted files. The reverse cost —
// an orphaned file confined to the user's own RLS-scoped folder — is acceptable.
export async function deleteAnalysis(analysis: Analysis): Promise<Result<null>> {
  if (!isSupabaseConfigured()) {
    return { data: null, error: "not_configured" };
  }
  const supabase = getSupabaseBrowserClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) {
    return { data: null, error: "not_authenticated" };
  }

  const { error } = await supabase
    .from("analyses")
    .delete()
    .eq("id", analysis.id);
  if (error) {
    return { data: null, error: "delete_failed" };
  }

  const paths = [
    analysis.image_path,
    analysis.heatmap_path,
    analysis.repaired_path,
    analysis.model3d_path,
    analysis.model3d_before_path,
  ].filter((path): path is string => path !== null);
  await removeQuietly(supabase, paths);
  return { data: null, error: null };
}

// Short-lived signed URL for a private-bucket object (the bucket has no
// public access, so every render of a stored image goes through here).
export async function getSignedUrl(path: string): Promise<Result<string>> {
  if (!isSupabaseConfigured()) {
    return { data: null, error: "not_configured" };
  }
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(path, SIGNED_URL_TTL_SECONDS);
  if (error || !data) {
    return { data: null, error: "url_failed" };
  }
  return { data: data.signedUrl, error: null };
}

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

// Best-effort cleanup. Failures are swallowed on purpose: the caller is
// already returning the primary error, and a leftover object inside the
// user's own RLS-scoped folder is harmless next to a second confusing error.
async function removeQuietly(
  supabase: SupabaseClient<Database>,
  paths: string[],
): Promise<void> {
  try {
    await supabase.storage.from(BUCKET).remove(paths);
  } catch {
    // Intentionally ignored — see header comment.
  }
}

// Validates a DB row into the shared Analysis type, or null when the tier or
// probabilities are malformed (rows are validated rather than trusted, same as
// API responses).
function toAnalysis(row: AnalysesRow): Analysis | null {
  try {
    const base = {
      id: row.id,
      user_id: row.user_id,
      image_path: row.image_path,
      heatmap_path: row.heatmap_path,
      confidence: row.confidence,
      model_id: row.model_id,
      repaired_path: row.repaired_path,
      model3d_path: row.model3d_path,
      model3d_before_path: row.model3d_before_path,
      created_at: row.created_at,
    };
    if (row.scale_version === "phi3" && row.tier && row.damage_percent !== null) {
      return {
        ...base,
        scale_version: "phi3",
        tier: getTier(row.tier).code,
        probabilities: toTierProbabilities(row.probabilities),
        damage_percent: row.damage_percent,
      };
    }
    if (row.scale_version === "raed4" && row.class_code) {
      return {
        ...base,
        scale_version: "raed4",
        class_code: getDamageClass(row.class_code).code,
        scores: toDamageScores(row.scores),
        detections: toDetections(row.detections),
      };
    }
    return null;
  } catch {
    return null;
  }
}

function toDamageScores(value: unknown): DamageScores {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new TypeError("scores");
  const raw = value as Record<string, unknown>;
  const scores = {} as DamageScores;
  for (const { code } of DAMAGE_CLASSES) {
    if (typeof raw[code] !== "number") throw new TypeError(`scores.${code}`);
    scores[code] = raw[code];
  }
  return scores;
}

function toDetections(value: unknown): DamageDetection[] {
  if (!Array.isArray(value) || value.length === 0) throw new TypeError("detections");
  return value.map((item) => {
    if (typeof item !== "object" || item === null) throw new TypeError("detection");
    const raw = item as Record<string, unknown>;
    const box = raw.box as Record<string, unknown> | null;
    if (!box || typeof raw.class_code !== "string" || typeof raw.confidence !== "number") throw new TypeError("detection");
    for (const key of ["x1", "y1", "x2", "y2"] as const) if (typeof box[key] !== "number") throw new TypeError("box");
    return { class_code: getDamageClass(raw.class_code).code, confidence: raw.confidence, box: { x1: box.x1 as number, y1: box.y1 as number, x2: box.x2 as number, y2: box.y2 as number } };
  });
}

// Narrows an untyped jsonb column into TierProbabilities. Built by iterating
// the scale so a row missing a tier is rejected rather than silently defaulted.
function toTierProbabilities(value: unknown): TierProbabilities {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new TypeError("probabilities is not a tier-keyed object");
  }
  const entries = value as Record<string, unknown>;
  const probabilities = {} as TierProbabilities;
  for (const { code } of DAMAGE_TIERS) {
    const probability = entries[code];
    if (typeof probability !== "number" || !Number.isFinite(probability)) {
      throw new TypeError(`probabilities.${code} is missing or not a number`);
    }
    probabilities[code] = probability;
  }
  return probabilities;
}

// The mock API ships the heatmap as raw base64 (no data: prefix); storage
// wants bytes, so decode via atob into a typed PNG blob.
