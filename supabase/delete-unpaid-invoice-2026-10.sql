-- Lets a full admin delete an invoice that was made by mistake, for example one
-- entered twice. Only an invoice with no money recorded against it can go:
-- a paid or part-paid invoice stays, and only the owner can delete those (from
-- the tick boxes on the Payments page). Safe to run more than once. Run it in
-- the Supabase SQL editor.

create or replace function public.delete_unpaid_invoice(p_payment_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
    v_payment record;
begin
    if not public.is_admin() then
        raise exception 'Not authorized';
    end if;

    select id, status, amount_paid into v_payment from public.payments where id = p_payment_id;

    if not found then
        raise exception 'Invoice not found';
    end if;

    if v_payment.status = 'paid'
       or coalesce(v_payment.amount_paid, 0) > 0
       or exists (select 1 from public.payment_installments where payment_id = p_payment_id) then
        raise exception 'This invoice has payments recorded, so it cannot be deleted here';
    end if;

    delete from public.payments where id = p_payment_id;
end;
$$;

revoke execute on function public.delete_unpaid_invoice(uuid) from public, anon;
grant execute on function public.delete_unpaid_invoice(uuid) to authenticated;

select 'done' as result;
