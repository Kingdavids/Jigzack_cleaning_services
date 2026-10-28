-- A saved list of people who are not registered on the app but are billed every
-- month, each with the monthly charge to put on their invoice. The billing job
-- on the 25th creates their invoice along with the registered customers'.
-- Run supabase/non-customer-invoices-2026-10.sql first. Safe to run more than
-- once. Run it in the Supabase SQL editor.

-- Stops here with a plain message if invoices for people without an account were never switched on.
do $$
begin
    if not exists (
        select 1 from information_schema.columns
        where table_schema = 'public' and table_name = 'payments' and column_name = 'bill_to'
    ) then
        raise exception 'Run supabase/non-customer-invoices-2026-10.sql first. It lets an invoice be made out to someone without an account.';
    end if;
end $$;

create table if not exists public.unregistered_customers (
    id uuid primary key default gen_random_uuid(),
    full_name text not null,
    -- A commercial property's own name, printed on the invoice instead of full_name.
    property_name text,
    phone text,
    whatsapp_number text,
    email text,
    address text,
    landmark text,
    lga text,
    state text,
    property_type text,
    -- What goes on their invoice each month.
    monthly_rate numeric(12, 2) not null check (monthly_rate >= 0),
    -- While paused, the 25th job leaves them out. Nothing else changes.
    paused boolean not null default false,
    note text,
    created_by uuid references public.profiles (id) on delete set null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint unregistered_customers_reachable check (coalesce(trim(phone), '') <> '' or coalesce(trim(email), '') <> '')
);

create index if not exists unregistered_customers_name_idx on public.unregistered_customers (lower(full_name));

alter table public.unregistered_customers enable row level security;

drop policy if exists "unregistered_customers_select_reader" on public.unregistered_customers;
create policy "unregistered_customers_select_reader" on public.unregistered_customers
    for select to authenticated using (public.is_staff_reader());

drop policy if exists "unregistered_customers_write_admin" on public.unregistered_customers;
create policy "unregistered_customers_write_admin" on public.unregistered_customers
    for all to authenticated using (public.is_admin()) with check (public.is_admin());

select 'done' as result;
