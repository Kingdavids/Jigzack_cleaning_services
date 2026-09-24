-- Run once in the Supabase SQL editor on the live project. Safe to run again.
-- Run supabase/owner-2026-09.sql first (it adds is_owner).
--
-- Lets an owner clear the activity log, all of it or only older entries.
-- Nobody else can delete or edit entries. Clearing is itself recorded as a
-- new entry, so it is never invisible.

drop policy if exists "activity_log_delete_owner" on public.activity_log;
create policy "activity_log_delete_owner" on public.activity_log
    for delete to authenticated using (public.is_owner());

select 'done' as result;
