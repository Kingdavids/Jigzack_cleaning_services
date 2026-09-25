-- Part payments (installments) with a receipt for each one, and a custom
-- monthly charge per customer. Safe to run more than once.
-- Run it in the Supabase SQL editor.

-- ---------------------------------------------------------------
-- 1. A custom monthly charge for a customer (empty = worked out from
--    their property details, as before)
-- ---------------------------------------------------------------
alter table public.customers
    add column if not exists monthly_rate numeric(12, 2)
        check (monthly_rate is null or monthly_rate >= 0);

-- ---------------------------------------------------------------
-- 2. How much of an invoice has been paid so far
-- ---------------------------------------------------------------
alter table public.payments
    add column if not exists amount_paid numeric(12, 2) not null default 0;

-- Invoices already marked paid count as fully paid.
update public.payments
set amount_paid = amount + arrears
where status = 'paid' and amount_paid = 0;

-- ---------------------------------------------------------------
-- 3. Each payment received against an invoice. One row is one receipt.
-- ---------------------------------------------------------------
create table if not exists public.payment_installments (
    id uuid primary key default gen_random_uuid(),
    payment_id uuid not null references public.payments (id) on delete cascade,
    amount numeric(12, 2) not null check (amount > 0),
    -- What was still owed on the invoice right after this payment.
    balance_after numeric(12, 2) not null check (balance_after >= 0),
    method text,
    reference text,
    note text,
    paid_at timestamptz not null default now(),
    recorded_by uuid references public.profiles (id) on delete set null,
    created_at timestamptz not null default now()
);

create index if not exists payment_installments_payment_idx
    on public.payment_installments (payment_id, paid_at);

alter table public.payment_installments enable row level security;

-- Whoever can see an invoice (its customer, a tenant of that estate, admins
-- and view-only supervisors) can see its payments. Nobody writes to this table
-- directly: the functions below do it.
drop policy if exists "installments_select_visible" on public.payment_installments;
create policy "installments_select_visible" on public.payment_installments
    for select to authenticated using (
        exists (select 1 from public.payments p where p.id = payment_installments.payment_id)
    );

-- ---------------------------------------------------------------
-- 4. Record a payment against an invoice. The total can never go over what
--    is owed, and the invoice becomes paid when nothing is left.
-- ---------------------------------------------------------------
create or replace function public.record_installment(
    p_payment_id uuid,
    p_amount numeric,
    p_method text,
    p_reference text,
    p_note text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_payment public.payments;
    v_total numeric(12, 2);
    v_balance numeric(12, 2);
    v_amount numeric(12, 2) := round(coalesce(p_amount, 0), 2);
    v_left numeric(12, 2);
    v_id uuid;
begin
    if not public.is_admin() then
        raise exception 'Only an admin can record a payment';
    end if;

    select * into v_payment from public.payments where id = p_payment_id for update;

    if not found then
        raise exception 'Invoice not found';
    end if;

    v_total := v_payment.amount + v_payment.arrears;
    v_balance := v_total - v_payment.amount_paid;

    if v_payment.status = 'paid' or v_balance <= 0 then
        raise exception 'This invoice is already paid in full';
    end if;

    if v_amount <= 0 then
        raise exception 'Enter an amount greater than zero';
    end if;

    if v_amount > v_balance then
        raise exception 'That is more than the balance of %', v_balance;
    end if;

    v_left := v_balance - v_amount;

    insert into public.payment_installments (payment_id, amount, balance_after, method, reference, note, recorded_by)
    values (
        p_payment_id, v_amount, v_left,
        nullif(left(coalesce(p_method, ''), 40), ''),
        nullif(left(coalesce(p_reference, ''), 120), ''),
        nullif(left(coalesce(p_note, ''), 300), ''),
        auth.uid()
    )
    returning id into v_id;

    update public.payments
    set amount_paid = v_payment.amount_paid + v_amount,
        status = case when v_left = 0 then 'paid' else status end,
        paid_at = case when v_left = 0 then now() else paid_at end,
        payment_method = case when v_left = 0 then nullif(left(coalesce(p_method, ''), 40), '') else payment_method end,
        payment_reference = case when v_left = 0 then nullif(left(coalesce(p_reference, ''), 120), '') else payment_reference end,
        -- The admin has now looked at what the customer reported.
        transfer_reported_at = null
    where id = p_payment_id;

    return jsonb_build_object('installment_id', v_id, 'balance', v_left, 'paid', v_left = 0);
end;
$$;

revoke execute on function public.record_installment(uuid, numeric, text, text, text) from public, anon;
grant execute on function public.record_installment(uuid, numeric, text, text, text) to authenticated;

-- ---------------------------------------------------------------
-- 5. Undo a payment that was entered by mistake.
-- ---------------------------------------------------------------
create or replace function public.void_installment(p_installment_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_payment_id uuid;
    v_total numeric(12, 2);
    v_paid numeric(12, 2);
begin
    if not public.is_admin() then
        raise exception 'Only an admin can remove a payment';
    end if;

    select payment_id into v_payment_id from public.payment_installments where id = p_installment_id;

    if v_payment_id is null then
        raise exception 'Payment not found';
    end if;

    perform 1 from public.payments where id = v_payment_id for update;

    delete from public.payment_installments where id = p_installment_id;

    select coalesce(sum(amount), 0) into v_paid from public.payment_installments where payment_id = v_payment_id;

    -- What was owed after each remaining payment changes now, so recompute them.
    select amount + arrears into v_total from public.payments where id = v_payment_id;

    update public.payment_installments i
    set balance_after = greatest(
        v_total - (
            select coalesce(sum(j.amount), 0)
            from public.payment_installments j
            where j.payment_id = i.payment_id and (j.paid_at, j.id) <= (i.paid_at, i.id)
        ),
        0
    )
    where i.payment_id = v_payment_id;

    update public.payments
    set amount_paid = v_paid,
        status = case when v_paid >= v_total then 'paid' else 'pending' end,
        paid_at = case when v_paid >= v_total then paid_at else null end,
        payment_method = case when v_paid >= v_total then payment_method else null end,
        payment_reference = case when v_paid >= v_total then payment_reference else null end
    where id = v_payment_id;

    return jsonb_build_object('balance', greatest(v_total - v_paid, 0));
end;
$$;

revoke execute on function public.void_installment(uuid) from public, anon;
grant execute on function public.void_installment(uuid) to authenticated;
