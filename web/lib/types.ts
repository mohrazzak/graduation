// Shared data contracts: what the FastAPI /predict endpoint returns
// (Prediction) and what an analyses row in Supabase looks like (Analysis).
import type { TierCode } from "./tiers";

export interface ModelInfo {
  id: string;
  name: string;
  accuracy: number | null; // 0..1, null when the model reports none
  available: boolean;
  // Message key, not prose: weights_missing | dependency_missing | load_failed
  reason: string | null;
}

export type TierProbabilities = Record<TierCode, number>;

export interface Prediction {
  tier: TierCode;
  confidence: number; // 0..1
  probabilities: TierProbabilities; // sums ~1
  damage_percent: number; // 0..100, a weighted expectation — not a measurement
  model: ModelInfo;
  heatmap_base64: string | null; // PNG bytes base64, no data: prefix
}

export interface Analysis {
  id: string;
  user_id: string;
  image_path: string;
  heatmap_path: string | null;
  tier: TierCode;
  confidence: number;
  probabilities: TierProbabilities;
  damage_percent: number;
  model_id: string;
  /** Storage path of the restored image, once one has been generated. */
  repaired_path: string | null;
  /** Storage path of the generated 3D model, once the user kept one. */
  model3d_path: string | null;
  created_at: string; // ISO timestamp
}
