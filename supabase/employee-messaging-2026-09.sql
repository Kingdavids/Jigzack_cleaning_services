-- Employees can message any active customer, not only those they have a job for.
-- A customer can message the employees assigned to them (the lead and the crew
-- of their jobs) and reply to any employee who has written to them. Admins still
-- see these conversations, as before.
-- Safe to run more than once. Run it in the Supabase SQL editor.
-- Run message-privacy-2026-09.sql first if you have not.

-- Is this person an approved account of the given kind? Runs with elevated
-- rights, since employees and customers cannot read each other's profiles.
create or replace function public.profile_is(p_id uuid, p_role text)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
    select exists (
        select 1 from public.profiles
        where id = p_id and role = p_role and status = 'approved'
    );
$$;

revoke execute on function public.profile_is(uuid, text) from public, anon;
grant execute on function public.profile_is(uuid, text) to authenticated;

-- The customers an employee can write to: every active, approved customer.
create or replace function public.my_customer_contacts()
returns table (id uuid, full_name text)
language sql
security definer
set search_path = public
stable
as $$
    select p.id, p.full_name
    from public.profiles p
    join public.customers c on c.profile_id = p.id
    where public.profile_is(auth.uid(), 'employee')
      and p.role = 'customer'
      and p.status = 'approved'
      and c.status = 'active'
    order by p.full_name;
$$;

revoke execute on function public.my_customer_contacts() from public, anon;
grant execute on function public.my_customer_contacts() to authenticated;

-- Is this employee on one of this customer's jobs, as the lead or as crew?
-- The crew table only exists once tasks-crew-2026-09.sql has run, so it is only
-- looked at when it is there.
create or replace function public.customer_can_message_employee(p_customer uuid, p_employee uuid)
returns boolean
language plpgsql
security definer
set search_path = public
stable
as $$
begin
    if exists (select 1 from public.tasks t where t.customer_id = p_customer and t.employee_id = p_employee) then
        return true;
    end if;

    if to_regclass('public.task_crew') is not null then
        return exists (
            select 1
            from public.task_crew c
            join public.tasks t on t.id = c.task_id
            where t.customer_id = p_customer and c.employee_id = p_employee
        );
    end if;

    return false;
end;
$$;

revoke execute on function public.customer_can_message_employee(uuid, uuid) from public, anon;
grant execute on function public.customer_can_message_employee(uuid, uuid) to authenticated;

-- The employees coming to service the signed-in customer: everyone on a job that
-- has not been serviced yet, with the date of their next visit.
create or replace function public.my_assigned_employees()
returns table (id uuid, full_name text, next_date date)
language plpgsql
security definer
set search_path = public
stable
as $$
begin
    if to_regclass('public.task_crew') is not null then
        return query
            select p.id, p.full_name, min(x.scheduled_date) as next_date
            from (
                select t.employee_id as emp, t.scheduled_date
                from public.tasks t
                where t.customer_id = auth.uid()
                  and t.status in ('pending', 'in progress')
                  and t.employee_id is not null
                union all
                select c.employee_id, t.scheduled_date
                from public.task_crew c
                join public.tasks t on t.id = c.task_id
                where t.customer_id = auth.uid()
                  and t.status in ('pending', 'in progress')
            ) x
            join public.profiles p on p.id = x.emp
            where p.status = 'approved'
            group by p.id, p.full_name
            order by min(x.scheduled_date) nulls last, p.full_name;
    else
        return query
            select p.id, p.full_name, min(t.scheduled_date) as next_date
            from public.tasks t
            join public.profiles p on p.id = t.employee_id
            where t.customer_id = auth.uid()
              and t.status in ('pending', 'in progress')
              and p.status = 'approved'
            group by p.id, p.full_name
            order by min(t.scheduled_date) nulls last, p.full_name;
    end if;
end;
$$;

revoke execute on function public.my_assigned_employees() from public, anon;
grant execute on function public.my_assigned_employees() to authenticated;

-- Who may send a message between an employee and a customer:
--   employee -> any approved customer
--   customer -> an employee assigned to them, or one who has written to them
-- Replies to broadcasts stay blocked, as for admin messages.
drop policy if exists "messages_insert_employee_customer" on public.messages;
create policy "messages_insert_employee_customer" on public.messages
    for insert to authenticated
    with check (
        auth.uid() = from_profile_id
        and (
            (public.profile_is(from_profile_id, 'employee') and public.profile_is(to_profile_id, 'customer'))
            or (
                public.profile_is(from_profile_id, 'customer')
                and public.profile_is(to_profile_id, 'employee')
                and (
                    exists (
                        select 1 from public.messages m
                        where m.from_profile_id = to_profile_id and m.to_profile_id = from_profile_id
                    )
                    or public.customer_can_message_employee(from_profile_id, to_profile_id)
                )
            )
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
