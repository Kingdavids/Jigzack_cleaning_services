-- Attachments on messages: a photo or PDF can be sent with a message or reply.
-- Safe to run more than once. Run it in the Supabase SQL editor.

-- ---------------------------------------------------------------
-- 1. Where the file is recorded on the message
-- ---------------------------------------------------------------
alter table public.messages
    add column if not exists attachment_path text,
    add column if not exists attachment_name text;

-- ---------------------------------------------------------------
-- 2. Private bucket. Files are named <sender id>/<random id>.<ext>
-- ---------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
    'message-attachments', 'message-attachments', false, 10485760,
    array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'application/pdf']
)
on conflict (id) do update
    set public = false,
        file_size_limit = excluded.file_size_limit,
        allowed_mime_types = excluded.allowed_mime_types;

-- Anyone signed in and approved can upload into their own folder.
drop policy if exists "message_attachments_upload" on storage.objects;
create policy "message_attachments_upload" on storage.objects
    for insert to authenticated with check (
        bucket_id = 'message-attachments'
        and (storage.foldername(name)) [1] = auth.uid()::text
        and exists (
            select 1 from public.profiles p
            where p.id = auth.uid() and p.status = 'approved'
        )
    );

-- The sender, the person a message was sent to, and admins (who can already
-- read every message) can open a file.
drop policy if exists "message_attachments_read" on storage.objects;
create policy "message_attachments_read" on storage.objects
    for select to authenticated using (
        bucket_id = 'message-attachments'
        and (
            (storage.foldername(name)) [1] = auth.uid()::text
            or public.is_staff_reader()
            or exists (
                select 1 from public.messages m
                where m.attachment_path = storage.objects.name
                  and m.to_profile_id = auth.uid()
            )
        )
    );

-- The sender can remove their own files. Admins can too, which lets an owner
-- clear out messages together with their files.
drop policy if exists "message_attachments_delete" on storage.objects;
create policy "message_attachments_delete" on storage.objects
    for delete to authenticated using (
        bucket_id = 'message-attachments'
        and ((storage.foldername(name)) [1] = auth.uid()::text or public.is_admin())
    );
