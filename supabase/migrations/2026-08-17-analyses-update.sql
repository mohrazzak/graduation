-- Allow an owner to UPDATE their own analysis row.
--
-- The original policy set covered select/insert/delete only, because rows were
-- write-once. The restore pipeline changes that: a 3D model (and later a
-- repaired image) is produced AFTER the row exists and is attached to it, so
-- the owner needs update rights. Without this, RLS silently rejects the write.
--
-- WITH CHECK as well as USING: USING decides which rows may be targeted,
-- WITH CHECK decides what they may become — without it an owner could reassign
-- user_id and hand their row to someone else.
create policy "own rows update" on public.analyses
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
