-- Lets one customer manage more than one billed property from a single
-- login, invited by an admin or the owner. Each additional property is still
-- its own real login underneath (Supabase requires a unique email per
-- login), created automatically with a system email the customer never sees
-- or uses; they always sign in with their own email and switch between
-- properties from their dashboard. Nothing here changes how a normal,
-- single-property customer works: every policy below only ever matches rows
-- that already have a property_links row, which nobody has unless invited.
-- Safe to run more than once. Run it in the Supabase SQL editor.

create table if not exists public.property_links (
    id uuid primary key default gen_random_uuid(),
    primary_profile_id uuid not null references public.profiles (id) on delete cascade,
    linked_profile_id uuid not null references public.profiles (id) on delete cascade,
    created_at timestamptz not null default now(),
    created_by uuid references public.profiles (id) on delete set null,
    unique (linked_profile_id)
);

create index if not exists property_links_primary_idx on public.property_links (primary_profile_id);

alter table public.property_links enable row level security;

drop policy if exists "property_links_select_primary" on public.property_links;
create policy "property_links_select_primary" on public.property_links
    for select using (auth.uid() = primary_profile_id);

drop policy if exists "property_links_all_admin" on public.property_links;
create policy "property_links_all_admin" on public.property_links
    for all using (public.is_admin()) with check (public.is_admin());

-- The set of linked-property logins a signed-in customer can act as the
-- primary for. Used by every policy below. Empty for everyone who was never
-- invited, which is the default for every existing and new customer.
create or replace function public.linked_profile_ids()
returns setof uuid
language sql
security definer
set search_path = public
stable
as $$
    select linked_profile_id from public.property_links where primary_profile_id = auth.uid();
$$;

-- A primary can see the details of a property they were invited to add.
drop policy if exists "customers_select_linked_property" on public.customers;
create policy "customers_select_linked_property" on public.customers
    for select using (profile_id in (select public.linked_profile_ids()));

-- Filling in that property's details goes through this function rather than a
-- plain RLS update policy, so a primary can only ever change these specific
-- fields on it (never, say, its own monthly charge, discount or fee status).
create or replace function public.update_linked_property_details(
    p_linked_profile_id uuid,
    p_full_name text,
    p_address text,
    p_lga text,
    p_state text,
    p_landmark text,
    p_property_type text,
    p_pickup_frequency text,
    p_facility_details jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
    if not exists (
        select 1 from public.property_links
        where primary_profile_id = auth.uid() and linked_profile_id = p_linked_profile_id
    ) then
        raise exception 'This property is not linked to your account';
    end if;

    update public.customers
    set
        full_name = p_full_name,
        address = p_address,
        lga = p_lga,
        state = p_state,
        landmark = p_landmark,
        property_type = p_property_type,
        preferred_pickup_frequency = p_pickup_frequency,
        facility_details = p_facility_details
    where profile_id = p_linked_profile_id;

    return jsonb_build_object('updated', true);
end;
$$;

revoke execute on function public.update_linked_property_details(uuid, text, text, text, text, text, text, text, jsonb) from public, anon;
grant execute on function public.update_linked_property_details(uuid, text, text, text, text, text, text, text, jsonb) to authenticated;

-- A primary can see a linked property's own invoices, receipts, schedule and photos.
drop policy if exists "payments_select_linked_property" on public.payments;
create policy "payments_select_linked_property" on public.payments
    for select using (customer_id in (select public.linked_profile_ids()));

drop policy if exists "tasks_select_linked_property" on public.tasks;
create policy "tasks_select_linked_property" on public.tasks
    for select using (customer_id in (select public.linked_profile_ids()));

drop policy if exists "uploads_select_linked_property" on public.uploads;
create policy "uploads_select_linked_property" on public.uploads
    for select using (customer_id in (select public.linked_profile_ids()));

-- Skipped only if prepayments-2026-09.sql (or equivalent) has not run yet.
do $$
begin
    if to_regclass('public.prepayments') is not null then
        drop policy if exists "prepayments_select_linked_property" on public.prepayments;
        create policy "prepayments_select_linked_property" on public.prepayments
            for select using (customer_id in (select public.linked_profile_ids()));
    end if;
end
$$;

select 'done' as result;
