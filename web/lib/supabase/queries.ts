// The ONLY data-access layer for analyses + their stored images: storage
// upload/remove/signed-url and analyses CRUD over the browser Supabase client.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Analysis, Prediction } from "../types";
import { toAnalysis } from "./analysisRow";
import { isSupabaseConfigured } from "./auth";
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

export const BUCKET = "analysis-images";
// One hour: comfortably outlives any history-browsing session without leaving
// long-lived URLs to a private bucket floating around.
const SIGNED_URL_TTL_SECONDS = 3600;


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

  // Unreachable in practice (the DB check constraint enforces ND/SMD/HVD/TD),
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

// The mock API ships the heatmap as raw base64 (no data: prefix); storage
// wants bytes, so decode via atob into a typed PNG blob.

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
