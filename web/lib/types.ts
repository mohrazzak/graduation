// Shared data contracts: what the FastAPI /predict endpoint returns
// (Prediction) and what an analyses row in Supabase looks like (Analysis).
import type { DamageLevelId } from "./levels";

export interface Prediction {
  level: DamageLevelId;
  confidence: number; // 0..1
  probabilities: number[]; // length 6, sums ~1
  heatmap_base64: string | null; // PNG bytes base64, no data: prefix
}

export interface Analysis {
  id: string;
  user_id: string;
  image_path: string;
  heatmap_path: string | null;
  level: DamageLevelId;
  confidence: number;
  probabilities: number[];
  created_at: string; // ISO timestamp
}
