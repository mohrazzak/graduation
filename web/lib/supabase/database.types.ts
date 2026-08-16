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
  // 'NC' | 'PC' | 'GC', enforced by a check constraint. Typed as string here
  // and narrowed in queries.ts, so a hand-edited row is rejected rather than
  // trusted into the domain type.
  tier: string;
  confidence: number;
  // jsonb: a tier-keyed object {"NC":f,"PC":f,"GC":f}. Untyped on purpose —
  // queries.ts validates it.
  probabilities: Json;
  damage_percent: number;
  model_id: string;
  repaired_path: string | null;
  model3d_path: string | null;
  created_at: string;
};

type AnalysesInsert = {
  id?: string;
  user_id: string;
  image_path: string;
  heatmap_path?: string | null;
  tier: string;
  confidence: number;
  probabilities: Json;
  damage_percent: number;
  model_id: string;
  repaired_path?: string | null;
  model3d_path?: string | null;
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
