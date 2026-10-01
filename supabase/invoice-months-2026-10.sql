-- The months an invoice covers, for one made by hand for several months at
-- once (for example October, November and December 2026). The automatic
-- monthly invoice skips any month already covered, so a customer is never
-- billed twice for it. Safe to run more than once. Run it in the Supabase SQL
-- editor.

alter table public.payments
    add column if not exists covered_months text[];

select 'done' as result;
