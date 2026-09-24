-- Run once in the Supabase SQL editor on the live project. Safe to run again.
-- Run supabase/admins-activity-2026-09.sql first (it adds the read_only column).
--
-- Adds an "owner" level above full admins. Only an owner can permanently delete
-- a customer, delete invoices, invite or change admins, and make other owners.
-- Other full admins keep everything else: approvals, edits, suspending,
-- confirming payments, messages and so on.

alter table public.profiles add column if not exists is_owner boolean not null default false;

-- First run only: every full admin you have today becomes an owner, so nobody
-- is locked out. Later you can remove the owner level from anyone on the Admins page.
update public.profiles
set is_owner = true
where role = 'admin' and status = 'approved' and not read_only
  and not exists (select 1 from public.profiles where is_owner);

create or replace function public.is_owner()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
    select exists (
        select 1 from public.profiles
        where id = auth.uid() and role = 'admin' and status = 'approved' and not read_only and is_owner
    );
$$;

-- People signed in through the app cannot change anyone's role, view-only flag,
-- owner flag, or an admin's active status unless they are an owner. The SQL
-- editor and the service key have no signed-in user, so they are not restricted.
create or replace function public.protect_admin_fields()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
    if auth.uid() is null then
        return new;
    end if;

    if (
        new.role is distinct from old.role
        or new.read_only is distinct from old.read_only
        or new.is_owner is distinct from old.is_owner
        or (old.role = 'admin' and new.status is distinct from old.status)
    ) and not public.is_owner() then
        raise exception 'Only an owner can change admin access.';
    end if;

    return new;
end;
$$;

drop trigger if exists protect_admin_fields on public.profiles;
create trigger protect_admin_fields
    before update on public.profiles
    for each row execute function public.protect_admin_fields();

-- Permanent customer deletion is owner only.
create or replace function public.admin_delete_customer(p_profile_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_role text;
begin
    if not public.is_owner() then
        raise exception 'Only an owner can delete a customer';
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

-- Deleting customer and invoice rows directly is owner only too. Admins keep
-- read, add and edit.
drop policy if exists "customers_all_admin" on public.customers;
drop policy if exists "customers_select_admin" on public.customers;
drop policy if exists "customers_insert_admin" on public.customers;
drop policy if exists "customers_update_admin" on public.customers;
drop policy if exists "customers_delete_owner" on public.customers;
create policy "customers_select_admin" on public.customers for select using (public.is_admin());
create policy "customers_insert_admin" on public.customers for insert with check (public.is_admin());
create policy "customers_update_admin" on public.customers for update using (public.is_admin()) with check (public.is_admin());
create policy "customers_delete_owner" on public.customers for delete using (public.is_owner());

drop policy if exists "payments_all_admin" on public.payments;
drop policy if exists "payments_select_admin" on public.payments;
drop policy if exists "payments_insert_admin" on public.payments;
drop policy if exists "payments_update_admin" on public.payments;
drop policy if exists "payments_delete_owner" on public.payments;
create policy "payments_select_admin" on public.payments for select using (public.is_admin());
create policy "payments_insert_admin" on public.payments for insert with check (public.is_admin());
create policy "payments_update_admin" on public.payments for update using (public.is_admin()) with check (public.is_admin());
create policy "payments_delete_owner" on public.payments for delete using (public.is_owner());

select 'done' as result;
