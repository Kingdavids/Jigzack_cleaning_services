-- A running arrears amount for a customer, set from their Billing section.
-- It lands on their current open invoice right away if one is still
-- untouched, or on the next invoice generated for them otherwise, and is
-- cleared automatically the moment it lands on an invoice so it is never
-- added twice. Safe to run more than once. Run it in the Supabase SQL editor.

alter table public.customers
    add column if not exists arrears numeric(12, 2) not null default 0 check (arrears >= 0);

select 'done' as result;
