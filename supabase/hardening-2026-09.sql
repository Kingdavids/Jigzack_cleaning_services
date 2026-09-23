-- Run once in the Supabase SQL editor on the live project.
-- Mirrors the "Function access" and "storage: task-photos" sections of schema.sql.
-- Safe to run more than once.

-- 1. Logged-out visitors (the public anon key) could call these and read the
--    admins' email addresses. Only signed-in users need them.
revoke execute on function public.approved_admin_emails() from public, anon;
revoke execute on function public.approved_admin_ids() from public, anon;
revoke execute on function public.mark_registration_fee_paid(text) from public, anon;
revoke execute on function public.handle_new_user() from public, anon, authenticated;
grant execute on function public.approved_admin_emails() to authenticated;
grant execute on function public.approved_admin_ids() to authenticated;
grant execute on function public.mark_registration_fee_paid(text) to authenticated;

-- 2. Photo bucket: images only, 15MB max.
update storage.buckets
set file_size_limit = 15728640,
    allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']
where id = 'task-photos';

-- 3. Only signed-in users can list photo files (public image URLs keep working).
drop policy if exists "task_photos_public_read" on storage.objects;
create policy "task_photos_public_read" on storage.objects
    for select to authenticated using (bucket_id = 'task-photos');

-- 4. Only approved staff can add photos, and only into their own folder.
drop policy if exists "task_photos_employee_upload" on storage.objects;
create policy "task_photos_employee_upload" on storage.objects
    for insert to authenticated with check (
        bucket_id = 'task-photos'
        and (storage.foldername(name)) [1] = auth.uid()::text
        and exists (
            select 1 from public.profiles p
            where p.id = auth.uid() and p.role in ('employee', 'admin') and p.status = 'approved'
        )
    );

select 'done' as result;
