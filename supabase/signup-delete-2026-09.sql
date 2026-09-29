-- Lets a full admin (not just the owner) delete a signup that has no customer
-- record yet, i.e. someone who created a login but never finished their
-- property form. There is nothing billed or scheduled on an account like
-- this, so it is safe for any admin to remove: it deletes the login for good,
-- which frees their email address so they can sign up again. This is
-- separate from deleting a declined signup (owner only, in
-- declined-delete-2026-09.sql), and refuses if a customer record already
-- exists, so it can never be used to bypass that owner-only protection.
-- Safe to run more than once. Run it in the Supabase SQL editor.

create or replace function public.admin_delete_signup_with_no_details(p_profile_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_role text;
    v_status text;
begin
    if not public.is_admin() then
        raise exception 'Only an admin can delete a signup';
    end if;

    select role, status into v_role, v_status from public.profiles where id = p_profile_id;

    if v_role is null then
        raise exception 'Signup not found';
    end if;

    if v_role <> 'customer' then
        raise exception 'Only customer signups can be deleted here';
    end if;

    if v_status = 'declined' then
        raise exception 'Delete a declined signup from Signup approvals instead';
    end if;

    if exists (select 1 from public.customers where profile_id = p_profile_id) then
        raise exception 'This person already has a customer record; delete them from their customer page instead';
    end if;

    delete from public.messages where from_profile_id = p_profile_id or to_profile_id = p_profile_id;

    -- Removing the login also removes the profile row and frees the email address.
    delete from auth.users where id = p_profile_id;

    return jsonb_build_object('deleted', true);
end;
$$;

revoke execute on function public.admin_delete_signup_with_no_details(uuid) from public, anon;
grant execute on function public.admin_delete_signup_with_no_details(uuid) to authenticated;

select 'done' as result;
