-- Lets an admin record an advance payment for someone who is not registered on
-- the app. Their details are kept on the payment itself (bill_to), the same way
-- invoices do it, and the payment moves onto their account once they register.
-- Run supabase/prepaid-2026-09.sql and supabase/unregistered-bridge-2026-10.sql
-- first. Safe to run more than once. Run it in the Supabase SQL editor.

-- Stops here with a plain message if advance payments were never switched on.
do $$
begin
    if to_regclass('public.prepayments') is null then
        raise exception 'Run supabase/prepaid-2026-09.sql first. It creates the advance payments table this file changes.';
    end if;
end $$;

alter table public.prepayments alter column customer_id drop not null;
alter table public.prepayments add column if not exists bill_to jsonb;

alter table public.prepayments drop constraint if exists prepayments_has_payer;
alter table public.prepayments
    add constraint prepayments_has_payer check (customer_id is not null or bill_to is not null);

-- Only tell a customer about their advance payment when there is one to tell.
create or replace function public.trg_notify_prepayment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
    if new.customer_id is null then
        return new;
    end if;

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

-- When they sign up and fill in their property form, advance payments made out
-- to their email move onto their account along with their invoices.
create or replace function public.claim_my_unregistered_invoices()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
    v_me public.profiles%rowtype;
    v_count integer := 0;
    v_advance integer := 0;
    v_property text;
begin
    select * into v_me from public.profiles where id = auth.uid();

    if v_me.id is null or v_me.role <> 'customer' or v_me.status = 'declined' or v_me.email is null then
        return 0;
    end if;

    -- Only once they have a customer record, so the invoices have somewhere to show.
    if not exists (select 1 from public.customers c where c.profile_id = v_me.id) then
        return 0;
    end if;

    select p.bill_to ->> 'property_name' into v_property
    from public.payments p
    where p.customer_id is null
      and lower(trim(p.bill_to ->> 'email')) = lower(trim(v_me.email))
      and coalesce(p.bill_to ->> 'property_name', '') <> ''
    order by p.created_at desc
    limit 1;

    update public.payments p
    set customer_id = v_me.id
    where p.customer_id is null
      and p.bill_to is not null
      and lower(trim(p.bill_to ->> 'email')) = lower(trim(v_me.email));

    get diagnostics v_count = row_count;

    -- Advance payments made out to the same email, unless they already have
    -- cover for one of the same months.
    begin
        update public.prepayments pp
        set customer_id = v_me.id
        where pp.customer_id is null
          and pp.bill_to is not null
          and lower(trim(pp.bill_to ->> 'email')) = lower(trim(v_me.email))
          and not exists (
              select 1 from public.prepayments mine
              where mine.customer_id = v_me.id and mine.covered_months && pp.covered_months
          );

        get diagnostics v_advance = row_count;
    exception when others then
        v_advance := 0;
    end;

    if v_count > 0 or v_advance > 0 then
        -- The property name, if the column exists and they have none yet.
        begin
            if v_property is not null then
                update public.customers set property_name = v_property
                where profile_id = v_me.id and coalesce(property_name, '') = '';
            end if;
        exception when others then
            null;
        end;

        begin
            perform public.notify_admins(
                'payment',
                'Payments moved to a new customer',
                coalesce(v_me.full_name, v_me.email) || ' signed up; ' || v_count || ' invoice' ||
                    case when v_count = 1 then '' else 's' end || ' and ' || v_advance || ' advance payment' ||
                    case when v_advance = 1 then '' else 's' end || ' made before they registered moved to their account',
                '/admin/customers/' || v_me.id
            );
        exception when others then
            null;
        end;
    end if;

    return v_count;
end;
$$;

revoke execute on function public.claim_my_unregistered_invoices() from public, anon;
grant execute on function public.claim_my_unregistered_invoices() to authenticated;

select 'done' as result;
