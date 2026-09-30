-- Reporting a bank transfer ("I have paid") only worked for a customer's own
-- invoice; on a property linked to their login (multiple properties, one
-- login) it silently failed, since the check only ever looked at their own
-- id. It now also allows a property linked to the signed-in customer, the
-- same access property-links-2026-09.sql already grants for viewing.
-- Run property-links-2026-09.sql first (it adds linked_profile_ids()).
-- Safe to run more than once. Run it in the Supabase SQL editor.

create or replace function public.report_invoice_transfer(p_payment_id uuid, p_note text, p_receipt_path text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
    update public.payments
    set transfer_reported_at = now(),
        transfer_note = nullif(left(coalesce(p_note, ''), 300), ''),
        transfer_receipt_path = p_receipt_path
    where id = p_payment_id
      and (customer_id = auth.uid() or customer_id in (select public.linked_profile_ids()))
      and status = 'pending';
end;
$$;

revoke execute on function public.report_invoice_transfer(uuid, text, text) from public, anon;
grant execute on function public.report_invoice_transfer(uuid, text, text) to authenticated;

select 'done' as result;
