// Turns an untyped `analyses` row into the shared Analysis type — or rejects it.
//
// A database row is not more trustworthy than an API response: `scores` and
// `detections` are jsonb, so their shape is whatever was written, not whatever
// the type says. Every field is checked and a malformed row becomes null rather
// than a half-populated object that fails later, further from the cause.
//
// Kept apart from queries.ts because none of this touches Supabase: it is pure,
// synchronous, and testable without a client or a network.
import { DAMAGE_CLASSES, getDamageClass } from "../damage-classes";
import type { Analysis, DamageDetection, DamageScores } from "../types";
import type { Database } from "./database.types";

type AnalysesRow = Database["public"]["Tables"]["analyses"]["Row"];

/** Validates a DB row into `Analysis`, or null when any field is malformed. */
export function toAnalysis(row: AnalysesRow): Analysis | null {
  try {
    if (row.scale_version !== "raed4" || !row.class_code) return null;
    return {
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
      scale_version: "raed4",
      class_code: getDamageClass(row.class_code).code,
      scores: toDamageScores(row.scores),
      detections: toDetections(row.detections),
    };
  } catch {
    return null;
  }
}

// Built by iterating the scale, so a row missing a class is rejected rather
// than silently defaulted to zero — a missing score is not a score of nothing.
function toDamageScores(value: unknown): DamageScores {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new TypeError("scores is not a class-keyed object");
  }
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
    if (!box || typeof raw.class_code !== "string" || typeof raw.confidence !== "number") {
      throw new TypeError("detection");
    }
    for (const key of ["x1", "y1", "x2", "y2"] as const) {
      if (typeof box[key] !== "number") throw new TypeError("box");
    }
    return {
      class_code: getDamageClass(raw.class_code).code,
      confidence: raw.confidence,
      box: {
        x1: box.x1 as number,
        y1: box.y1 as number,
        x2: box.x2 as number,
        y2: box.y2 as number,
      },
    };
  });
}
