-- Erasing a customer must never erase a staff login. Safe to run more than once.
-- Run it in the Supabase SQL editor.
--
-- If a person signed up as a customer and is also an employee or an admin (for
-- example a test account, or an owner who tried the customer side), deleting them
-- from Recently deleted, or the 30 day clean-up, used to fail with "Only customer
-- accounts can be deleted here", and could have removed their staff login. Now only
-- their customer record and customer data are erased, and the login is kept.

create or replace function public.delete_customer_data(p_profile_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
    v_role text;
begin
    select role into v_role from public.profiles where id = p_profile_id;

    -- Everything they had as a customer.
    delete from public.uploads where customer_id = p_profile_id;
    delete from public.tasks where customer_id = p_profile_id;
    delete from public.payments where customer_id = p_profile_id;
    delete from public.customers where profile_id = p_profile_id;

    -- Their login is only removed when they are just a customer. A person who is
    -- also an employee or an admin (they signed up as a customer first, or
    -- tried the customer side) keeps their login and their messages, so erasing
    -- the customer record can never remove a staff account.
    if v_role is null or v_role = 'customer' then
        delete from public.messages where from_profile_id = p_profile_id or to_profile_id = p_profile_id;

        -- Removing the login also removes the profile row and frees the email address.
        delete from auth.users where id = p_profile_id;
    end if;
end;
$$;

revoke execute on function public.delete_customer_data(uuid) from public, anon, authenticated;

create or replace function public.admin_delete_customer(p_profile_id uuid)
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
        raise exception 'Only an owner can delete a customer';
    end if;

    select p.role, c.status into v_role, v_status
    from public.profiles p
    left join public.customers c on c.profile_id = p.id
    where p.id = p_profile_id;

    if v_role is null then
        raise exception 'Customer not found';
    end if;

    if v_status is distinct from 'deleted' then
        raise exception 'Move this customer to Recently deleted first';
    end if;

    if exists (select 1 from public.units where estate_profile_id = p_profile_id) then
        raise exception 'This estate still has units. Remove or move them first.';
    end if;

    perform public.delete_customer_data(p_profile_id);

    return jsonb_build_object('deleted', true, 'login_kept', v_role <> 'customer');
end;
$$;

revoke execute on function public.admin_delete_customer(uuid) from public, anon;
grant execute on function public.admin_delete_customer(uuid) to authenticated;

select 'done' as result;
