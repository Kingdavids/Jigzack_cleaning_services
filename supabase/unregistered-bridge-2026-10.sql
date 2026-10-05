-- Connects invoices made for someone before they had an account with the
-- account they later sign up for. Matching is on the login email only: it is
-- the one detail they have proved is theirs, so nobody can claim someone
-- else's invoices by typing a phone number. Safe to run more than once. Run it
-- in the Supabase SQL editor.

-- ---------------------------------------------------------------
-- 1. The details on invoices made out to the signed-in person's email (or
--    already moved to them), so their property form can start from what the
--    admin already entered.
-- ---------------------------------------------------------------
create or replace function public.my_unregistered_invoices()
returns table (id uuid, bill_to jsonb, created_at timestamptz)
language sql
security definer
set search_path = public
stable
as $$
    select p.id, p.bill_to, p.created_at
    from public.payments p
    join public.profiles me on me.id = auth.uid()
    where p.bill_to is not null
      and me.role = 'customer'
      and (
          -- Made out to their email and not yet theirs...
          (p.customer_id is null and me.email is not null and lower(trim(p.bill_to ->> 'email')) = lower(trim(me.email)))
          -- ...or already moved to their account by an admin.
          or p.customer_id = me.id
      )
    order by p.created_at desc;
$$;

revoke execute on function public.my_unregistered_invoices() from public, anon;
grant execute on function public.my_unregistered_invoices() to authenticated;

-- ---------------------------------------------------------------
-- 2. Once their property form is saved, those invoices move onto their
--    account, with every payment and receipt on them. A property name the
--    admin gave goes onto their customer record if it has none. Admins are
--    told. Returns how many moved.
-- ---------------------------------------------------------------
create or replace function public.claim_my_unregistered_invoices()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
    v_me public.profiles%rowtype;
    v_count integer := 0;
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

    if v_count > 0 then
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
                'Invoices moved to a new customer',
                coalesce(v_me.full_name, v_me.email) || ' signed up; ' || v_count || ' invoice' ||
                    case when v_count = 1 then '' else 's' end || ' made before they registered moved to their account',
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
