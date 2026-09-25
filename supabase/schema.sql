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

-- The registration fee is paid by bank transfer. A customer can only report it
-- (see report_registration_fee in the manual payments section at the end);
-- an admin confirms it.

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
revoke execute on function public.handle_new_user() from public, anon, authenticated;
grant execute on function public.approved_admin_emails() to authenticated;
grant execute on function public.approved_admin_ids() to authenticated;

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


-- ============================================================
-- Manual payments (also in supabase/manual-payments-2026-09.sql)
-- ============================================================
-- 1. What the customer reported
-- ---------------------------------------------------------------
alter table public.customers
    add column if not exists registration_fee_submitted_at timestamptz,
    add column if not exists registration_fee_receipt_path text,
    add column if not exists registration_fee_note text;

-- The old function marked the fee paid straight after a Paystack payment.
drop function if exists public.mark_registration_fee_paid(text);

-- A customer can only say "I have paid". Confirming is an admin action. This
-- runs with elevated rights so it does not need a broad update policy that
-- would let a customer edit other columns (balance, status) on their own row.
create or replace function public.report_registration_fee(p_note text, p_receipt_path text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
    update public.customers
    set registration_fee_submitted_at = now(),
        registration_fee_note = nullif(left(coalesce(p_note, ''), 300), ''),
        registration_fee_receipt_path = p_receipt_path
    where profile_id = auth.uid()
      and registration_fee_paid = false;
end;
$$;

revoke execute on function public.report_registration_fee(text, text) from public, anon;
grant execute on function public.report_registration_fee(text, text) to authenticated;

-- ---------------------------------------------------------------
-- 2. Private bucket for payment receipts
-- ---------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
    'payment-receipts', 'payment-receipts', false, 10485760,
    array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'application/pdf']
)
on conflict (id) do update
    set public = false,
        file_size_limit = excluded.file_size_limit,
        allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "payment_receipts_upload" on storage.objects;
create policy "payment_receipts_upload" on storage.objects
    for insert to authenticated with check (
        bucket_id = 'payment-receipts'
        and (storage.foldername(name)) [1] = auth.uid()::text
        and exists (
            select 1 from public.profiles p
            where p.id = auth.uid() and p.role = 'customer' and p.status = 'approved'
        )
    );

drop policy if exists "payment_receipts_read" on storage.objects;
create policy "payment_receipts_read" on storage.objects
    for select to authenticated using (
        bucket_id = 'payment-receipts'
        and ((storage.foldername(name)) [1] = auth.uid()::text or public.is_admin())
    );

drop policy if exists "payment_receipts_delete_own" on storage.objects;
create policy "payment_receipts_delete_own" on storage.objects
    for delete to authenticated using (
        bucket_id = 'payment-receipts'
        and (storage.foldername(name)) [1] = auth.uid()::text
    );



-- ---------------------------------------------------------------
-- 3. Invoices: "I paid by transfer" with an optional receipt
-- ---------------------------------------------------------------
alter table public.payments
    add column if not exists transfer_reported_at timestamptz,
    add column if not exists transfer_note text,
    add column if not exists transfer_receipt_path text;

-- A customer can only say "I have paid" for their own unpaid invoice. Marking
-- an invoice paid stays an admin action. This runs with elevated rights so it
-- does not need a broad update policy on payments.
create or replace function public.report_invoice_transfer(p_payment_id uuid, p_note text, p_receipt_path text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
    update public.payments
    set transfer_reported_at = now(),
        transfer_note = nullif(left(coalesce(p_note, ''), 300), ''),
        transfer_receipt_path = p_receipt_path
    where id = p_payment_id
      and customer_id = auth.uid()
      and status = 'pending';
end;
$$;

revoke execute on function public.report_invoice_transfer(uuid, text, text) from public, anon;
grant execute on function public.report_invoice_transfer(uuid, text, text) to authenticated;

-- ============================================================
-- Owner level (also in supabase/owner-2026-09.sql)
-- ============================================================

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


-- ============================================================
-- Recently deleted customers (also in supabase/recently-deleted-2026-09.sql)
-- ============================================================
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
begin
    delete from public.messages where from_profile_id = p_profile_id or to_profile_id = p_profile_id;
    delete from public.uploads where customer_id = p_profile_id;
    delete from public.tasks where customer_id = p_profile_id;
    delete from public.payments where customer_id = p_profile_id;
    delete from public.customers where profile_id = p_profile_id;

    -- Removing the login also removes the profile row and frees the email address.
    delete from auth.users where id = p_profile_id;
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

    if v_role <> 'customer' then
        raise exception 'Only customer accounts can be deleted here';
    end if;

    if v_status is distinct from 'deleted' then
        raise exception 'Move this customer to Recently deleted first';
    end if;

    if exists (select 1 from public.units where estate_profile_id = p_profile_id) then
        raise exception 'This estate still has units. Remove or move them first.';
    end if;

    perform public.delete_customer_data(p_profile_id);

    return jsonb_build_object('deleted', true);
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


-- ============================================================
-- Cleanup tools: owner-only deletes (also in supabase/cleanup-tools-2026-09.sql)
-- ============================================================
-- only. Admins keep read, add and edit. (Invoices and customers already work
-- this way after owner-2026-09.sql.)

-- Expenses: admins review (update), only owners delete.
drop policy if exists "expenses_all_admin" on public.expenses;
drop policy if exists "expenses_select_admin" on public.expenses;
drop policy if exists "expenses_insert_admin" on public.expenses;
drop policy if exists "expenses_update_admin" on public.expenses;
drop policy if exists "expenses_delete_owner" on public.expenses;
create policy "expenses_select_admin" on public.expenses for select to authenticated using (public.is_admin());
create policy "expenses_insert_admin" on public.expenses for insert to authenticated with check (public.is_admin());
create policy "expenses_update_admin" on public.expenses for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "expenses_delete_owner" on public.expenses for delete to authenticated using (public.is_owner());

-- Messages: admins read, send and mark read; a sender can still delete their own
-- (messages_delete_own), and only an owner can delete anyone else's.
drop policy if exists "messages_all_admin" on public.messages;
drop policy if exists "messages_select_admin" on public.messages;
drop policy if exists "messages_insert_admin" on public.messages;
drop policy if exists "messages_update_admin" on public.messages;
drop policy if exists "messages_delete_owner" on public.messages;
create policy "messages_select_admin" on public.messages for select using (public.is_admin());
create policy "messages_insert_admin" on public.messages for insert with check (public.is_admin());
create policy "messages_update_admin" on public.messages for update using (public.is_admin()) with check (public.is_admin());
create policy "messages_delete_owner" on public.messages for delete using (public.is_owner());

-- Owners can remove any receipt file (staff and customers can only remove their own).
drop policy if exists "payment_receipts_delete_owner" on storage.objects;
create policy "payment_receipts_delete_owner" on storage.objects
    for delete to authenticated using (bucket_id = 'payment-receipts' and public.is_owner());

drop policy if exists "expense_receipts_delete_owner" on storage.objects;
create policy "expense_receipts_delete_owner" on storage.objects
    for delete to authenticated using (bucket_id = 'expense-receipts' and public.is_owner());


-- ============================================================
-- Clearing the activity log (also in supabase/activity-clear-2026-09.sql)
-- ============================================================

drop policy if exists "activity_log_delete_owner" on public.activity_log;
create policy "activity_log_delete_owner" on public.activity_log
    for delete to authenticated using (public.is_owner());


-- ============================================================
-- Deleting an employee (also in supabase/employee-delete-2026-09.sql)
-- ============================================================

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


-- ============================================================
-- Message attachments
-- (also in supabase/message-attachments-2026-09.sql for the live project)
-- ============================================================

-- ---------------------------------------------------------------
-- 1. Where the file is recorded on the message
-- ---------------------------------------------------------------
alter table public.messages
    add column if not exists attachment_path text,
    add column if not exists attachment_name text;

-- ---------------------------------------------------------------
-- 2. Private bucket. Files are named <sender id>/<random id>.<ext>
-- ---------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
    'message-attachments', 'message-attachments', false, 10485760,
    array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'application/pdf']
)
on conflict (id) do update
    set public = false,
        file_size_limit = excluded.file_size_limit,
        allowed_mime_types = excluded.allowed_mime_types;

-- Anyone signed in and approved can upload into their own folder.
drop policy if exists "message_attachments_upload" on storage.objects;
create policy "message_attachments_upload" on storage.objects
    for insert to authenticated with check (
        bucket_id = 'message-attachments'
        and (storage.foldername(name)) [1] = auth.uid()::text
        and exists (
            select 1 from public.profiles p
            where p.id = auth.uid() and p.status = 'approved'
        )
    );

-- The sender, the person a message was sent to, and admins (who can already
-- read every message) can open a file.
drop policy if exists "message_attachments_read" on storage.objects;
create policy "message_attachments_read" on storage.objects
    for select to authenticated using (
        bucket_id = 'message-attachments'
        and (
            (storage.foldername(name)) [1] = auth.uid()::text
            or public.is_staff_reader()
            or exists (
                select 1 from public.messages m
                where m.attachment_path = storage.objects.name
                  and m.to_profile_id = auth.uid()
            )
        )
    );

-- The sender can remove their own files. Admins can too, which lets an owner
-- clear out messages together with their files.
drop policy if exists "message_attachments_delete" on storage.objects;
create policy "message_attachments_delete" on storage.objects
    for delete to authenticated using (
        bucket_id = 'message-attachments'
        and ((storage.foldername(name)) [1] = auth.uid()::text or public.is_admin())
    );

-- ============================================================
-- Part payments and custom monthly charge
-- (also in supabase/billing-installments-2026-09.sql for the live project)
-- ============================================================
-- Run it in the Supabase SQL editor.

-- ---------------------------------------------------------------
-- 1. A custom monthly charge for a customer (empty = worked out from
--    their property details, as before)
-- ---------------------------------------------------------------
alter table public.customers
    add column if not exists monthly_rate numeric(12, 2)
        check (monthly_rate is null or monthly_rate >= 0);

-- ---------------------------------------------------------------
-- 2. How much of an invoice has been paid so far
-- ---------------------------------------------------------------
alter table public.payments
    add column if not exists amount_paid numeric(12, 2) not null default 0;

-- Invoices already marked paid count as fully paid.
update public.payments
set amount_paid = amount + arrears
where status = 'paid' and amount_paid = 0;

-- ---------------------------------------------------------------
-- 3. Each payment received against an invoice. One row is one receipt.
-- ---------------------------------------------------------------
create table if not exists public.payment_installments (
    id uuid primary key default gen_random_uuid(),
    payment_id uuid not null references public.payments (id) on delete cascade,
    amount numeric(12, 2) not null check (amount > 0),
    -- What was still owed on the invoice right after this payment.
    balance_after numeric(12, 2) not null check (balance_after >= 0),
    method text,
    reference text,
    note text,
    paid_at timestamptz not null default now(),
    recorded_by uuid references public.profiles (id) on delete set null,
    created_at timestamptz not null default now()
);

create index if not exists payment_installments_payment_idx
    on public.payment_installments (payment_id, paid_at);

alter table public.payment_installments enable row level security;

-- Whoever can see an invoice (its customer, a tenant of that estate, admins
-- and view-only supervisors) can see its payments. Nobody writes to this table
-- directly: the functions below do it.
drop policy if exists "installments_select_visible" on public.payment_installments;
create policy "installments_select_visible" on public.payment_installments
    for select to authenticated using (
        exists (select 1 from public.payments p where p.id = payment_installments.payment_id)
    );

-- ---------------------------------------------------------------
-- 4. Record a payment against an invoice. The total can never go over what
--    is owed, and the invoice becomes paid when nothing is left.
-- ---------------------------------------------------------------
create or replace function public.record_installment(
    p_payment_id uuid,
    p_amount numeric,
    p_method text,
    p_reference text,
    p_note text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_payment public.payments;
    v_total numeric(12, 2);
    v_balance numeric(12, 2);
    v_amount numeric(12, 2) := round(coalesce(p_amount, 0), 2);
    v_left numeric(12, 2);
    v_id uuid;
begin
    if not public.is_admin() then
        raise exception 'Only an admin can record a payment';
    end if;

    select * into v_payment from public.payments where id = p_payment_id for update;

    if not found then
        raise exception 'Invoice not found';
    end if;

    v_total := v_payment.amount + v_payment.arrears;
    v_balance := v_total - v_payment.amount_paid;

    if v_payment.status = 'paid' or v_balance <= 0 then
        raise exception 'This invoice is already paid in full';
    end if;

    if v_amount <= 0 then
        raise exception 'Enter an amount greater than zero';
    end if;

    if v_amount > v_balance then
        raise exception 'That is more than the balance of %', v_balance;
    end if;

    v_left := v_balance - v_amount;

    insert into public.payment_installments (payment_id, amount, balance_after, method, reference, note, recorded_by)
    values (
        p_payment_id, v_amount, v_left,
        nullif(left(coalesce(p_method, ''), 40), ''),
        nullif(left(coalesce(p_reference, ''), 120), ''),
        nullif(left(coalesce(p_note, ''), 300), ''),
        auth.uid()
    )
    returning id into v_id;

    update public.payments
    set amount_paid = v_payment.amount_paid + v_amount,
        status = case when v_left = 0 then 'paid' else status end,
        paid_at = case when v_left = 0 then now() else paid_at end,
        payment_method = case when v_left = 0 then nullif(left(coalesce(p_method, ''), 40), '') else payment_method end,
        payment_reference = case when v_left = 0 then nullif(left(coalesce(p_reference, ''), 120), '') else payment_reference end,
        -- The admin has now looked at what the customer reported.
        transfer_reported_at = null
    where id = p_payment_id;

    return jsonb_build_object('installment_id', v_id, 'balance', v_left, 'paid', v_left = 0);
end;
$$;

revoke execute on function public.record_installment(uuid, numeric, text, text, text) from public, anon;
grant execute on function public.record_installment(uuid, numeric, text, text, text) to authenticated;

-- ---------------------------------------------------------------
-- 5. Undo a payment that was entered by mistake.
-- ---------------------------------------------------------------
create or replace function public.void_installment(p_installment_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_payment_id uuid;
    v_total numeric(12, 2);
    v_paid numeric(12, 2);
begin
    if not public.is_admin() then
        raise exception 'Only an admin can remove a payment';
    end if;

    select payment_id into v_payment_id from public.payment_installments where id = p_installment_id;

    if v_payment_id is null then
        raise exception 'Payment not found';
    end if;

    perform 1 from public.payments where id = v_payment_id for update;

    delete from public.payment_installments where id = p_installment_id;

    select coalesce(sum(amount), 0) into v_paid from public.payment_installments where payment_id = v_payment_id;

    -- What was owed after each remaining payment changes now, so recompute them.
    select amount + arrears into v_total from public.payments where id = v_payment_id;

    update public.payment_installments i
    set balance_after = greatest(
        v_total - (
            select coalesce(sum(j.amount), 0)
            from public.payment_installments j
            where j.payment_id = i.payment_id and (j.paid_at, j.id) <= (i.paid_at, i.id)
        ),
        0
    )
    where i.payment_id = v_payment_id;

    update public.payments
    set amount_paid = v_paid,
        status = case when v_paid >= v_total then 'paid' else 'pending' end,
        paid_at = case when v_paid >= v_total then paid_at else null end,
        payment_method = case when v_paid >= v_total then payment_method else null end,
        payment_reference = case when v_paid >= v_total then payment_reference else null end
    where id = v_payment_id;

    return jsonb_build_object('balance', greatest(v_total - v_paid, 0));
end;
$$;

revoke execute on function public.void_installment(uuid) from public, anon;
grant execute on function public.void_installment(uuid) to authenticated;

-- ============================================================
-- Notification bell
-- (also in supabase/notifications-2026-09.sql for the live project)
-- ============================================================
-- notify too. If you run this one first, run it again afterwards.

-- ---------------------------------------------------------------
-- 1. The notifications themselves
-- ---------------------------------------------------------------
create table if not exists public.notifications (
    id uuid primary key default gen_random_uuid(),
    recipient_id uuid not null references public.profiles (id) on delete cascade,
    kind text not null,
    title text not null,
    body text,
    -- Where the bell takes you when you tap it.
    href text,
    -- The thing it is about, for example the message thread it belongs to.
    ref_id uuid,
    -- Stops a burst (ten photos, a week of pickups) from ringing ten times.
    dedupe_key text,
    created_at timestamptz not null default now(),
    read_at timestamptz
);

create index if not exists notifications_recipient_idx on public.notifications (recipient_id, created_at desc);
create index if not exists notifications_unread_idx on public.notifications (recipient_id) where read_at is null;

alter table public.notifications enable row level security;

drop policy if exists "notifications_select_own" on public.notifications;
create policy "notifications_select_own" on public.notifications
    for select to authenticated using (recipient_id = auth.uid());

drop policy if exists "notifications_update_own" on public.notifications;
create policy "notifications_update_own" on public.notifications
    for update to authenticated using (recipient_id = auth.uid()) with check (recipient_id = auth.uid());

drop policy if exists "notifications_delete_own" on public.notifications;
create policy "notifications_delete_own" on public.notifications
    for delete to authenticated using (recipient_id = auth.uid());

-- Live updates to the bell.
do $$
begin
    alter publication supabase_realtime add table public.notifications;
exception
    when duplicate_object then null;
end
$$;

-- ---------------------------------------------------------------
-- 2. Helpers the triggers use. Nobody calls these from the app.
-- ---------------------------------------------------------------
create or replace function public.notify(
    p_recipient uuid,
    p_kind text,
    p_title text,
    p_body text,
    p_href text,
    p_ref uuid default null,
    p_dedupe text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
    if p_recipient is null then
        return;
    end if;

    if p_dedupe is not null and exists (
        select 1 from public.notifications
        where recipient_id = p_recipient
          and dedupe_key = p_dedupe
          and created_at > now() - interval '10 minutes'
    ) then
        return;
    end if;

    insert into public.notifications (recipient_id, kind, title, body, href, ref_id, dedupe_key)
    values (p_recipient, p_kind, left(p_title, 200), left(p_body, 300), p_href, p_ref, p_dedupe);
end;
$$;

create or replace function public.notify_admins(
    p_kind text,
    p_title text,
    p_body text,
    p_href text,
    p_ref uuid default null,
    p_dedupe text default null,
    p_owners_only boolean default false,
    p_except uuid default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
    v_admin uuid;
begin
    for v_admin in
        select id from public.profiles
        where role = 'admin'
          and status = 'approved'
          and (not p_owners_only or coalesce(is_owner, false))
          and (p_except is null or id <> p_except)
    loop
        perform public.notify(v_admin, p_kind, p_title, p_body, p_href, p_ref, p_dedupe);
    end loop;
end;
$$;

revoke execute on function public.notify(uuid, text, text, text, text, uuid, text) from public, anon, authenticated;
revoke execute on function public.notify_admins(text, text, text, text, uuid, text, boolean, uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------
-- 3. Triggers. Every one swallows its own errors, so a problem here can
--    never stop a message, invoice or task from being saved.
-- ---------------------------------------------------------------

-- Messages (and announcements)
create or replace function public.trg_notify_message()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
    v_from text;
    v_role text;
begin
    begin
        if new.to_profile_id is null or new.to_profile_id = new.from_profile_id then
            return new;
        end if;

        select full_name into v_from from public.profiles where id = new.from_profile_id;
        select role into v_role from public.profiles where id = new.to_profile_id;

        perform public.notify(
            new.to_profile_id,
            'message',
            case when coalesce(new.is_broadcast, false)
                 then 'Announcement: ' || coalesce(new.subject, '')
                 else 'New message from ' || coalesce(v_from, 'someone') end,
            coalesce(new.subject, ''),
            '/' || coalesce(v_role, 'customer') || '/messages',
            coalesce(new.parent_message_id, new.id)
        );
    exception when others then
        null;
    end;
    return new;
end;
$$;

drop trigger if exists notify_on_message on public.messages;
create trigger notify_on_message after insert on public.messages
    for each row execute function public.trg_notify_message();

-- Invoices
create or replace function public.trg_notify_invoice()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
    v_name text;
begin
    begin
        select full_name into v_name from public.profiles where id = new.customer_id;

        perform public.notify(
            new.customer_id, 'invoice',
            'New invoice: ₦' || to_char(new.amount + new.arrears, 'FM999,999,999'),
            coalesce(new.invoice_month, ''),
            '/customer/invoices/' || new.id, new.id
        );

        perform public.notify_admins(
            'invoice', 'New invoice generated',
            coalesce(v_name, 'A customer') || ' · ₦' || to_char(new.amount + new.arrears, 'FM999,999,999'),
            '/admin/payments', new.id, 'invoice-batch'
        );
    exception when others then
        null;
    end;
    return new;
end;
$$;

drop trigger if exists notify_on_invoice on public.payments;
create trigger notify_on_invoice after insert on public.payments
    for each row execute function public.trg_notify_invoice();

-- A customer says they paid by transfer
create or replace function public.trg_notify_transfer_reported()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
    v_name text;
begin
    begin
        if new.transfer_reported_at is not null and new.transfer_reported_at is distinct from old.transfer_reported_at then
            select full_name into v_name from public.profiles where id = new.customer_id;

            perform public.notify_admins(
                'payment', 'Payment reported by ' || coalesce(v_name, 'a customer'),
                coalesce(new.invoice_month, 'Invoice') || ' · check and confirm',
                '/admin/payments', new.id
            );
        end if;
    exception when others then
        null;
    end;
    return new;
end;
$$;

drop trigger if exists notify_on_transfer_reported on public.payments;
create trigger notify_on_transfer_reported after update of transfer_reported_at on public.payments
    for each row execute function public.trg_notify_transfer_reported();

-- Tasks
create or replace function public.trg_notify_task_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
    begin
        if new.employee_id is not null then
            perform public.notify(
                new.employee_id, 'task', 'New task assigned',
                new.title || coalesce(' · ' || to_char(new.scheduled_date, 'DD Mon'), ''),
                '/employee/tasks', new.id
            );
        end if;

        if new.customer_id is not null then
            if new.auto_generated then
                perform public.notify(
                    new.customer_id, 'task', 'Your pickup schedule was updated',
                    'New pickups have been scheduled for you',
                    '/customer/schedule', null, 'schedule:' || new.customer_id
                );
            else
                perform public.notify(
                    new.customer_id, 'task', 'Pickup scheduled',
                    new.title || coalesce(' · ' || to_char(new.scheduled_date, 'DD Mon'), ''),
                    '/customer/schedule', new.id
                );
            end if;
        end if;
    exception when others then
        null;
    end;
    return new;
end;
$$;

drop trigger if exists notify_on_task_insert on public.tasks;
create trigger notify_on_task_insert after insert on public.tasks
    for each row execute function public.trg_notify_task_insert();

create or replace function public.trg_notify_task_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
    begin
        if new.employee_id is not null and new.employee_id is distinct from old.employee_id then
            perform public.notify(
                new.employee_id, 'task', 'Task assigned to you',
                new.title || coalesce(' · ' || to_char(new.scheduled_date, 'DD Mon'), ''),
                '/employee/tasks', new.id
            );
            perform public.notify(
                new.customer_id, 'task', 'Your pickup has been assigned',
                new.title || coalesce(' · ' || to_char(new.scheduled_date, 'DD Mon'), ''),
                '/customer/schedule', new.id
            );
        end if;

        if new.scheduled_date is distinct from old.scheduled_date and new.scheduled_date is not null then
            perform public.notify(
                new.customer_id, 'task', 'Pickup date changed',
                new.title || ' · now ' || to_char(new.scheduled_date, 'DD Mon'),
                '/customer/schedule', new.id
            );
            perform public.notify(
                new.employee_id, 'task', 'Task date changed',
                new.title || ' · now ' || to_char(new.scheduled_date, 'DD Mon'),
                '/employee/tasks', new.id
            );
        end if;

        -- Pickups marked serviced because their date passed do not ring anyone.
        -- A reopened pickup has its own notification, so it is left out here.
        if new.status is distinct from old.status
           and not (new.status = 'completed' and new.scheduled_date is not null
                    and new.scheduled_date < (now() at time zone 'Africa/Lagos')::date)
           and not (old.status = 'completed' and new.status = 'pending') then
            perform public.notify(
                new.customer_id, 'task',
                case new.status when 'in progress' then 'Your pickup is under way'
                                when 'completed' then 'Your pickup is done'
                                else 'Pickup ' || new.status end,
                new.title, '/customer/schedule', new.id
            );
            perform public.notify_admins(
                'task', 'Task ' || new.status, new.title, '/admin/tasks', new.id
            );
        end if;
    exception when others then
        null;
    end;
    return new;
end;
$$;

drop trigger if exists notify_on_task_update on public.tasks;
create trigger notify_on_task_update after update on public.tasks
    for each row execute function public.trg_notify_task_update();

-- Photos uploaded
create or replace function public.trg_notify_upload()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
    v_key text := 'photos:' || coalesce(new.customer_id::text, '') || ':' || coalesce(new.task_title, '') || ':' || coalesce(new.photo_type, '');
begin
    begin
        perform public.notify(
            new.customer_id, 'photos', 'New ' || coalesce(new.photo_type, '') || ' photos uploaded',
            coalesce(new.task_title, ''), '/customer/schedule', null, v_key
        );
        perform public.notify_admins(
            'photos', 'New ' || coalesce(new.photo_type, '') || ' photos uploaded',
            coalesce(new.task_title, ''), '/admin/uploads', null, v_key
        );
    exception when others then
        null;
    end;
    return new;
end;
$$;

drop trigger if exists notify_on_upload on public.uploads;
create trigger notify_on_upload after insert on public.uploads
    for each row execute function public.trg_notify_upload();

-- New signups waiting for approval
create or replace function public.trg_notify_signup()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
    begin
        if new.role in ('customer', 'employee') and new.status = 'pending' then
            perform public.notify_admins(
                'signup', 'New signup awaiting approval',
                coalesce(new.full_name, new.email, 'Someone') || ' (' || new.role || ')',
                '/admin/approvals', new.id
            );
        end if;
    exception when others then
        null;
    end;
    return new;
end;
$$;

drop trigger if exists notify_on_signup on public.profiles;
create trigger notify_on_signup after insert on public.profiles
    for each row execute function public.trg_notify_signup();

-- Registration fee: reported by the customer, confirmed by an admin
create or replace function public.trg_notify_registration_fee()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
    v_name text;
begin
    begin
        if new.registration_fee_submitted_at is not null
           and new.registration_fee_submitted_at is distinct from old.registration_fee_submitted_at
           and not new.registration_fee_paid then
            select full_name into v_name from public.profiles where id = new.profile_id;

            perform public.notify_admins(
                'payment', 'Registration fee reported by ' || coalesce(v_name, 'a customer'),
                'Check and confirm it', '/admin/payments#registration-fees', new.profile_id
            );
        end if;

        if new.registration_fee_paid and not old.registration_fee_paid then
            perform public.notify(new.profile_id, 'payment', 'Registration fee confirmed', 'Your dashboard is open', '/customer', new.profile_id);
        end if;
    exception when others then
        null;
    end;
    return new;
end;
$$;

drop trigger if exists notify_on_registration_fee on public.customers;
create trigger notify_on_registration_fee after update of registration_fee_submitted_at, registration_fee_paid on public.customers
    for each row execute function public.trg_notify_registration_fee();

-- ---------------------------------------------------------------
-- 4. Triggers on tables that may not exist yet
-- ---------------------------------------------------------------

-- Receipts: a payment recorded against an invoice
create or replace function public.trg_notify_receipt()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
    v_customer uuid;
begin
    begin
        select customer_id into v_customer from public.payments where id = new.payment_id;

        perform public.notify(
            v_customer, 'receipt',
            'Receipt ready: ₦' || to_char(new.amount, 'FM999,999,999') || ' received',
            case when new.balance_after = 0 then 'Your invoice is paid in full'
                 else '₦' || to_char(new.balance_after, 'FM999,999,999') || ' is still owed' end,
            '/customer/receipts/' || new.id, new.id
        );
    exception when others then
        null;
    end;
    return new;
end;
$$;

create or replace function public.trg_notify_expense()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
    v_name text;
begin
    begin
        if tg_op = 'INSERT' then
            select full_name into v_name from public.profiles where id = new.employee_id;

            perform public.notify_admins(
                'expense', 'New expense from ' || coalesce(v_name, 'staff'),
                '₦' || to_char(new.amount, 'FM999,999,999') || ' · ' || new.category, '/admin/expenses', new.id
            );
        elsif new.status is distinct from old.status then
            perform public.notify(
                new.employee_id, 'expense', 'Expense ' || new.status,
                '₦' || to_char(new.amount, 'FM999,999,999') || ' · ' || new.category, '/employee/expenses', new.id
            );
        end if;
    exception when others then
        null;
    end;
    return new;
end;
$$;

-- What admins change, for owners to follow along
create or replace function public.trg_notify_activity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
    begin
        perform public.notify_admins(
            'activity', coalesce(new.actor_name, 'An admin'), new.summary,
            '/admin/activity', null, null, true, new.actor_id
        );
    exception when others then
        null;
    end;
    return new;
end;
$$;

do $$
begin
    if to_regclass('public.payment_installments') is not null then
        drop trigger if exists notify_on_receipt on public.payment_installments;
        create trigger notify_on_receipt after insert on public.payment_installments
            for each row execute function public.trg_notify_receipt();
    end if;

    if to_regclass('public.expenses') is not null then
        drop trigger if exists notify_on_expense on public.expenses;
        create trigger notify_on_expense after insert or update of status on public.expenses
            for each row execute function public.trg_notify_expense();
    end if;

    if to_regclass('public.activity_log') is not null then
        drop trigger if exists notify_on_activity on public.activity_log;
        create trigger notify_on_activity after insert on public.activity_log
            for each row execute function public.trg_notify_activity();
    end if;
end
$$;

select 'done' as result;

-- ============================================================
-- Task crews and past pickups marked serviced
-- (also in supabase/tasks-crew-2026-09.sql for the live project)
-- ============================================================

-- ---------------------------------------------------------------
-- 1. The rest of the crew. tasks.employee_id stays the lead; anyone else on the
--    job is listed here.
-- ---------------------------------------------------------------
create table if not exists public.task_crew (
    task_id uuid not null references public.tasks (id) on delete cascade,
    employee_id uuid not null references public.profiles (id) on delete cascade,
    created_at timestamptz not null default now(),
    primary key (task_id, employee_id)
);

create index if not exists task_crew_employee_idx on public.task_crew (employee_id);

alter table public.task_crew enable row level security;

drop policy if exists "task_crew_select_own" on public.task_crew;
create policy "task_crew_select_own" on public.task_crew
    for select to authenticated using (employee_id = auth.uid());

drop policy if exists "task_crew_select_reader" on public.task_crew;
create policy "task_crew_select_reader" on public.task_crew
    for select to authenticated using (public.is_staff_reader());

drop policy if exists "task_crew_write_admin" on public.task_crew;
create policy "task_crew_write_admin" on public.task_crew
    for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------
-- 2. Crew members see and work on the task, like the lead does
-- ---------------------------------------------------------------
drop policy if exists "tasks_select_crew" on public.tasks;
create policy "tasks_select_crew" on public.tasks
    for select to authenticated using (
        exists (select 1 from public.task_crew c where c.task_id = tasks.id and c.employee_id = auth.uid())
    );

drop policy if exists "tasks_update_crew" on public.tasks;
create policy "tasks_update_crew" on public.tasks
    for update to authenticated
    using (exists (select 1 from public.task_crew c where c.task_id = tasks.id and c.employee_id = auth.uid()))
    with check (exists (select 1 from public.task_crew c where c.task_id = tasks.id and c.employee_id = auth.uid()));

-- Photos taken by anyone on the job are visible to everyone on the job.
drop policy if exists "uploads_select_task_team" on public.uploads;
create policy "uploads_select_task_team" on public.uploads
    for select to authenticated using (
        exists (
            select 1 from public.tasks t
            where t.id = uploads.task_id
              and (
                  t.employee_id = auth.uid()
                  or exists (select 1 from public.task_crew c where c.task_id = t.id and c.employee_id = auth.uid())
              )
        )
    );

-- ---------------------------------------------------------------
-- 3. Messaging: a crew member can write to the customer of a shared task
-- ---------------------------------------------------------------
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
    where (
            t.employee_id = auth.uid()
            or exists (select 1 from public.task_crew c where c.task_id = t.id and c.employee_id = auth.uid())
          )
      and p.role = 'customer'
      and p.status = 'approved'
    order by p.full_name;
$$;

revoke execute on function public.my_customer_contacts() from public, anon;
grant execute on function public.my_customer_contacts() to authenticated;

drop policy if exists "messages_insert_employee_customer" on public.messages;
create policy "messages_insert_employee_customer" on public.messages
    for insert to authenticated
    with check (
        auth.uid() = from_profile_id
        and exists (
            select 1 from public.tasks t
            where (
                    (
                        (t.employee_id = from_profile_id
                         or exists (select 1 from public.task_crew c where c.task_id = t.id and c.employee_id = from_profile_id))
                        and t.customer_id = to_profile_id
                    )
                    or (
                        t.customer_id = from_profile_id
                        and (t.employee_id = to_profile_id
                             or exists (select 1 from public.task_crew c where c.task_id = t.id and c.employee_id = to_profile_id))
                    )
                  )
        )
        and (
            parent_message_id is null
            or not exists (
                select 1 from public.messages root
                where root.id = parent_message_id and root.is_broadcast
            )
        )
    );

-- ---------------------------------------------------------------
-- 4. Who is on each task, by name. Employees and customers cannot read other
--    people's profiles, so this hands back only the names for tasks the caller
--    is on (or the customer of), and everything to admins.
-- ---------------------------------------------------------------
create or replace function public.task_team(p_task_ids uuid[])
returns table (task_id uuid, employee_id uuid, full_name text, is_lead boolean)
language sql
security definer
set search_path = public
stable
as $$
    with allowed as (
        select t.id, t.employee_id as lead_id
        from public.tasks t
        where t.id = any (p_task_ids)
          and (
              public.is_staff_reader()
              or t.customer_id = auth.uid()
              or t.employee_id = auth.uid()
              or exists (select 1 from public.task_crew c where c.task_id = t.id and c.employee_id = auth.uid())
          )
    ),
    everyone as (
        select a.id as task_id, a.lead_id as employee_id, true as is_lead
        from allowed a
        where a.lead_id is not null
        union
        select c.task_id, c.employee_id, false
        from public.task_crew c
        join allowed a on a.id = c.task_id
    )
    select e.task_id, e.employee_id, p.full_name, e.is_lead
    from everyone e
    join public.profiles p on p.id = e.employee_id
    order by e.task_id, e.is_lead desc, p.full_name;
$$;

revoke execute on function public.task_team(uuid[]) from public, anon;
grant execute on function public.task_team(uuid[]) to authenticated;

-- ---------------------------------------------------------------
-- 5. Pickups whose date has passed are marked serviced. Called by the daily job
--    and whenever an admin opens the Tasks page. Returns how many it changed.
-- ---------------------------------------------------------------
create or replace function public.mark_past_tasks_serviced()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
    v_count integer;
begin
    if not (public.is_admin() or auth.role() = 'service_role') then
        raise exception 'Only an admin can do this';
    end if;

    update public.tasks
    set status = 'completed',
        started_at = coalesce(started_at, (scheduled_date::timestamp + time '08:00') at time zone 'Africa/Lagos'),
        completed_at = coalesce(completed_at, (scheduled_date::timestamp + time '17:00') at time zone 'Africa/Lagos')
    where status in ('pending', 'in progress')
      and scheduled_date is not null
      and scheduled_date < (now() at time zone 'Africa/Lagos')::date;

    get diagnostics v_count = row_count;
    return v_count;
end;
$$;

revoke execute on function public.mark_past_tasks_serviced() from public, anon;
grant execute on function public.mark_past_tasks_serviced() to authenticated, service_role;

-- ---------------------------------------------------------------
-- 6. Tell a crew member when they are put on a task
-- ---------------------------------------------------------------
create or replace function public.trg_notify_crew()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
    v_title text;
    v_date date;
begin
    begin
        select title, scheduled_date into v_title, v_date from public.tasks where id = new.task_id;

        perform public.notify(
            new.employee_id, 'task', 'You have been added to a task',
            coalesce(v_title, 'Task') || coalesce(' · ' || to_char(v_date, 'DD Mon'), ''),
            '/employee/tasks', new.task_id
        );
    exception when others then
        null;
    end;
    return new;
end;
$$;

drop trigger if exists notify_on_crew on public.task_crew;
create trigger notify_on_crew after insert on public.task_crew
    for each row execute function public.trg_notify_crew();

select 'done' as result;

-- ============================================================
-- Pickup days per customer and reopened pickups
-- (also in supabase/schedule-days-2026-09.sql for the live project)
-- ============================================================

-- ---------------------------------------------------------------
-- 1. The days of the week a customer is picked up (1 = Monday ... 6 = Saturday).
--    Empty means "use the frequency they wrote in their property details".
-- ---------------------------------------------------------------
alter table public.customers
    add column if not exists pickup_days integer[]
        check (pickup_days is null or pickup_days <@ array[1, 2, 3, 4, 5, 6]);

-- ---------------------------------------------------------------
-- 2. A pickup an admin has reopened must stay open
-- ---------------------------------------------------------------
alter table public.tasks
    add column if not exists reopened_at timestamptz,
    add column if not exists reopened_by uuid references public.profiles (id) on delete set null;

-- Past pickups are marked serviced, except ones an admin has reopened.
create or replace function public.mark_past_tasks_serviced()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
    v_count integer;
begin
    if not (public.is_admin() or auth.role() = 'service_role') then
        raise exception 'Only an admin can do this';
    end if;

    update public.tasks
    set status = 'completed',
        started_at = coalesce(started_at, (scheduled_date::timestamp + time '08:00') at time zone 'Africa/Lagos'),
        completed_at = coalesce(completed_at, (scheduled_date::timestamp + time '17:00') at time zone 'Africa/Lagos')
    where status in ('pending', 'in progress')
      and reopened_at is null
      and scheduled_date is not null
      and scheduled_date < (now() at time zone 'Africa/Lagos')::date;

    get diagnostics v_count = row_count;
    return v_count;
end;
$$;

revoke execute on function public.mark_past_tasks_serviced() from public, anon;
grant execute on function public.mark_past_tasks_serviced() to authenticated, service_role;

-- ---------------------------------------------------------------
-- 3. Tell the crew and the customer when a serviced pickup is reopened
-- ---------------------------------------------------------------
create or replace function public.trg_notify_task_reopened()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
    begin
        if new.reopened_at is not null and new.reopened_at is distinct from old.reopened_at then
            perform public.notify(
                new.employee_id, 'task', 'A pickup was reopened',
                new.title || ' was marked not done by an admin' || coalesce(' · ' || to_char(new.scheduled_date, 'DD Mon'), ''),
                '/employee/tasks', new.id
            );

            if to_regclass('public.task_crew') is not null then
                perform public.notify(c.employee_id, 'task', 'A pickup was reopened',
                    new.title || ' was marked not done by an admin', '/employee/tasks', new.id)
                from public.task_crew c
                where c.task_id = new.id;
            end if;

            perform public.notify(
                new.customer_id, 'task', 'Your pickup is still to be done',
                new.title || coalesce(' · ' || to_char(new.scheduled_date, 'DD Mon'), ''),
                '/customer/schedule', new.id
            );
        end if;
    exception when others then
        null;
    end;
    return new;
end;
$$;

drop trigger if exists notify_on_task_reopened on public.tasks;
create trigger notify_on_task_reopened after update of reopened_at on public.tasks
    for each row execute function public.trg_notify_task_reopened();

select 'done' as result;
