-- Customers who pay upfront for several months. An advance payment covers a run
-- of months: no invoice is created for them, and the payment has its own
-- receipt. Safe to run more than once. Run it in the Supabase SQL editor.

create table if not exists public.prepayments (
    id uuid primary key default gen_random_uuid(),
    customer_id uuid not null references public.profiles (id) on delete cascade,
    months integer not null check (months between 1 and 36),
    -- What was actually received.
    amount numeric(12, 2) not null check (amount > 0),
    -- The months it covers, spelled the way invoices name them, for example
    -- {"October 2026","November 2026"}.
    covered_months text[] not null,
    method text,
    reference text,
    note text,
    -- Invoices that already existed for a covered month and were settled by this payment.
    settled_payment_ids uuid[] not null default '{}',
    paid_at timestamptz not null default now(),
    recorded_by uuid references public.profiles (id) on delete set null,
    created_at timestamptz not null default now()
);

create index if not exists prepayments_customer_idx on public.prepayments (customer_id, paid_at desc);

alter table public.prepayments enable row level security;

-- The customer sees their own advance payments, admins see and record all.
drop policy if exists "prepayments_select_own" on public.prepayments;
create policy "prepayments_select_own" on public.prepayments
    for select to authenticated using (customer_id = auth.uid());

drop policy if exists "prepayments_select_reader" on public.prepayments;
create policy "prepayments_select_reader" on public.prepayments
    for select to authenticated using (public.is_staff_reader());

drop policy if exists "prepayments_write_admin" on public.prepayments;
create policy "prepayments_write_admin" on public.prepayments
    for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- Tell the customer their advance payment was received.
create or replace function public.trg_notify_prepayment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
    begin
        perform public.notify(
            new.customer_id, 'receipt',
            'Advance payment received: ' || new.months || ' month' || case when new.months = 1 then '' else 's' end || ' covered',
            new.covered_months[1] || case when new.months > 1 then ' to ' || new.covered_months[new.months] else '' end,
            '/customer/receipts/' || new.id, new.id
        );
    exception when others then
        null;
    end;
    return new;
end;
$$;

drop trigger if exists notify_on_prepayment on public.prepayments;
create trigger notify_on_prepayment after insert on public.prepayments
    for each row execute function public.trg_notify_prepayment();

select 'done' as result;
