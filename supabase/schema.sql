-- ============================================================
-- Jigzack Service — core schema, auto-profile trigger, and RLS
-- Run this once in the Supabase SQL Editor on a fresh project.
-- ============================================================

create extension if not exists "pgcrypto";

-- ============================================================
-- profiles
-- One row per auth.users row. Created automatically on signup
-- by the handle_new_user() trigger below, using the full_name
-- and role passed in supabase.auth.signUp({ options: { data } }).
-- ============================================================
create table public.profiles (
    id uuid primary key references auth.users (id) on delete cascade,
    full_name text,
    email text,
    role text not null default 'customer'
        check (role in ('admin', 'employee', 'customer')),
    status text not null default 'pending'
        check (status in ('pending', 'approved', 'declined')),
    created_at timestamptz not null default now()
);

-- The role is NEVER read from client-supplied signup metadata (anyone
-- could send role = 'admin'). Everyone starts as a customer; the only way
-- to become an employee is a valid, unused, unexpired admin-issued invite
-- token (public.employee_invites), consumed here atomically.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
    v_invite_id uuid;
    v_invite_email text;
    v_role text := 'customer';
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
    end if;

    insert into public.profiles (id, full_name, email, role, status)
    values (
        new.id,
        new.raw_user_meta_data ->> 'full_name',
        new.email,
        v_role,
        'pending'
    );

    if v_role = 'employee' then
        update public.employee_invites
        set used_at = now(), used_by = new.id
        where id = v_invite_id;
    end if;

    return new;
end;
$$;

create trigger on_auth_user_created
    after insert on auth.users
    for each row execute function public.handle_new_user();

-- Bypasses RLS internally so policies below can check "is this
-- caller an approved admin?" without recursing into profiles' own RLS.
create or replace function public.is_admin()
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

alter table public.profiles enable row level security;

create policy "profiles_select_own" on public.profiles
    for select using (auth.uid() = id);

create policy "profiles_select_admin" on public.profiles
    for select using (public.is_admin());

-- Lets a message thread's other party resolve to a real name instead of
-- silently returning null (RLS otherwise blocks a non-admin from reading
-- e.g. the admin's profiles row, which the messages UI joins against to
-- show who a thread is with).
create policy "profiles_select_message_counterpart" on public.profiles
    for select using (
        exists (
            select 1 from public.messages
            where (messages.from_profile_id = profiles.id and messages.to_profile_id = auth.uid())
               or (messages.to_profile_id = profiles.id and messages.from_profile_id = auth.uid())
        )
    );

-- Admin approves/declines signups (ApprovalsList updates status only).
create policy "profiles_update_admin" on public.profiles
    for update using (public.is_admin())
    with check (public.is_admin());

-- ============================================================
-- customers
-- Property/billing profile for a customer-role user.
-- ============================================================
create table public.customers (
    id uuid primary key default gen_random_uuid(),
    profile_id uuid references public.profiles (id) on delete set null,
    full_name text not null,
    email text,
    phone text,
    whatsapp_number text,
    address text,
    lga text,
    state text,
    landmark text,
    property_type text
        check (property_type in ('residential', 'commercial')),
    property_class text,
    account_code text,
    property_code text,
    last_serviced date,
    balance numeric(12, 2) not null default 0,
    status text not null default 'active'
        check (status in ('active', 'inactive')),
    preferred_pickup_frequency text,
    waste_type text,
    special_notes text,
    facility_details jsonb,
    registration_fee_paid boolean not null default false,
    registration_fee_reference text,
    registration_fee_paid_at timestamptz,
    -- Units the landlord has told us are vacant, e.g. {"flatsCount": 2}.
    -- Vacant units aren't billed (see lib/billing/pricing.ts).
    vacancies jsonb not null default '{}'::jsonb,
    vacancy_note text,
    created_at timestamptz not null default now()
);

create unique index customers_profile_id_key on public.customers (profile_id);

alter table public.customers enable row level security;

create policy "customers_select_own" on public.customers
    for select using (auth.uid() = profile_id);

-- The customer-setup form inserts its own row right after signup.
create policy "customers_insert_own" on public.customers
    for insert with check (auth.uid() = profile_id);

create policy "customers_all_admin" on public.customers
    for all using (public.is_admin()) with check (public.is_admin());

-- ============================================================
-- employee_invites
-- Employee accounts can't be self-registered. An admin generates an
-- invite link (token minted server-side); the invited person signs up
-- through it and handle_new_user() upgrades them to an employee.
-- ============================================================
create table public.employee_invites (
    id uuid primary key default gen_random_uuid(),
    token text not null unique,
    email text,
    invited_by uuid references public.profiles (id) on delete set null,
    used_at timestamptz,
    used_by uuid references public.profiles (id) on delete set null,
    expires_at timestamptz not null default (now() + interval '7 days'),
    created_at timestamptz not null default now()
);

alter table public.employee_invites enable row level security;

create policy "employee_invites_all_admin" on public.employee_invites
    for all using (public.is_admin()) with check (public.is_admin());

-- Lets the (logged-out) invite page check a token without any table access.
create or replace function public.check_employee_invite(p_token text)
returns jsonb
language sql
security definer
set search_path = public
stable
as $$
    select coalesce(
        (select jsonb_build_object('valid', true, 'email', email)
         from public.employee_invites
         where token = p_token and used_at is null and expires_at > now()),
        jsonb_build_object('valid', false)
    );
$$;

-- ============================================================
-- estates & units
-- An estate is a customers row (is_estate = true) that receives one
-- shared utility bill through the existing payments/tasks flow,
-- unchanged. A tenant is a separate customer account linked to a
-- unit under that estate via customers.unit_id, giving them read
-- access to the estate's bill (see payments_select_tenant below)
-- without a payments row of their own.
-- ============================================================
create table public.units (
    id uuid primary key default gen_random_uuid(),
    estate_profile_id uuid not null references public.profiles (id) on delete cascade,
    label text not null,
    created_at timestamptz not null default now()
);

alter table public.customers add column is_estate boolean not null default false;
alter table public.customers add column unit_id uuid references public.units (id) on delete set null;

alter table public.units enable row level security;

create policy "units_select_estate_owner" on public.units
    for select using (auth.uid() = estate_profile_id);

create policy "units_select_tenant" on public.units
    for select using (
        exists (
            select 1 from public.customers
            where customers.profile_id = auth.uid() and customers.unit_id = units.id
        )
    );

create policy "units_all_admin" on public.units
    for all using (public.is_admin()) with check (public.is_admin());

-- A tenant's invoice shows their estate's property details, so they need
-- to read that one row. Done through a SECURITY DEFINER function because a
-- policy that queried customers directly would recurse into itself.
create or replace function public.tenant_estate_profile_id()
returns uuid
language sql
security definer
set search_path = public
stable
as $$
    select u.estate_profile_id
    from public.customers c
    join public.units u on u.id = c.unit_id
    where c.profile_id = auth.uid()
    limit 1;
$$;

create policy "customers_select_tenant_estate" on public.customers
    for select using (profile_id = public.tenant_estate_profile_id());

-- Bypasses RLS so a paying customer can mark their own registration
-- fee paid after a verified Paystack transaction, without a broad
-- update policy that would let them edit any other column (balance,
-- status, etc.) on their own row.
create or replace function public.mark_registration_fee_paid(p_reference text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
    update public.customers
    set registration_fee_paid = true,
        registration_fee_reference = p_reference,
        registration_fee_paid_at = now()
    where profile_id = auth.uid();
end;
$$;

-- ============================================================
-- employees
-- Contact/verification profile for an employee-role user,
-- submitted via /auth/employee-setup before admin approval.
-- ============================================================
create table public.employees (
    id uuid primary key default gen_random_uuid(),
    profile_id uuid references public.profiles (id) on delete set null,
    full_name text not null,
    phone text,
    address text,
    lga text,
    state text,
    created_at timestamptz not null default now()
);

create unique index employees_profile_id_key on public.employees (profile_id);

alter table public.employees enable row level security;

create policy "employees_select_own" on public.employees
    for select using (auth.uid() = profile_id);

-- The employee-setup form inserts its own row right after signup.
create policy "employees_insert_own" on public.employees
    for insert with check (auth.uid() = profile_id);

create policy "employees_all_admin" on public.employees
    for all using (public.is_admin()) with check (public.is_admin());

-- ============================================================
-- tasks
-- Service/pickup work orders. customer_id / employee_id point
-- at profiles.id (not customers.id) — matches the app's queries.
-- ============================================================
create table public.tasks (
    id uuid primary key default gen_random_uuid(),
    title text not null,
    customer_id uuid references public.profiles (id) on delete set null,
    employee_id uuid references public.profiles (id) on delete set null,
    status text not null default 'pending'
        check (status in ('pending', 'in progress', 'completed', 'declined')),
    priority text not null default 'low'
        check (priority in ('low', 'medium', 'high')),
    scheduled_date date,
    zone text,
    started_at timestamptz,
    completed_at timestamptz,
    -- Generated from the customer's pickup frequency (editable by admin).
    auto_generated boolean not null default false,
    created_at timestamptz not null default now()
);

create unique index tasks_auto_date_key on public.tasks (customer_id, scheduled_date) where auto_generated;

alter table public.tasks enable row level security;

create policy "tasks_select_employee" on public.tasks
    for select using (auth.uid() = employee_id);

create policy "tasks_select_customer" on public.tasks
    for select using (auth.uid() = customer_id);

-- startTask/endTask update only their own assigned tasks.
create policy "tasks_update_employee" on public.tasks
    for update using (auth.uid() = employee_id)
    with check (auth.uid() = employee_id);

create policy "tasks_all_admin" on public.tasks
    for all using (public.is_admin()) with check (public.is_admin());

-- ============================================================
-- uploads
-- Before/after task photos. image_url points at the task-photos
-- storage bucket created below.
-- ============================================================
create table public.uploads (
    id uuid primary key default gen_random_uuid(),
    task_id uuid references public.tasks (id) on delete cascade,
    employee_id uuid references public.profiles (id) on delete set null,
    customer_id uuid references public.profiles (id) on delete set null,
    task_title text,
    image_url text not null,
    photo_type text check (photo_type in ('before', 'after')),
    created_at timestamptz not null default now()
);

alter table public.uploads enable row level security;

create policy "uploads_select_employee" on public.uploads
    for select using (auth.uid() = employee_id);

create policy "uploads_select_customer" on public.uploads
    for select using (auth.uid() = customer_id);

create policy "uploads_insert_employee" on public.uploads
    for insert with check (auth.uid() = employee_id);

create policy "uploads_delete_employee" on public.uploads
    for delete using (auth.uid() = employee_id);

create policy "uploads_all_admin" on public.uploads
    for all using (public.is_admin()) with check (public.is_admin());

-- ============================================================
-- payments (invoices, as rendered on /customer/invoices/[id])
-- ============================================================
create table public.payments (
    id uuid primary key default gen_random_uuid(),
    customer_id uuid references public.profiles (id) on delete set null,
    amount numeric(12, 2) not null default 0,
    units numeric(12, 2) not null default 1,
    arrears numeric(12, 2) not null default 0,
    description text,
    invoice_month text,
    status text not null default 'pending'
        check (status in ('paid', 'pending', 'failed')),
    paid_at timestamptz,
    payment_method text,
    payment_reference text,
    -- [{ "label": "Flat", "quantity": 8, "unit_price": 5000, "note": "2 vacant" }]
    line_items jsonb,
    auto_generated boolean not null default false,
    -- Which customer emails the daily job has already sent for this invoice.
    invoice_emailed_at timestamptz,
    reminders_sent integer not null default 0,
    last_reminder_at timestamptz,
    created_at timestamptz not null default now()
);

create unique index payments_auto_month_key on public.payments (customer_id, invoice_month) where auto_generated;

alter table public.payments enable row level security;

create policy "payments_select_own" on public.payments
    for select using (auth.uid() = customer_id);

-- Lets a tenant view (and print/download) their estate's shared
-- invoice even though the payments row belongs to the estate's
-- account, not their own.
create policy "payments_select_tenant" on public.payments
    for select using (
        exists (
            select 1 from public.customers c
            join public.units u on u.id = c.unit_id
            where c.profile_id = auth.uid() and u.estate_profile_id = payments.customer_id
        )
    );

create policy "payments_all_admin" on public.payments
    for all using (public.is_admin()) with check (public.is_admin());

-- ============================================================
-- messages
-- Admin-to-user messages, shown on the admin dashboard and
-- (eventually) on the recipient's own dashboard.
-- ============================================================
create table public.messages (
    id uuid primary key default gen_random_uuid(),
    from_profile_id uuid references public.profiles (id) on delete set null,
    to_profile_id uuid references public.profiles (id) on delete cascade,
    subject text not null,
    body text not null,
    parent_message_id uuid references public.messages (id) on delete set null,
    read_at timestamptz,
    is_broadcast boolean not null default false,
    -- Rows created by one send to several recipients (broadcast, or a
    -- message to every admin) share a group_id so the sender's list can
    -- show it once instead of once per recipient.
    group_id uuid,
    created_at timestamptz not null default now()
);

create index messages_parent_message_id_idx on public.messages (parent_message_id);

alter table public.messages enable row level security;

create policy "messages_select_own" on public.messages
    for select using (auth.uid() = from_profile_id or auth.uid() = to_profile_id);

create policy "messages_all_admin" on public.messages
    for all using (public.is_admin()) with check (public.is_admin());

-- Either side of a conversation can delete their own sent message.
create policy "messages_delete_own" on public.messages
    for delete using (auth.uid() = from_profile_id);

-- Recipients can update (mark read) messages addressed to them.
create policy "messages_update_own_inbox" on public.messages
    for update using (auth.uid() = to_profile_id)
    with check (auth.uid() = to_profile_id);

-- Lets any authenticated user look up who to message without needing
-- read access to the admin profiles rows (which RLS otherwise blocks
-- for non-admins). Returns every approved admin, not just one -- a
-- "contact admin" message is fanned out to all of them (the same
-- fan-out shape as an admin's own broadcast to all customers/employees)
-- rather than always landing on whichever admin account happens to be
-- oldest, where a second admin would never see it at all.
create or replace function public.approved_admin_emails()
returns text[]
language sql
security definer
set search_path = public
stable
as $$
    select coalesce(array_agg(email), '{}') from public.profiles
    where role = 'admin' and status = 'approved' and email is not null;
$$;

create or replace function public.approved_admin_ids()
returns uuid[]
language sql
security definer
set search_path = public
stable
as $$
    select coalesce(array_agg(id), '{}') from public.profiles
    where role = 'admin' and status = 'approved';
$$;

-- Bypasses RLS internally so the insert policy below can check "is the
-- recipient an approved admin?" without needing read access to that
-- profiles row (a plain `exists` subquery here would still be subject
-- to the caller's own profiles RLS and silently evaluate to false).
create or replace function public.is_approved_admin(target_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
    select exists (
        select 1 from public.profiles
        where id = target_id and role = 'admin' and status = 'approved'
    );
$$;

-- Customers/employees can message an approved admin (support-style
-- contact), but not each other -- the recipient must be an admin.
-- Broadcasts are one-way: replying is a normal insert with
-- parent_message_id set to the thread root, so this also rejects a
-- reply whose root is a broadcast, at the database level rather than
-- only hiding the reply box in the UI (defense in depth -- the row is
-- already readable by the replier as its recipient, via
-- messages_select_own, so no security-definer bypass is needed here).
create policy "messages_insert_to_admin" on public.messages
    for insert with check (
        auth.uid() = from_profile_id
        and public.is_approved_admin(to_profile_id)
        and (
            parent_message_id is null
            or not exists (
                select 1 from public.messages root
                where root.id = parent_message_id and root.is_broadcast
            )
        )
    );

-- Lets dashboard clients subscribe to live INSERT/UPDATE/DELETE events
-- on their own messages (scoped by the messages_select_own RLS policy
-- above) instead of polling or waiting for a page reload.
alter publication supabase_realtime add table public.messages;
alter publication supabase_realtime add table public.tasks;
alter publication supabase_realtime add table public.uploads;
alter publication supabase_realtime add table public.profiles;

-- ============================================================
-- storage: task-photos bucket
-- Public read (the UI renders image_url directly in <img>),
-- employees can only upload into their own "{uid}/..." folder,
-- matching the filePath built in app/employee/actions.ts.
-- ============================================================
-- Only images, and nothing over 15MB, can be stored here.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
    'task-photos', 'task-photos', true, 15728640,
    array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']
)
on conflict (id) do update
    set file_size_limit = excluded.file_size_limit,
        allowed_mime_types = excluded.allowed_mime_types;

-- Photos are shown through their public URLs, which need no policy. This
-- one only lets signed-in users list files, so strangers can't browse them.
create policy "task_photos_public_read" on storage.objects
    for select to authenticated using (bucket_id = 'task-photos');

-- Only staff can add photos, and only into their own folder.
create policy "task_photos_employee_upload" on storage.objects
    for insert to authenticated with check (
        bucket_id = 'task-photos'
        and (storage.foldername(name)) [1] = auth.uid()::text
        and exists (
            select 1 from public.profiles p
            where p.id = auth.uid() and p.role in ('employee', 'admin') and p.status = 'approved'
        )
    );

create policy "task_photos_employee_delete" on storage.objects
    for delete using (
        bucket_id = 'task-photos'
        and (storage.foldername(name)) [1] = auth.uid()::text
    );

-- ============================================================
-- Function access
-- Postgres lets everyone (including logged-out visitors holding the public
-- anon key) call a function unless told otherwise. These return admin
-- contact details or change payment state, so only signed-in users may run
-- them. check_employee_invite stays open on purpose: the invite page calls
-- it before the person has an account.
-- ============================================================
revoke execute on function public.approved_admin_emails() from public, anon;
revoke execute on function public.approved_admin_ids() from public, anon;
revoke execute on function public.mark_registration_fee_paid(text) from public, anon;
revoke execute on function public.handle_new_user() from public, anon, authenticated;
grant execute on function public.approved_admin_emails() to authenticated;
grant execute on function public.approved_admin_ids() to authenticated;
grant execute on function public.mark_registration_fee_paid(text) to authenticated;

-- ============================================================
-- Declined applications, staff expenses and the private receipts bucket
-- (also in supabase/declined-and-expenses-2026-09.sql for the live project)
-- ============================================================
-- Declined applications
-- ---------------------------------------------------------------
alter table public.profiles
    add column if not exists decline_reason text,
    add column if not exists declined_at timestamptz;

-- ---------------------------------------------------------------
-- 2. Expenses
-- ---------------------------------------------------------------
create table if not exists public.expenses (
    id uuid primary key default gen_random_uuid(),
    employee_id uuid not null references public.profiles (id) on delete cascade,
    task_id uuid references public.tasks (id) on delete set null,
    amount numeric(12, 2) not null check (amount > 0),
    category text not null
        check (category in ('fuel', 'transport', 'repairs', 'supplies', 'meals', 'other')),
    note text,
    expense_date date not null default current_date,
    -- Path inside the private expense-receipts bucket, if a receipt was added.
    receipt_path text,
    status text not null default 'submitted'
        check (status in ('submitted', 'approved', 'reimbursed', 'rejected')),
    admin_note text,
    reviewed_by uuid references public.profiles (id) on delete set null,
    reviewed_at timestamptz,
    created_at timestamptz not null default now()
);

create index if not exists expenses_employee_idx on public.expenses (employee_id, created_at desc);
create index if not exists expenses_status_idx on public.expenses (status, expense_date desc);

alter table public.expenses enable row level security;

drop policy if exists "expenses_insert_own" on public.expenses;
create policy "expenses_insert_own" on public.expenses
    for insert to authenticated
    with check (
        employee_id = auth.uid()
        and status = 'submitted'
        and reviewed_by is null
        and exists (
            select 1 from public.profiles p
            where p.id = auth.uid() and p.role = 'employee' and p.status = 'approved'
        )
    );

-- Staff see only their own entries, never anyone else's.
drop policy if exists "expenses_select_own" on public.expenses;
create policy "expenses_select_own" on public.expenses
    for select to authenticated using (employee_id = auth.uid());

-- A staff member can withdraw an entry the admin hasn't reviewed yet.
drop policy if exists "expenses_delete_own_submitted" on public.expenses;
create policy "expenses_delete_own_submitted" on public.expenses
    for delete to authenticated using (employee_id = auth.uid() and status = 'submitted');

drop policy if exists "expenses_all_admin" on public.expenses;
create policy "expenses_all_admin" on public.expenses
    for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------
-- Receipts: a private bucket (files are only reachable through short-lived signed links)
-- ---------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
    'expense-receipts', 'expense-receipts', false, 10485760,
    array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'application/pdf']
)
on conflict (id) do update
    set public = false,
        file_size_limit = excluded.file_size_limit,
        allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "expense_receipts_upload" on storage.objects;
create policy "expense_receipts_upload" on storage.objects
    for insert to authenticated with check (
        bucket_id = 'expense-receipts'
        and (storage.foldername(name)) [1] = auth.uid()::text
        and exists (
            select 1 from public.profiles p
            where p.id = auth.uid() and p.role = 'employee' and p.status = 'approved'
        )
    );

drop policy if exists "expense_receipts_read" on storage.objects;
create policy "expense_receipts_read" on storage.objects
    for select to authenticated using (
        bucket_id = 'expense-receipts'
        and ((storage.foldername(name)) [1] = auth.uid()::text or public.is_admin())
    );

drop policy if exists "expense_receipts_delete_own" on storage.objects;
create policy "expense_receipts_delete_own" on storage.objects
    for delete to authenticated using (
        bucket_id = 'expense-receipts'
        and (storage.foldername(name)) [1] = auth.uid()::text
    );


-- ============================================================
-- Employee and customer messages (also in supabase/employee-customer-messages-2026-09.sql)
-- ============================================================
-- 1. The customers an employee may contact: those with a task assigned to them.
create or replace function public.my_customer_contacts()
returns table (id uuid, full_name text)
language sql
security definer
set search_path = public
stable
as $$
    select distinct p.id, p.full_name
    from public.tasks t
    join public.profiles p on p.id = t.customer_id
    where t.employee_id = auth.uid()
      and p.role = 'customer'
      and p.status = 'approved'
    order by p.full_name;
$$;

revoke execute on function public.my_customer_contacts() from public, anon;
grant execute on function public.my_customer_contacts() to authenticated;

-- 2. A message is allowed between an employee and a customer when a task links
--    them, in either direction (so the customer can reply). Replies to
--    broadcasts stay blocked, as for admin messages.
drop policy if exists "messages_insert_employee_customer" on public.messages;
create policy "messages_insert_employee_customer" on public.messages
    for insert to authenticated
    with check (
        auth.uid() = from_profile_id
        and exists (
            select 1 from public.tasks t
            where (t.employee_id = from_profile_id and t.customer_id = to_profile_id)
               or (t.customer_id = from_profile_id and t.employee_id = to_profile_id)
        )
        and (
            parent_message_id is null
            or not exists (
                select 1 from public.messages root
                where root.id = parent_message_id and root.is_broadcast
            )
        )
    );


-- ============================================================
-- Multiple admins, view-only admins, admin invites and the activity log
-- (also in supabase/admins-activity-2026-09.sql for the live project)
-- ============================================================
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


-- ============================================================
-- Customer deletion (also in supabase/customer-delete-2026-09.sql)
-- ============================================================

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

