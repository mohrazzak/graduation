// Shared data contracts: what the FastAPI /predict endpoint returns
// (Prediction) and what an analyses row in Supabase looks like (Analysis).
import type { TierCode } from "./tiers";
import type { DamageCode } from "./damage-classes";

export interface ModelInfo {
  id: string;
  name: string;
  accuracy: number | null; // 0..1, null when the model reports none
  available: boolean;
  // Message key, not prose: weights_missing | dependency_missing | load_failed
  reason: string | null;
}

export type TierProbabilities = Record<TierCode, number>;

export type DamageScores = Record<DamageCode, number>;

export interface DetectionBox {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface DamageDetection {
  class_code: DamageCode;
  confidence: number; // 0..1
  box: DetectionBox;
}

export interface Prediction {
  class_code: DamageCode;
  confidence: number;
  scores: DamageScores; // maximum detector confidence per class; not probabilities
  detections: DamageDetection[];
  model: ModelInfo;
}

interface AnalysisBase {
  id: string;
  user_id: string;
  image_path: string;
  heatmap_path: string | null;
  confidence: number;
  model_id: string;
  /** Storage path of the restored image, once one has been generated. */
  repaired_path: string | null;
  /** Storage path of the generated 3D model, once the user kept one. */
  model3d_path: string | null;
  model3d_before_path: string | null;
  created_at: string; // ISO timestamp
}

export interface LegacyAnalysis extends AnalysisBase {
  scale_version: "phi3";
  tier: TierCode;
  probabilities: TierProbabilities;
  damage_percent: number;
}

export interface RaedAnalysis extends AnalysisBase {
  scale_version: "raed4";
  class_code: DamageCode;
  scores: DamageScores;
  detections: DamageDetection[];
}

export type Analysis = LegacyAnalysis | RaedAnalysis;
