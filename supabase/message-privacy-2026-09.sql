-- Who can read which conversations. Safe to run more than once.
-- Run it in the Supabase SQL editor.
--
--   Customers and employees: only their own messages (unchanged).
--   Admins and supervisors:  their own messages, plus conversations between
--                            customers and employees. NOT the conversations other
--                            admins have with customers or staff.
--   Owners:                  every conversation in the app.
--
-- Until now any admin could read every message through the database, even
-- though the screens only showed some of them. This closes that at the source.

-- Does a message involve an admin on either side? Runs with elevated rights so
-- the check does not depend on who is asking.
create or replace function public.message_involves_admin(p_from uuid, p_to uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
    select exists (
        select 1 from public.profiles
        where id in (p_from, p_to) and role = 'admin'
    );
$$;

revoke execute on function public.message_involves_admin(uuid, uuid) from public, anon;
grant execute on function public.message_involves_admin(uuid, uuid) to authenticated;

-- Replace the two "admins can read everything" policies.
drop policy if exists "messages_select_admin" on public.messages;
drop policy if exists "messages_select_reader" on public.messages;
drop policy if exists "messages_select_staff_view" on public.messages;

create policy "messages_select_staff_view" on public.messages
    for select to authenticated using (
        public.is_owner()
        or (
            public.is_staff_reader()
            and not public.message_involves_admin(from_profile_id, to_profile_id)
        )
    );

-- Message attachments follow the same rule: a file can be opened by whoever can
-- read the message it belongs to (and by the person who uploaded it), so an admin
-- cannot open a file from a conversation they are not allowed to read.
do $$
begin
    if exists (
        select 1 from information_schema.columns
        where table_schema = 'public' and table_name = 'messages' and column_name = 'attachment_path'
    ) then
        drop policy if exists "message_attachments_read" on storage.objects;

        create policy "message_attachments_read" on storage.objects
            for select to authenticated using (
                bucket_id = 'message-attachments'
                and (
                    (storage.foldername(name)) [1] = auth.uid()::text
                    or exists (
                        select 1 from public.messages m
                        where m.attachment_path = storage.objects.name
                    )
                )
            );
    end if;
end
$$;

select 'done' as result;
