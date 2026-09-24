-- Run once in the Supabase SQL editor on the live project. Safe to run again.
-- Run supabase/owner-2026-09.sql first (it adds is_owner).
--
-- Lets an owner delete an employee for good: their login, their profile and
-- their setup details are removed, which also frees their email address.
--
-- What happens to their records:
--   * expenses they logged are deleted with them
--   * messages they sent or received are deleted
--   * jobs and photos stay (so customers keep their service history), but are
--     no longer linked to a person

create or replace function public.admin_delete_employee(p_profile_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_role text;
begin
    if not public.is_owner() then
        raise exception 'Only an owner can delete an employee';
    end if;

    select role into v_role from public.profiles where id = p_profile_id;

    if v_role is null then
        raise exception 'Employee not found';
    end if;

    if v_role <> 'employee' then
        raise exception 'Only employee accounts can be deleted here';
    end if;

    delete from public.messages where from_profile_id = p_profile_id or to_profile_id = p_profile_id;
    delete from public.expenses where employee_id = p_profile_id;
    delete from public.employees where profile_id = p_profile_id;

    -- Removing the login also removes the profile row and frees the email address.
    -- Jobs and photos are kept: their employee link is simply cleared.
    delete from auth.users where id = p_profile_id;

    return jsonb_build_object('deleted', true);
end;
$$;

revoke execute on function public.admin_delete_employee(uuid) from public, anon;
grant execute on function public.admin_delete_employee(uuid) to authenticated;

select 'done' as result;
