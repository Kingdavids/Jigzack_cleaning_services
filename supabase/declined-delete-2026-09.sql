-- Lets an owner delete a declined signup for good: the login, the profile and
-- anything they filled in are removed, which also frees their email address so
-- they can sign up again. Safe to run more than once.
-- Run it in the Supabase SQL editor. Run owner-2026-09.sql first (it adds is_owner).

create or replace function public.admin_delete_declined_signup(p_profile_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_role text;
    v_status text;
begin
    if not public.is_owner() then
        raise exception 'Only an owner can delete a declined signup';
    end if;

    select role, status into v_role, v_status from public.profiles where id = p_profile_id;

    if v_role is null then
        raise exception 'Signup not found';
    end if;

    if v_status <> 'declined' then
        raise exception 'Only a declined signup can be deleted here';
    end if;

    if v_role not in ('customer', 'employee') then
        raise exception 'Only customer and employee signups can be deleted here';
    end if;

    delete from public.messages where from_profile_id = p_profile_id or to_profile_id = p_profile_id;

    if v_role = 'customer' then
        delete from public.uploads where customer_id = p_profile_id;
        delete from public.tasks where customer_id = p_profile_id;
        delete from public.payments where customer_id = p_profile_id;
        delete from public.customers where profile_id = p_profile_id;
    else
        if to_regclass('public.expenses') is not null then
            execute 'delete from public.expenses where employee_id = $1' using p_profile_id;
        end if;

        delete from public.employees where profile_id = p_profile_id;
    end if;

    -- Removing the login also removes the profile row and frees the email address.
    delete from auth.users where id = p_profile_id;

    return jsonb_build_object('deleted', true);
end;
$$;

revoke execute on function public.admin_delete_declined_signup(uuid) from public, anon;
grant execute on function public.admin_delete_declined_signup(uuid) to authenticated;

select 'done' as result;
