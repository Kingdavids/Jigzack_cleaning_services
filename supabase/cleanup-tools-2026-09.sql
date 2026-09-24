-- Run once in the Supabase SQL editor on the live project. Safe to run again.
-- Run supabase/owner-2026-09.sql first (it adds is_owner).
--
-- Permanent deletion of expenses and messages, and of receipt files, is owner
-- only. Admins keep read, add and edit. (Invoices and customers already work
-- this way after owner-2026-09.sql.)

-- Expenses: admins review (update), only owners delete.
drop policy if exists "expenses_all_admin" on public.expenses;
drop policy if exists "expenses_select_admin" on public.expenses;
drop policy if exists "expenses_insert_admin" on public.expenses;
drop policy if exists "expenses_update_admin" on public.expenses;
drop policy if exists "expenses_delete_owner" on public.expenses;
create policy "expenses_select_admin" on public.expenses for select to authenticated using (public.is_admin());
create policy "expenses_insert_admin" on public.expenses for insert to authenticated with check (public.is_admin());
create policy "expenses_update_admin" on public.expenses for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "expenses_delete_owner" on public.expenses for delete to authenticated using (public.is_owner());

-- Messages: admins read, send and mark read; a sender can still delete their own
-- (messages_delete_own), and only an owner can delete anyone else's.
drop policy if exists "messages_all_admin" on public.messages;
drop policy if exists "messages_select_admin" on public.messages;
drop policy if exists "messages_insert_admin" on public.messages;
drop policy if exists "messages_update_admin" on public.messages;
drop policy if exists "messages_delete_owner" on public.messages;
create policy "messages_select_admin" on public.messages for select using (public.is_admin());
create policy "messages_insert_admin" on public.messages for insert with check (public.is_admin());
create policy "messages_update_admin" on public.messages for update using (public.is_admin()) with check (public.is_admin());
create policy "messages_delete_owner" on public.messages for delete using (public.is_owner());

-- Owners can remove any receipt file (staff and customers can only remove their own).
drop policy if exists "payment_receipts_delete_owner" on storage.objects;
create policy "payment_receipts_delete_owner" on storage.objects
    for delete to authenticated using (bucket_id = 'payment-receipts' and public.is_owner());

drop policy if exists "expense_receipts_delete_owner" on storage.objects;
create policy "expense_receipts_delete_owner" on storage.objects
    for delete to authenticated using (bucket_id = 'expense-receipts' and public.is_owner());

select 'done' as result;
