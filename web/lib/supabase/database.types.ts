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
  level: number;
  confidence: number;
  // jsonb in Postgres, but this app only ever stores the 6-float vector.
  probabilities: number[];
  created_at: string;
};

type AnalysesInsert = {
  id?: string;
  user_id: string;
  image_path: string;
  heatmap_path?: string | null;
  level: number;
  confidence: number;
  probabilities: number[];
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
