-- Pickup days remembered per customer, and reverting a pickup that was marked
-- serviced by mistake. Safe to run more than once.
-- Run it in the Supabase SQL editor. Run tasks-crew-2026-09.sql first.

-- ---------------------------------------------------------------
-- 1. The days of the week a customer is picked up (1 = Monday ... 6 = Saturday).
--    Empty means "use the frequency they wrote in their property details".
-- ---------------------------------------------------------------
alter table public.customers
    add column if not exists pickup_days integer[]
        check (pickup_days is null or pickup_days <@ array[1, 2, 3, 4, 5, 6]);

-- ---------------------------------------------------------------
-- 2. A pickup an admin has reopened must stay open
-- ---------------------------------------------------------------
alter table public.tasks
    add column if not exists reopened_at timestamptz,
    add column if not exists reopened_by uuid references public.profiles (id) on delete set null;

-- Past pickups are marked serviced, except ones an admin has reopened.
create or replace function public.mark_past_tasks_serviced()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
    v_count integer;
begin
    if not (public.is_admin() or auth.role() = 'service_role') then
        raise exception 'Only an admin can do this';
    end if;

    update public.tasks
    set status = 'completed',
        started_at = coalesce(started_at, (scheduled_date::timestamp + time '08:00') at time zone 'Africa/Lagos'),
        completed_at = coalesce(completed_at, (scheduled_date::timestamp + time '17:00') at time zone 'Africa/Lagos')
    where status in ('pending', 'in progress')
      and reopened_at is null
      and scheduled_date is not null
      and scheduled_date < (now() at time zone 'Africa/Lagos')::date;

    get diagnostics v_count = row_count;
    return v_count;
end;
$$;

revoke execute on function public.mark_past_tasks_serviced() from public, anon;
grant execute on function public.mark_past_tasks_serviced() to authenticated, service_role;

-- ---------------------------------------------------------------
-- 3. Tell the crew and the customer when a serviced pickup is reopened
-- ---------------------------------------------------------------
create or replace function public.trg_notify_task_reopened()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
    begin
        if new.reopened_at is not null and new.reopened_at is distinct from old.reopened_at then
            perform public.notify(
                new.employee_id, 'task', 'A pickup was reopened',
                new.title || ' was marked not done by an admin' || coalesce(' · ' || to_char(new.scheduled_date, 'DD Mon'), ''),
                '/employee/tasks', new.id
            );

            if to_regclass('public.task_crew') is not null then
                perform public.notify(c.employee_id, 'task', 'A pickup was reopened',
                    new.title || ' was marked not done by an admin', '/employee/tasks', new.id)
                from public.task_crew c
                where c.task_id = new.id;
            end if;

            perform public.notify(
                new.customer_id, 'task', 'Your pickup is still to be done',
                new.title || coalesce(' · ' || to_char(new.scheduled_date, 'DD Mon'), ''),
                '/customer/schedule', new.id
            );
        end if;
    exception when others then
        null;
    end;
    return new;
end;
$$;

drop trigger if exists notify_on_task_reopened on public.tasks;
create trigger notify_on_task_reopened after update of reopened_at on public.tasks
    for each row execute function public.trg_notify_task_reopened();

select 'done' as result;
