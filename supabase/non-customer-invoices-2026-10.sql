-- Invoices for someone who is not registered on the app. Such an invoice has
-- no customer_id; who it is for (name, phone, address and so on) is kept on
-- the invoice itself. Only admins can see or change these, as with every
-- invoice. Safe to run more than once. Run it in the Supabase SQL editor.

alter table public.payments
    add column if not exists bill_to jsonb;

select 'done' as result;
