-- Allow an owner to REPLACE their own stored object.
--
-- The bucket had select/insert/delete only, which is enough while every object
-- is written once. The restore pipeline breaks that assumption: re-running a
-- restoration or reconstruction for the same analysis writes the SAME
-- deterministic path again, so the upload is an update, not an insert.
--
-- Without this, Supabase rejects the second write with
--   403 "new row violates row-level security policy"
-- and the stored artifact silently stays at the previous result. Verified
-- against the live project before adding this.
--
-- Idempotent so it is safe to reapply to a project that already has it.
drop policy if exists "own files update" on storage.objects;
create policy "own files update" on storage.objects
  for update
  using (
    bucket_id = 'analysis-images'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'analysis-images'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
