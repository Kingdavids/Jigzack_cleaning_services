-- Run once in the Supabase SQL editor on the live project. Safe to run again.
-- Adds: admin and supervisor invites, view-only admins, and the activity log.
--
-- A "supervisor" is an admin account with read_only = true. It can see
-- everything an admin can see and change nothing.

-- ---------------------------------------------------------------
-- 1. View-only flag
-- ---------------------------------------------------------------
alter table public.profiles add column if not exists read_only boolean not null default false;

-- Full admins only: these gate every write policy and every admin-only action.
create or replace function public.is_admin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
    select exists (
        select 1 from public.profiles
        where id = auth.uid() and role = 'admin' and status = 'approved' and not read_only
    );
$$;

-- Any approved admin, including view-only ones: gates reading.
create or replace function public.is_staff_reader()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
    select exists (
        select 1 from public.profiles
        where id = auth.uid() and role = 'admin' and status = 'approved'
    );
$$;

-- Messages, emails and alerts addressed to "the admins" reach full admins only.
create or replace function public.is_approved_admin(target_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
    select exists (
        select 1 from public.profiles
        where id = target_id and role = 'admin' and status = 'approved' and not read_only
    );
$$;

create or replace function public.approved_admin_emails()
returns text[]
language sql
security definer
set search_path = public
stable
as $$
    select coalesce(array_agg(email), '{}') from public.profiles
    where role = 'admin' and status = 'approved' and not read_only and email is not null;
$$;

create or replace function public.approved_admin_ids()
returns uuid[]
language sql
security definer
set search_path = public
stable
as $$
    select coalesce(array_agg(id), '{}') from public.profiles
    where role = 'admin' and status = 'approved' and not read_only;
$$;

revoke execute on function public.approved_admin_emails() from public, anon;
revoke execute on function public.approved_admin_ids() from public, anon;
grant execute on function public.approved_admin_emails() to authenticated;
grant execute on function public.approved_admin_ids() to authenticated;

-- ---------------------------------------------------------------
-- 2. Read access for view-only admins (they no longer match the admin write policies)
-- ---------------------------------------------------------------
drop policy if exists "profiles_select_reader" on public.profiles;
create policy "profiles_select_reader" on public.profiles for select using (public.is_staff_reader());

drop policy if exists "customers_select_reader" on public.customers;
create policy "customers_select_reader" on public.customers for select using (public.is_staff_reader());

drop policy if exists "units_select_reader" on public.units;
create policy "units_select_reader" on public.units for select using (public.is_staff_reader());

drop policy if exists "employees_select_reader" on public.employees;
create policy "employees_select_reader" on public.employees for select using (public.is_staff_reader());

drop policy if exists "tasks_select_reader" on public.tasks;
create policy "tasks_select_reader" on public.tasks for select using (public.is_staff_reader());

drop policy if exists "uploads_select_reader" on public.uploads;
create policy "uploads_select_reader" on public.uploads for select using (public.is_staff_reader());

drop policy if exists "payments_select_reader" on public.payments;
create policy "payments_select_reader" on public.payments for select using (public.is_staff_reader());

drop policy if exists "messages_select_reader" on public.messages;
create policy "messages_select_reader" on public.messages for select using (public.is_staff_reader());

drop policy if exists "expenses_select_reader" on public.expenses;
create policy "expenses_select_reader" on public.expenses for select to authenticated using (public.is_staff_reader());

drop policy if exists "expense_receipts_read_reader" on storage.objects;
create policy "expense_receipts_read_reader" on storage.objects
    for select to authenticated using (bucket_id = 'expense-receipts' and public.is_staff_reader());

drop policy if exists "payment_receipts_read_reader" on storage.objects;
create policy "payment_receipts_read_reader" on storage.objects
    for select to authenticated using (bucket_id = 'payment-receipts' and public.is_staff_reader());

-- ---------------------------------------------------------------
-- 3. Admin and supervisor invites (separate from employee invites)
-- ---------------------------------------------------------------
create table if not exists public.admin_invites (
    id uuid primary key default gen_random_uuid(),
    token text not null unique,
    -- Always tied to one email address, which must be confirmed before the account works.
    email text not null,
    role text not null default 'admin' check (role in ('admin', 'supervisor')),
    invited_by uuid references public.profiles (id) on delete set null,
    used_at timestamptz,
    used_by uuid references public.profiles (id) on delete set null,
    expires_at timestamptz not null default (now() + interval '3 days'),
    created_at timestamptz not null default now()
);

alter table public.admin_invites enable row level security;

drop policy if exists "admin_invites_all_admin" on public.admin_invites;
create policy "admin_invites_all_admin" on public.admin_invites
    for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists "admin_invites_select_reader" on public.admin_invites;
create policy "admin_invites_select_reader" on public.admin_invites for select using (public.is_staff_reader());

-- Lets the logged-out invite page check a token without any table access.
create or replace function public.check_admin_invite(p_token text)
returns jsonb
language sql
security definer
set search_path = public
stable
as $$
    select coalesce(
        (select jsonb_build_object('valid', true, 'email', email, 'role', role)
         from public.admin_invites
         where token = p_token and used_at is null and expires_at > now()),
        jsonb_build_object('valid', false)
    );
$$;

-- Signup: an employee invite makes an employee (needs approval); an admin
-- invite makes an approved admin or view-only admin, but only for the exact
-- email address it was issued to.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
    v_invite_id uuid;
    v_invite_email text;
    v_admin_invite_id uuid;
    v_admin_invite_email text;
    v_admin_invite_role text;
    v_role text := 'customer';
    v_status text := 'pending';
    v_read_only boolean := false;
begin
    select id, email into v_invite_id, v_invite_email
    from public.employee_invites
    where token = new.raw_user_meta_data ->> 'invite_token'
      and used_at is null
      and expires_at > now()
    for update;

    if v_invite_id is not null then
        if v_invite_email is not null and lower(v_invite_email) <> lower(new.email) then
            raise exception 'This invite was issued for a different email address.';
        end if;
        v_role := 'employee';
    else
        select id, email, role into v_admin_invite_id, v_admin_invite_email, v_admin_invite_role
        from public.admin_invites
        where token = new.raw_user_meta_data ->> 'invite_token'
          and used_at is null
          and expires_at > now()
        for update;

        if v_admin_invite_id is not null then
            if lower(v_admin_invite_email) <> lower(new.email) then
                raise exception 'This invite was issued for a different email address.';
            end if;
            v_role := 'admin';
            v_status := 'approved';
            v_read_only := (v_admin_invite_role = 'supervisor');
        end if;
    end if;

    insert into public.profiles (id, full_name, email, role, status, read_only)
    values (new.id, new.raw_user_meta_data ->> 'full_name', new.email, v_role, v_status, v_read_only);

    if v_invite_id is not null and v_role = 'employee' then
        update public.employee_invites set used_at = now(), used_by = new.id where id = v_invite_id;
    end if;

    if v_admin_invite_id is not null then
        update public.admin_invites set used_at = now(), used_by = new.id where id = v_admin_invite_id;
    end if;

    return new;
end;
$$;

revoke execute on function public.handle_new_user() from public, anon, authenticated;

-- ---------------------------------------------------------------
-- 4. Activity log: who changed what. Nobody can edit or delete entries.
-- ---------------------------------------------------------------
create table if not exists public.activity_log (
    id uuid primary key default gen_random_uuid(),
    actor_id uuid references public.profiles (id) on delete set null,
    -- Kept as text too, so the entry still reads well if the account is removed.
    actor_name text,
    action text not null,
    summary text not null,
    target_type text,
    target_id uuid,
    created_at timestamptz not null default now()
);

create index if not exists activity_log_created_idx on public.activity_log (created_at desc);

alter table public.activity_log enable row level security;

drop policy if exists "activity_log_select_reader" on public.activity_log;
create policy "activity_log_select_reader" on public.activity_log
    for select to authenticated using (public.is_staff_reader());

drop policy if exists "activity_log_insert_admin" on public.activity_log;
create policy "activity_log_insert_admin" on public.activity_log
    for insert to authenticated with check (public.is_admin() and actor_id = auth.uid());

select 'done' as result;
