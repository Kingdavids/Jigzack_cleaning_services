-- Adds the recyclables expense categories: "Recyclables bought" for cash paid out
-- for material, and Recyclables transport, loading and offloading, gate and
-- security, and other costs for handling it. All count as money out and as costs
-- in the recyclables profit.
-- Log each purchase once: either here, or on the Recyclables page with a price
-- per kilogram, not both. Run supabase/declined-and-expenses-2026-09.sql first.
-- Safe to run more than once. Run it in the Supabase SQL editor.

-- Stops here with a plain message if expenses were never switched on.
do $$
begin
    if to_regclass('public.expenses') is null then
        raise exception 'Run supabase/declined-and-expenses-2026-09.sql first. It creates the expenses table this file changes.';
    end if;
end $$;

alter table public.expenses drop constraint if exists expenses_category_check;
alter table public.expenses
    add constraint expenses_category_check
    check (category in ('fuel', 'transport', 'repairs', 'supplies', 'meals', 'recyclables', 'recyclables_transport', 'recyclables_loading', 'recyclables_gate', 'recyclables_other', 'other'));

select 'done' as result;
