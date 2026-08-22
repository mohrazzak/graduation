-- DamageScale Supabase schema: analyses table + RLS + storage policies.
-- HOW TO RUN: paste this whole file into the Supabase dashboard SQL editor
-- (SQL Editor -> New query -> Run). One-time setup per project.
--
-- This is the CURRENT schema (versioned legacy PHI-3 and active Raed-4). A fresh project needs only
-- this file — migrations/ applies only to a database still on the old
-- six-level shape.
--
-- BEFORE/AFTER RUNNING, also in the dashboard:
--   1. Storage -> create a PRIVATE bucket named exactly "analysis-images"
--      (the storage policies below assume it; frontend reads via signed URLs).
--   2. Auth -> Providers -> enable Email only; DISABLE email confirmation
--      so demo registration works instantly.

-- Analyses table
-- Damage scale: the three PHI-Net Task 5 collapse tiers.
--   NC = non-collapse (intact OR minor damage, structure stands)
--   PC = partial collapse
--   GC = global collapse
create table public.analyses (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users(id) on delete cascade,
  image_path     text not null,          -- storage path of uploaded photo
  heatmap_path   text,                   -- storage path of heatmap (nullable)
  scale_version  text not null default 'raed4' check (scale_version in ('phi3', 'raed4')),
  tier           text check (tier in ('NC', 'PC', 'GC')),
  confidence     real not null check (confidence between 0 and 1),
  probabilities  jsonb,
  damage_percent real check (damage_percent between 0 and 100),
  class_code     text check (class_code in ('ND', 'SMD', 'HVD', 'TD')),
  scores         jsonb,
  detections     jsonb,
  model_id       text not null,          -- which classifier produced the verdict
  repaired_path  text,                   -- restore pipeline output (nullable)
  model3d_path   text,                   -- 3D reconstruction output (nullable)
  model3d_before_path text,              -- original-photo 3D output (nullable)
  constraint analyses_version_payload_check check (
    (scale_version = 'phi3' and tier is not null and probabilities is not null and damage_percent is not null and class_code is null and scores is null and detections is null)
    or (scale_version = 'raed4' and tier is null and probabilities is null and damage_percent is null and class_code is not null and scores is not null and detections is not null)
  ),
  created_at     timestamptz not null default now()
);

alter table public.analyses enable row level security;

create policy "own rows select" on public.analyses
  for select using (auth.uid() = user_id);
create policy "own rows insert" on public.analyses
  for insert with check (auth.uid() = user_id);
create policy "own rows delete" on public.analyses
  for delete using (auth.uid() = user_id);
-- Update is needed because the restore pipeline attaches a 3D model (and later
-- a repaired image) to a row that already exists. WITH CHECK stops an owner
-- reassigning user_id on update.
create policy "own rows update" on public.analyses
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Storage: create PRIVATE bucket "analysis-images".
-- Files are stored at: {user_id}/{analysis_id}.jpg  and  {user_id}/{analysis_id}_heatmap.png
create policy "own files read"  on storage.objects for select
  using (bucket_id = 'analysis-images' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "own files write" on storage.objects for insert
  with check (bucket_id = 'analysis-images' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "own files delete" on storage.objects for delete
  using (bucket_id = 'analysis-images' and (storage.foldername(name))[1] = auth.uid()::text);
-- Update is required because re-running a restoration or reconstruction writes
-- the SAME deterministic path again; without it the replace fails with an RLS
-- error and the stored artifact silently stays at the previous result.
create policy "own files update" on storage.objects for update
  using (bucket_id = 'analysis-images' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'analysis-images' and (storage.foldername(name))[1] = auth.uid()::text);

-- Frontend reads images via createSignedUrl (bucket is private).
