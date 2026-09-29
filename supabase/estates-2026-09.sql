-- Estates and their units, the table that the "Estates" admin page and the
-- unit-pricing feature both depend on. This should have existed on the live
-- project already; whatever the reason it does not, this creates it (and
-- everything it needs) safely, without touching anything that already exists.
-- Safe to run more than once. Run it in the Supabase SQL editor, before
-- estate-unit-pricing-2026-09.sql (which gives each unit its own price).
--
-- An estate is a customers row (is_estate = true) that receives one shared
-- utility bill through the existing payments and tasks flow, unchanged. A
-- tenant is a separate customer account linked to a unit under that estate via
-- customers.unit_id, giving them read access to the estate's bill without a
-- payments row of their own.

create table if not exists public.units (
    id uuid primary key default gen_random_uuid(),
    estate_profile_id uuid not null references public.profiles (id) on delete cascade,
    label text not null,
    created_at timestamptz not null default now()
);

alter table public.customers add column if not exists is_estate boolean not null default false;
alter table public.customers add column if not exists unit_id uuid references public.units (id) on delete set null;

alter table public.units enable row level security;

drop policy if exists "units_select_estate_owner" on public.units;
create policy "units_select_estate_owner" on public.units
    for select using (auth.uid() = estate_profile_id);

drop policy if exists "units_select_tenant" on public.units;
create policy "units_select_tenant" on public.units
    for select using (
        exists (
            select 1 from public.customers
            where customers.profile_id = auth.uid() and customers.unit_id = units.id
        )
    );

drop policy if exists "units_all_admin" on public.units;
create policy "units_all_admin" on public.units
    for all using (public.is_admin()) with check (public.is_admin());

-- A view-only supervisor can see units too, same as everywhere else. Only
-- added if admins-activity-2026-09.sql (which defines is_staff_reader) has
-- already been run; otherwise this is skipped for now and picked up the next
-- time that file runs.
do $$
begin
    if to_regprocedure('public.is_staff_reader()') is not null then
        drop policy if exists "units_select_reader" on public.units;
        create policy "units_select_reader" on public.units for select using (public.is_staff_reader());
    end if;
end
$$;

-- A tenant's invoice shows their estate's property details, so they need to
-- read that one row. Done through a SECURITY DEFINER function because a
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

drop policy if exists "customers_select_tenant_estate" on public.customers;
create policy "customers_select_tenant_estate" on public.customers
    for select using (profile_id = public.tenant_estate_profile_id());

-- A tenant can also see their estate's invoices, the same way, so their
-- "shared utility bill" page has something to show.
drop policy if exists "payments_select_tenant" on public.payments;
create policy "payments_select_tenant" on public.payments
    for select using (
        exists (
            select 1 from public.customers c
            join public.units u on u.id = c.unit_id
            where c.profile_id = auth.uid() and u.estate_profile_id = payments.customer_id
        )
    );

select 'done' as result;
