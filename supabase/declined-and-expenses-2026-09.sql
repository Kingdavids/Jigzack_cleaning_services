-- Run once in the Supabase SQL editor on the live project. Safe to run again.
-- 1. Remembers why an application was declined.
-- 2. Adds staff expenses, visible to the admin and to the staff member who logged them.

-- ---------------------------------------------------------------
-- 1. Declined applications
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

select 'done' as result;
