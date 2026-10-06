-- Buying and selling recyclables. Run supabase/admin-expenses-recyclables-2026-10.sql
-- first. Safe to run more than once. Run it in the Supabase SQL editor.
--
-- 1. What an invoice is for: the normal monthly service, a sale of
--    recyclables, or something else. Empty means the normal service, so every
--    invoice made so far keeps working.
-- 2. Money on recyclables movements: what was paid when buying ("in"), or the
--    value of a sale ("out"), and the sale invoice a movement came from.

alter table public.payments
    add column if not exists invoice_kind text
        check (invoice_kind is null or invoice_kind in ('service', 'recyclables', 'other'));

alter table public.recyclable_movements
    add column if not exists amount numeric(12, 2) check (amount is null or amount >= 0),
    -- Removing the sale invoice puts its stock back.
    add column if not exists payment_id uuid references public.payments (id) on delete cascade;

create index if not exists recyclable_movements_payment_idx on public.recyclable_movements (payment_id);

select 'done' as result;
