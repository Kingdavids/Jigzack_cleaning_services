-- One estate unit row can now stand for more than one identical unit, so an
-- admin can price a whole block of, say, 44 duplexes in one go instead of
-- adding 44 separate rows: the row's price is multiplied by this count on the
-- invoice. Existing rows default to 1, exactly one unit each, unchanged.
-- Safe to run more than once. Run it in the Supabase SQL editor, after
-- estate-unit-pricing-2026-09.sql.

alter table public.units
    add column if not exists quantity integer not null default 1
        check (quantity > 0);

select 'done' as result;
