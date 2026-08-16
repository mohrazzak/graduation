-- DamageScale Supabase schema: analyses table + RLS + storage policies.
-- HOW TO RUN: paste this whole file into the Supabase dashboard SQL editor
-- (SQL Editor -> New query -> Run). One-time setup per project.
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
  tier           text not null check (tier in ('NC', 'PC', 'GC')),
  confidence     real not null check (confidence between 0 and 1),
  probabilities  jsonb not null,         -- {"NC":f,"PC":f,"GC":f}, sums ~1
  damage_percent real not null check (damage_percent between 0 and 100),
  model_id       text not null,          -- which classifier produced the verdict
  repaired_path  text,                   -- restore pipeline output (nullable)
  model3d_path   text,                   -- 3D reconstruction output (nullable)
  created_at     timestamptz not null default now()
);

alter table public.analyses enable row level security;

create policy "own rows select" on public.analyses
  for select using (auth.uid() = user_id);
create policy "own rows insert" on public.analyses
  for insert with check (auth.uid() = user_id);
create policy "own rows delete" on public.analyses
  for delete using (auth.uid() = user_id);

-- Storage: create PRIVATE bucket "analysis-images".
-- Files are stored at: {user_id}/{analysis_id}.jpg  and  {user_id}/{analysis_id}_heatmap.png
create policy "own files read"  on storage.objects for select
  using (bucket_id = 'analysis-images' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "own files write" on storage.objects for insert
  with check (bucket_id = 'analysis-images' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "own files delete" on storage.objects for delete
  using (bucket_id = 'analysis-images' and (storage.foldername(name))[1] = auth.uid()::text);

-- Frontend reads images via createSignedUrl (bucket is private).
