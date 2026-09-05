-- Six levels -> three PHI-Net collapse tiers (NC / PC / GC).
--
-- ⚠ ONLY needed for a database that already has the OLD six-level table.
-- Provisioning a NEW Supabase project? Run ../schema.sql instead — it already
-- creates the current four-class shape (scale_version 'raed4'), and this file
-- will fail against it (there is no `level` column to drop).
--
-- Existing rows hold mock verdicts on a scale that no longer exists. Mapping
-- them onto tiers would fabricate assessments no model ever produced, so they
-- are deleted rather than migrated.
--
-- ORDER MATTERS: the NOT NULL columns below cannot be added to a non-empty
-- table, so the wipe has to come first.
--
-- Stored objects are NOT cleared here. storage.objects rows cannot be deleted
-- via SQL (a protect trigger blocks it) — remove them through the Storage API
-- or the dashboard. Left behind, they are orphaned files inside each user's own
-- RLS-scoped folder, which is harmless but worth clearing before a demo.

begin;

delete from public.analyses;

alter table public.analyses drop column level;

alter table public.analyses
  add column tier text not null check (tier in ('NC', 'PC', 'GC'));

-- Weighted expectation over the class probabilities, 0-100. Stored rather than
-- recomputed so a row always shows the figure the user was actually given.
alter table public.analyses
  add column damage_percent real not null check (damage_percent between 0 and 100);

-- Which classifier produced the verdict. Every saved assessment must be
-- attributable to a model, since the roster offers several.
alter table public.analyses add column model_id text not null;

-- Reserved for the restore pipeline (phase 2/3): the repaired image and the
-- generated 3D model. Nullable — most analyses will never have either.
alter table public.analyses add column repaired_path text;
alter table public.analyses add column model3d_path text;

commit;

-- probabilities (jsonb) changes shape from a 6-float array to a tier-keyed
-- object {"NC":f,"PC":f,"GC":f}. No DDL needed; the wipe above clears the old
-- shape and lib/supabase/queries.ts validates the new one on read.
