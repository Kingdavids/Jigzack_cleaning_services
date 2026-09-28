-- The customer details an employee needs to do a job: who, where, how to reach
-- them and anything to watch out for. Safe to run more than once. Run it in the
-- Supabase SQL editor after tasks-crew-2026-09.sql.
--
-- Employees cannot read public.customers, so this hands back only the service
-- details (no balance, discount or payment fields) for tasks the caller is the
-- lead or crew on, and everything to staff readers.

create or replace function public.task_customer_details(p_task_ids uuid[])
returns table (
    task_id uuid,
    customer_profile_id uuid,
    full_name text,
    phone text,
    whatsapp_number text,
    address text,
    landmark text,
    lga text,
    state text,
    property_type text,
    waste_type text,
    preferred_pickup_frequency text,
    special_notes text,
    can_message boolean
)
language sql
security definer
set search_path = public
stable
as $$
    select
        t.id,
        t.customer_id,
        coalesce(c.full_name, p.full_name),
        c.phone,
        c.whatsapp_number,
        c.address,
        c.landmark,
        c.lga,
        c.state,
        c.property_type,
        c.waste_type,
        c.preferred_pickup_frequency,
        c.special_notes,
        (p.role = 'customer' and p.status = 'approved')
    from public.tasks t
    join public.profiles p on p.id = t.customer_id
    left join public.customers c on c.profile_id = t.customer_id and c.deleted_at is null
    where t.id = any (p_task_ids)
      and (
          public.is_staff_reader()
          or t.employee_id = auth.uid()
          or exists (select 1 from public.task_crew tc where tc.task_id = t.id and tc.employee_id = auth.uid())
      );
$$;

revoke execute on function public.task_customer_details(uuid[]) from public, anon;
grant execute on function public.task_customer_details(uuid[]) to authenticated;

select 'done' as result;
