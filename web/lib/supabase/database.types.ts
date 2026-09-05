// Minimal Database type for the Supabase client generics (supabase/schema.sql).
// Hand-written because we do not run `supabase gen types` codegen in this
// project — the schema is a single table, so we keep only what the app uses.

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

// Type literals (not interfaces) on purpose: postgrest-js constrains tables to
// Record<string, unknown>, which interfaces fail without an index signature.
type AnalysesRow = {
  id: string;
  user_id: string;
  image_path: string;
  heatmap_path: string | null;
  scale_version: string;
  // RETIRED phi3 column, null on every raed4 row: 'NC' | 'PC' | 'GC', enforced
  // by a check constraint. Kept so old rows still read back.
  tier: string | null;
  confidence: number;
  // RETIRED phi3 column: a tier-keyed object {"NC":f,"PC":f,"GC":f}. The active
  // scale writes `scores` instead. Untyped on purpose — queries.ts validates it.
  probabilities: Json | null;
  damage_percent: number | null;
  class_code: string | null;
  scores: Json | null;
  detections: Json | null;
  model_id: string;
  repaired_path: string | null;
  model3d_path: string | null;
  model3d_before_path: string | null;
  created_at: string;
};

type AnalysesInsert = {
  id?: string;
  user_id: string;
  image_path: string;
  heatmap_path?: string | null;
  scale_version: string;
  tier?: string | null;
  confidence: number;
  probabilities?: Json | null;
  damage_percent?: number | null;
  class_code?: string | null;
  scores?: Json | null;
  detections?: Json | null;
  model_id: string;
  repaired_path?: string | null;
  model3d_path?: string | null;
  model3d_before_path?: string | null;
  created_at?: string;
};

export type Database = {
  public: {
    Tables: {
      analyses: {
        Row: AnalysesRow;
        Insert: AnalysesInsert;
        // Rows are immutable in this app (insert/delete only), but the shape
        // is required by the client's GenericTable constraint.
        Update: Partial<AnalysesInsert>;
        Relationships: [];
      };
    };
    Views: { [_ in never]: never };
    Functions: { [_ in never]: never };
    Enums: { [_ in never]: never };
    CompositeTypes: { [_ in never]: never };
  };
};
