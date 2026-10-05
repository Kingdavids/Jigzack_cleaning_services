-- Relabels every invoice marked "October 2026" that was made before 25
-- October as September 2026: automatic, one-off and unregistered alike. A
-- month is only billed from the 25th, so none of these should say October.
-- Receipts have no month of their own; they show their invoice's month and
-- description, so they follow automatically.
-- Run it in the Supabase SQL editor, ONE STEP AT A TIME.
--
-- Advance payments are not checked here: the prepayments table was never
-- created on the live project, so no customer has one recorded.

-- ---------------------------------------------------------------
-- STEP 1. Look first. Nothing is changed by this step.
--   action = 'relabel':  becomes September 2026.
--   action = 'check by hand: already has September':  this customer already
--     has a September 2026 invoice, so relabelling would bill September twice.
--     Left alone; remove or edit one of the two on the Payments page.
--   action = 'check by hand: several October invoices':  this customer has
--     more than one, which would all become September. Left alone; keep the
--     right one and remove or edit the others first.
--   action = 'check by hand: covers several months':  a range starting in
--     October (e.g. "October – December 2026"). Left alone; decide whether the
--     range should start in September instead, and recreate it if so.
-- ---------------------------------------------------------------
with october as (
    select p.*
    from public.payments p
    where p.created_at < '2026-10-25T00:00:00+01:00'
      and (p.invoice_month = 'October 2026' or p.invoice_month ilike 'October –%' or p.invoice_month ilike 'October 2026 –%')
)
select
    coalesce(c.full_name, o.bill_to ->> 'full_name') as customer,
    o.invoice_month,
    o.description,
    o.amount,
    o.status,
    coalesce(o.amount_paid, 0) as amount_paid,
    o.auto_generated,
    (select count(*) from public.payment_installments i where i.payment_id = o.id) as receipts,
    case
        when o.invoice_month <> 'October 2026' then 'check by hand: covers several months'
        when o.customer_id is not null and (
            select count(*) from october o2 where o2.customer_id = o.customer_id and o2.invoice_month = 'October 2026'
        ) > 1 then 'check by hand: several October invoices'
        when o.customer_id is not null and exists (
            select 1 from public.payments s
            where s.customer_id = o.customer_id
              and s.id <> o.id
              and (s.invoice_month = 'September 2026' or 'September 2026' = any (coalesce(s.covered_months, '{}')))
        ) then 'check by hand: already has September'
        else 'relabel'
    end as action
from october o
left join public.customers c on c.profile_id = o.customer_id
order by action desc, customer;

-- ---------------------------------------------------------------
-- STEP 2. Relabel. Remove the two dashes in front of every line below, then
-- run it. It is all or nothing: if any part fails, nothing is changed.
-- ---------------------------------------------------------------
-- begin;
--
-- update public.payments p
-- set invoice_month = 'September 2026',
--     description = replace(p.description, 'October 2026', 'September 2026'),
--     covered_months = case
--         when p.covered_months = array['October 2026'] then array['September 2026']
--         else p.covered_months
--     end
-- where p.invoice_month = 'October 2026'
--   and p.created_at < '2026-10-25T00:00:00+01:00'
--   and not (
--       p.customer_id is not null
--       and (
--           select count(*) from public.payments o2
--           where o2.customer_id = p.customer_id
--             and o2.invoice_month = 'October 2026'
--             and o2.created_at < '2026-10-25T00:00:00+01:00'
--       ) > 1
--   )
--   and not (
--       p.customer_id is not null
--       and exists (
--           select 1 from public.payments s
--           where s.customer_id = p.customer_id
--             and s.id <> p.id
--             and (s.invoice_month = 'September 2026' or 'September 2026' = any (coalesce(s.covered_months, '{}')))
--       )
--   );
--
-- commit;
--
-- -- Then check: 0 unless step 1 listed some to check by hand.
-- select count(*) as october_left
-- from public.payments
-- where invoice_month = 'October 2026' and created_at < '2026-10-25T00:00:00+01:00';
