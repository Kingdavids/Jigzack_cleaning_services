-- Arrears were copied onto every new invoice instead of being charged once, so
-- a customer with arrears was billed for them again each month. The app now
-- charges them once; this finds and fixes invoices that already got a copy.
-- Run it in the Supabase SQL editor, ONE STEP AT A TIME.

-- ---------------------------------------------------------------
-- STEP 1. Look first. Every invoice that repeats arrears already put on an
-- earlier invoice for the same customer. Nothing is changed by this step.
--   can_fix = true: nothing has been paid on it, so step 2 removes the copy.
--   can_fix = false: money was paid on it. Step 2 leaves it alone; fix it by
--   hand on the Payments page (lower its arrears, or credit the customer).
-- ---------------------------------------------------------------
select
    c.full_name,
    p.invoice_month,
    p.amount,
    p.arrears as repeated_arrears,
    first.invoice_month as first_charged_on,
    p.status,
    coalesce(p.amount_paid, 0) as amount_paid,
    (p.status <> 'paid' and coalesce(p.amount_paid, 0) = 0) as can_fix
from public.payments p
join public.customers c on c.profile_id = p.customer_id
join lateral (
    select e.invoice_month
    from public.payments e
    where e.customer_id = p.customer_id
      and e.arrears = p.arrears
      and e.created_at < p.created_at
    order by e.created_at
    limit 1
) first on true
where p.arrears > 0
order by c.full_name, p.created_at;

-- ---------------------------------------------------------------
-- STEP 2. Fix. Run only after checking step 1.
-- ---------------------------------------------------------------
-- begin;
--
-- -- a. Remove the repeated arrears from invoices nothing has been paid on.
-- update public.payments p
-- set arrears = 0
-- where p.arrears > 0
--   and p.status <> 'paid'
--   and coalesce(p.amount_paid, 0) = 0
--   and exists (
--       select 1 from public.payments e
--       where e.customer_id = p.customer_id
--         and e.arrears = p.arrears
--         and e.created_at < p.created_at
--   );
--
-- -- b. Arrears already on an invoice are not waiting any more, so they are
-- --    not put on the next one too.
-- update public.customers c
-- set arrears = 0
-- where c.arrears > 0
--   and exists (
--       select 1 from public.payments p
--       where p.customer_id = c.profile_id
--         and p.arrears = c.arrears
--   );
--
-- commit;
