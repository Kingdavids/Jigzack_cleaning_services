-- Run once in the Supabase SQL editor on the live project. Safe to run again.
-- Lets a full admin permanently delete a customer account and everything tied
-- to it, and delete task photo files from storage.

create or replace function public.admin_delete_customer(p_profile_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_role text;
begin
    if not public.is_admin() then
        raise exception 'Not allowed';
    end if;

    select role into v_role from public.profiles where id = p_profile_id;

    if v_role is null then
        raise exception 'Customer not found';
    end if;

    if v_role <> 'customer' then
        raise exception 'Only customer accounts can be deleted here';
    end if;

    if exists (select 1 from public.units where estate_profile_id = p_profile_id) then
        raise exception 'This estate still has units. Remove or move them first.';
    end if;

    delete from public.messages where from_profile_id = p_profile_id or to_profile_id = p_profile_id;
    delete from public.uploads where customer_id = p_profile_id;
    delete from public.tasks where customer_id = p_profile_id;
    delete from public.payments where customer_id = p_profile_id;
    delete from public.customers where profile_id = p_profile_id;

    -- Removing the login also removes the profile row.
    delete from auth.users where id = p_profile_id;

    return jsonb_build_object('deleted', true);
end;
$$;

revoke execute on function public.admin_delete_customer(uuid) from public, anon;
grant execute on function public.admin_delete_customer(uuid) to authenticated;

-- Admins can remove photo files (staff could already remove their own).
drop policy if exists "task_photos_admin_delete" on storage.objects;
create policy "task_photos_admin_delete" on storage.objects
    for delete to authenticated using (bucket_id = 'task-photos' and public.is_admin());

select 'done' as result;
