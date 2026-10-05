-- Studio apartments as a residential unit type (₦5,000 a month, set in
-- lib/billing/pricing.ts). Customers' property details need nothing here;
-- this only lets an estate's individual units be given the studio type.
-- Safe to run more than once. Run it in the Supabase SQL editor.

alter table public.units drop constraint if exists units_property_type_check;

alter table public.units
    add constraint units_property_type_check check (
        property_type is null
        or property_type in ('duplexCount', 'flatsCount', 'miniFlatsCount', 'studioCount', 'bungalowCount', 'terraceCount', 'shopsCount')
    );

select 'done' as result;
