-- Individual pricing for estate units. Once every unit belonging to an estate
-- has a property type, that estate's monthly invoice is built by adding up
-- each unit's own price instead of the single count on its property form. A
-- unit can also be given a custom price of its own, different from the
-- standard price for its type. Until every unit has a type, nothing changes:
-- the estate keeps being billed the old way, so no estate is ever under-billed
-- mid-migration. Safe to run more than once. Run it in the Supabase SQL editor.

alter table public.units
    add column if not exists property_type text
        check (
            property_type is null
            or property_type in ('duplexCount', 'flatsCount', 'miniFlatsCount', 'bungalowCount', 'terraceCount', 'shopsCount')
        ),
    add column if not exists monthly_rate numeric(12, 2) check (monthly_rate is null or monthly_rate > 0),
    add column if not exists is_vacant boolean not null default false;

select 'done' as result;
