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

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
    insert into public.profiles (id, full_name, email, role, status)
    values (
        new.id,
        new.raw_user_meta_data ->> 'full_name',
        new.email,
        coalesce(new.raw_user_meta_data ->> 'role', 'customer'),
        'pending'
    );
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
    created_at timestamptz not null default now()
);

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
    created_at timestamptz not null default now()
);

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
insert into storage.buckets (id, name, public)
values ('task-photos', 'task-photos', true)
on conflict (id) do nothing;

create policy "task_photos_public_read" on storage.objects
    for select using (bucket_id = 'task-photos');

create policy "task_photos_employee_upload" on storage.objects
    for insert with check (
        bucket_id = 'task-photos'
        and (storage.foldername(name)) [1] = auth.uid()::text
    );

create policy "task_photos_employee_delete" on storage.objects
    for delete using (
        bucket_id = 'task-photos'
        and (storage.foldername(name)) [1] = auth.uid()::text
    );
