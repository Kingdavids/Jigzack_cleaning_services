-- Run once in the Supabase SQL editor on the live project. Safe to run again.
-- Run supabase/owner-2026-09.sql first (it adds is_owner and the owner checks).
--
-- Deleting a customer now moves them to "Recently deleted" instead of erasing
-- them. Everything is kept for 30 days. During that time an owner can restore
-- them exactly as they were, or delete them for good. After 30 days the daily
-- job removes them for good.

-- 1. A new customer status, and a record of when and by whom.
alter table public.customers drop constraint if exists customers_status_check;
alter table public.customers
    add constraint customers_status_check check (status in ('active', 'inactive', 'deleted'));

alter table public.customers
    add column if not exists deleted_at timestamptz,
    add column if not exists deleted_by uuid references public.profiles (id) on delete set null,
    add column if not exists deleted_prev_status text;

-- 2. Only an owner can bring someone back from Recently deleted. Any admin can
--    still move a customer into it. The SQL editor and the service key have no
--    signed-in user, so they are not restricted.
create or replace function public.protect_deleted_customers()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
    if auth.uid() is null then
        return new;
    end if;

    if old.status = 'deleted' and new.status is distinct from 'deleted' and not public.is_owner() then
        raise exception 'Only an owner can restore a deleted customer.';
    end if;

    return new;
end;
$$;

drop trigger if exists protect_deleted_customers on public.customers;
create trigger protect_deleted_customers
    before update on public.customers
    for each row execute function public.protect_deleted_customers();

-- 3. The actual erasing, in one place. Nobody can call this directly; the two
--    functions below wrap it.
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

-- 4. "Delete forever" from Recently deleted: owners only, and only for
--    customers already in Recently deleted.
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

    -- login_kept is true when the person is also an employee or an admin, so only
    -- their customer record was erased.
    return jsonb_build_object('deleted', true, 'login_kept', v_role <> 'customer');
end;
$$;

revoke execute on function public.admin_delete_customer(uuid) from public, anon;
grant execute on function public.admin_delete_customer(uuid) to authenticated;

-- 5. The daily job removes anyone who has been in Recently deleted for 30 days.
--    It returns the photo file addresses so the job can remove the files too.
create or replace function public.purge_deleted_customers(p_days integer default 30)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_ids uuid[];
    v_urls text[];
    v_id uuid;
begin
    select coalesce(array_agg(profile_id), '{}') into v_ids
    from public.customers
    where status = 'deleted'
      and profile_id is not null
      and deleted_at is not null
      and deleted_at < now() - make_interval(days => p_days)
      and not exists (select 1 from public.units u where u.estate_profile_id = customers.profile_id);

    select coalesce(array_agg(image_url), '{}') into v_urls
    from public.uploads where customer_id = any (v_ids);

    foreach v_id in array v_ids loop
        perform public.delete_customer_data(v_id);
    end loop;

    return jsonb_build_object('purged', coalesce(array_length(v_ids, 1), 0), 'photo_urls', to_jsonb(v_urls));
end;
$$;

revoke execute on function public.purge_deleted_customers(integer) from public, anon, authenticated;
grant execute on function public.purge_deleted_customers(integer) to service_role;

select 'done' as result;
