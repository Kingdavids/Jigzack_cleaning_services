-- Run once in the Supabase SQL editor on the live project. Safe to run again.
-- Lets an employee message the customers they have jobs for, and lets those
-- customers reply. Administrators can already read every message (the
-- messages_all_admin policy), which is how they see these conversations.

-- 1. The customers an employee may contact: those with a task assigned to them.
create or replace function public.my_customer_contacts()
returns table (id uuid, full_name text)
language sql
security definer
set search_path = public
stable
as $$
    select distinct p.id, p.full_name
    from public.tasks t
    join public.profiles p on p.id = t.customer_id
    where t.employee_id = auth.uid()
      and p.role = 'customer'
      and p.status = 'approved'
    order by p.full_name;
$$;

revoke execute on function public.my_customer_contacts() from public, anon;
grant execute on function public.my_customer_contacts() to authenticated;

-- 2. A message is allowed between an employee and a customer when a task links
--    them, in either direction (so the customer can reply). Replies to
--    broadcasts stay blocked, as for admin messages.
drop policy if exists "messages_insert_employee_customer" on public.messages;
create policy "messages_insert_employee_customer" on public.messages
    for insert to authenticated
    with check (
        auth.uid() = from_profile_id
        and exists (
            select 1 from public.tasks t
            where (t.employee_id = from_profile_id and t.customer_id = to_profile_id)
               or (t.customer_id = from_profile_id and t.employee_id = to_profile_id)
        )
        and (
            parent_message_id is null
            or not exists (
                select 1 from public.messages root
                where root.id = parent_message_id and root.is_broadcast
            )
        )
    );

select 'done' as result;
