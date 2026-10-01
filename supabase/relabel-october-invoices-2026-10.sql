-- Relabels the automatic invoices made in October 2026 before the 25th as
-- September 2026, the month they are for now that invoices switch over on the
-- 25th. Receipts have no month of their own: they show the month and
-- description of their invoice, so they follow automatically.
-- Run it in the Supabase SQL editor, ONE STEP AT A TIME.
--
-- Only automatic invoices are relabelled. Invoices an admin made or edited by
-- hand keep the month the admin gave them.

-- ---------------------------------------------------------------
-- STEP 1. Look first. Nothing is changed by this step.
--   will_relabel = true: changes to September 2026.
--   will_relabel = false: the customer already has a September 2026 invoice,
--   so relabelling would bill them twice for September. Left alone; check
--   these on the Payments page (one of the two may need removing or editing).
-- ---------------------------------------------------------------
select
    coalesce(c.full_name, p.bill_to ->> 'full_name') as customer,
    p.invoice_month,
    p.description,
    p.amount,
    p.status,
    coalesce(p.amount_paid, 0) as amount_paid,
    p.created_at,
    (select count(*) from public.payment_installments i where i.payment_id = p.id) as receipts,
    not exists (
        select 1 from public.payments s
        where s.customer_id = p.customer_id
          and s.id <> p.id
          and (s.invoice_month = 'September 2026' or 'September 2026' = any (coalesce(s.covered_months, '{}')))
    ) as will_relabel
from public.payments p
left join public.customers c on c.profile_id = p.customer_id
where p.invoice_month = 'October 2026'
  and p.auto_generated
  and p.created_at < '2026-10-25T00:00:00+01:00'
order by will_relabel desc, customer;

-- ---------------------------------------------------------------
-- STEP 2. Relabel. Remove the two dashes in front of every line below, then
-- run it. It is all or nothing: if any part fails, nothing is changed.
-- ---------------------------------------------------------------
-- begin;
--
-- update public.payments p
-- set invoice_month = 'September 2026',
--     description = replace(p.description, 'October 2026', 'September 2026')
-- where p.invoice_month = 'October 2026'
--   and p.auto_generated
--   and p.created_at < '2026-10-25T00:00:00+01:00'
--   and not exists (
--       select 1 from public.payments s
--       where s.customer_id = p.customer_id
--         and s.id <> p.id
--         and (s.invoice_month = 'September 2026' or 'September 2026' = any (coalesce(s.covered_months, '{}')))
--   );
--
-- commit;
--
-- -- Then check: should be 0 unless step 1 listed some as will_relabel = false.
-- select count(*) as october_left
-- from public.payments
-- where invoice_month = 'October 2026' and auto_generated and created_at < '2026-10-25T00:00:00+01:00';
