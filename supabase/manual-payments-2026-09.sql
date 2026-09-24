-- Run once in the Supabase SQL editor on the live project. Safe to run again.
-- Paystack is gone. The registration fee and invoices are now paid by bank transfer:
-- the customer says they have paid (optionally uploading a receipt) and an
-- admin confirms it. Admins can also mark an existing customer as already paid.

-- ---------------------------------------------------------------
-- 1. What the customer reported
-- ---------------------------------------------------------------
alter table public.customers
    add column if not exists registration_fee_submitted_at timestamptz,
    add column if not exists registration_fee_receipt_path text,
    add column if not exists registration_fee_note text;

-- The old function marked the fee paid straight after a Paystack payment.
drop function if exists public.mark_registration_fee_paid(text);

-- A customer can only say "I have paid". Confirming is an admin action. This
-- runs with elevated rights so it does not need a broad update policy that
-- would let a customer edit other columns (balance, status) on their own row.
create or replace function public.report_registration_fee(p_note text, p_receipt_path text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
    update public.customers
    set registration_fee_submitted_at = now(),
        registration_fee_note = nullif(left(coalesce(p_note, ''), 300), ''),
        registration_fee_receipt_path = p_receipt_path
    where profile_id = auth.uid()
      and registration_fee_paid = false;
end;
$$;

revoke execute on function public.report_registration_fee(text, text) from public, anon;
grant execute on function public.report_registration_fee(text, text) to authenticated;

-- ---------------------------------------------------------------
-- 2. Private bucket for payment receipts
-- ---------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
    'payment-receipts', 'payment-receipts', false, 10485760,
    array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'application/pdf']
)
on conflict (id) do update
    set public = false,
        file_size_limit = excluded.file_size_limit,
        allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "payment_receipts_upload" on storage.objects;
create policy "payment_receipts_upload" on storage.objects
    for insert to authenticated with check (
        bucket_id = 'payment-receipts'
        and (storage.foldername(name)) [1] = auth.uid()::text
        and exists (
            select 1 from public.profiles p
            where p.id = auth.uid() and p.role = 'customer' and p.status = 'approved'
        )
    );

drop policy if exists "payment_receipts_read" on storage.objects;
create policy "payment_receipts_read" on storage.objects
    for select to authenticated using (
        bucket_id = 'payment-receipts'
        and ((storage.foldername(name)) [1] = auth.uid()::text or public.is_admin())
    );

drop policy if exists "payment_receipts_delete_own" on storage.objects;
create policy "payment_receipts_delete_own" on storage.objects
    for delete to authenticated using (
        bucket_id = 'payment-receipts'
        and (storage.foldername(name)) [1] = auth.uid()::text
    );

-- ---------------------------------------------------------------
-- 3. Invoices: "I paid by transfer" with an optional receipt
-- ---------------------------------------------------------------
alter table public.payments
    add column if not exists transfer_reported_at timestamptz,
    add column if not exists transfer_note text,
    add column if not exists transfer_receipt_path text;

-- A customer can only say "I have paid" for their own unpaid invoice. Marking
-- an invoice paid stays an admin action. This runs with elevated rights so it
-- does not need a broad update policy on payments.
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
      and customer_id = auth.uid()
      and status = 'pending';
end;
$$;

revoke execute on function public.report_invoice_transfer(uuid, text, text) from public, anon;
grant execute on function public.report_invoice_transfer(uuid, text, text) to authenticated;

select 'done' as result;
