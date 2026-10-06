-- Adds "PET bottles" and "Cans" to the recyclable materials.
-- Run once in the Supabase SQL editor. Safe to run again.
do $$
declare
    c record;
begin
    for c in
        select conname from pg_constraint
        where conrelid = 'public.recyclable_movements'::regclass
          and contype = 'c'
          and pg_get_constraintdef(oid) like '%material%'
          and pg_get_constraintdef(oid) not like '%direction%'
    loop
        execute format('alter table public.recyclable_movements drop constraint %I', c.conname);
    end loop;

    alter table public.recyclable_movements
        add constraint recyclable_movements_material_check
        check (material in ('plastic', 'pet_bottles', 'cans', 'metal', 'paper', 'glass', 'electronics', 'other'));
end $$;

-- What we pay per kilogram when buying each material. Admins change these on
-- the recyclables page; the amounts below are only the starting prices.
create table if not exists public.recyclable_prices (
    material text primary key
        check (material in ('plastic', 'pet_bottles', 'cans', 'metal', 'paper', 'glass', 'electronics', 'other')),
    buy_price_per_kg numeric(12, 2) not null default 0 check (buy_price_per_kg >= 0),
    updated_at timestamptz not null default now()
);

alter table public.recyclable_prices enable row level security;

drop policy if exists "recyclable_prices_select_reader" on public.recyclable_prices;
create policy "recyclable_prices_select_reader" on public.recyclable_prices
    for select to authenticated using (public.is_staff_reader());

drop policy if exists "recyclable_prices_insert_admin" on public.recyclable_prices;
create policy "recyclable_prices_insert_admin" on public.recyclable_prices
    for insert to authenticated with check (public.is_admin());

drop policy if exists "recyclable_prices_update_admin" on public.recyclable_prices;
create policy "recyclable_prices_update_admin" on public.recyclable_prices
    for update to authenticated using (public.is_admin()) with check (public.is_admin());

insert into public.recyclable_prices (material, buy_price_per_kg) values
    ('plastic', 200), ('pet_bottles', 200), ('metal', 300), ('cans', 1000), ('paper', 100)
on conflict (material) do nothing;

select 'done' as result;
