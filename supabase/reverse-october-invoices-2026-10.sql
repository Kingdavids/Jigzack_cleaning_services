-- Reverses the automatic invoices for October 2026, created on 1 October
-- before invoices moved to the 25th. The 25 October run creates them again.
-- Run it in the Supabase SQL editor, ONE STEP AT A TIME.
--
-- Run this INSTEAD of step 2 of arrears-double-fix-2026-10.sql for October
-- invoices; that file can still be used afterwards for older months.

-- ---------------------------------------------------------------
-- STEP 1. Look first. Nothing is changed by this step.
--   will_delete = true: automatic, unpaid, nothing paid, no transfer reported.
--   will_delete = false: kept. Money was paid or the customer has reported a
--   bank transfer against it; deal with those by hand on the Payments page.
-- ---------------------------------------------------------------
select
    c.full_name,
    p.invoice_month,
    p.amount,
    p.arrears,
    p.status,
    coalesce(p.amount_paid, 0) as amount_paid,
    p.transfer_reported_at,
    p.created_at,
    (p.status <> 'paid' and coalesce(p.amount_paid, 0) = 0 and p.transfer_reported_at is null) as will_delete
from public.payments p
left join public.customers c on c.profile_id = p.customer_id
where p.invoice_month = 'October 2026'
  and p.auto_generated
order by will_delete desc, c.full_name;

-- ---------------------------------------------------------------
-- STEP 2. Reverse. Remove the two dashes in front of every line below, then
-- run it. It is all or nothing: if any part fails, nothing is changed.
-- ---------------------------------------------------------------
-- begin;
--
-- create temporary table reversed on commit drop as
-- select p.id, p.customer_id, p.arrears, p.created_at
-- from public.payments p
-- where p.invoice_month = 'October 2026'
--   and p.auto_generated
--   and p.status <> 'paid'
--   and coalesce(p.amount_paid, 0) = 0
--   and p.transfer_reported_at is null;
--
-- -- Arrears that were first charged on one of these invoices go back to
-- -- waiting, so the 25 October invoice charges them (once). Arrears that only
-- -- repeated an earlier invoice's are not put back.
-- update public.customers c
-- set arrears = r.arrears
-- from reversed r
-- where c.profile_id = r.customer_id
--   and r.arrears > 0
--   and c.arrears = 0
--   and not exists (
--       select 1 from public.payments e
--       where e.customer_id = r.customer_id
--         and e.arrears = r.arrears
--         and e.created_at < r.created_at
--         and e.id not in (select id from reversed)
--   );
--
-- -- The bell notifications about these invoices would point nowhere.
-- delete from public.notifications where ref_id in (select id from reversed);
--
-- delete from public.payments where id in (select id from reversed);
--
-- select count(*) as invoices_reversed from reversed;
--
-- commit;
