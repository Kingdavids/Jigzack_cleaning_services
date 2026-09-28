-- A discount an admin can give to a specific customer: a percentage off, or a
-- fixed amount off, their monthly charge. It shows on the invoice as its own
-- line, so the customer sees exactly what was taken off and why.
-- Safe to run more than once. Run it in the Supabase SQL editor.
-- Run billing-installments-2026-09.sql first (it adds monthly_rate).

alter table public.customers
    add column if not exists discount_type text check (discount_type is null or discount_type in ('percent', 'amount')),
    add column if not exists discount_value numeric(12, 2) check (discount_value is null or discount_value > 0),
    add column if not exists discount_reason text,
    add column if not exists discount_set_by uuid references public.profiles (id) on delete set null,
    add column if not exists discount_set_at timestamptz;

-- A percentage discount can't be over 100.
alter table public.customers drop constraint if exists customers_discount_percent_check;
alter table public.customers
    add constraint customers_discount_percent_check
    check (discount_type is distinct from 'percent' or discount_value <= 100);

-- Tell the customer when a discount is given or removed.
create or replace function public.trg_notify_discount()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
    begin
        if new.discount_type is not null and (old.discount_type is distinct from new.discount_type or old.discount_value is distinct from new.discount_value) then
            perform public.notify(
                new.profile_id, 'payment', 'A discount has been applied to your account',
                case
                    when new.discount_type = 'percent' then new.discount_value || '% off your monthly charge'
                    else '₦' || to_char(new.discount_value, 'FM999,999,999') || ' off your monthly charge'
                end,
                '/customer/payments', new.profile_id
            );
        elsif old.discount_type is not null and new.discount_type is null then
            perform public.notify(new.profile_id, 'payment', 'Your discount has ended', 'Your monthly charge is back to the usual amount.', '/customer/payments', new.profile_id);
        end if;
    exception when others then
        null;
    end;
    return new;
end;
$$;

drop trigger if exists notify_on_discount on public.customers;
create trigger notify_on_discount after update of discount_type, discount_value on public.customers
    for each row execute function public.trg_notify_discount();

select 'done' as result;
