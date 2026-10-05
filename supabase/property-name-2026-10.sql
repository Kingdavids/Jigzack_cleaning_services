-- A property's own name, such as "Grace Hotel", for commercial customers.
-- When it is set, invoices and receipts print it as the account holder
-- instead of the person's name. Safe to run more than once. Run it in the
-- Supabase SQL editor.

alter table public.customers
    add column if not exists property_name text;

select 'done' as result;
