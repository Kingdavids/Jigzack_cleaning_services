-- Two or more employees on the same task, and past pickups marked serviced.
-- Safe to run more than once. Run it in the Supabase SQL editor.
-- Run notifications-2026-09.sql first (or after, it does not matter which).

-- ---------------------------------------------------------------
-- 1. The rest of the crew. tasks.employee_id stays the lead; anyone else on the
--    job is listed here.
-- ---------------------------------------------------------------
create table if not exists public.task_crew (
    task_id uuid not null references public.tasks (id) on delete cascade,
    employee_id uuid not null references public.profiles (id) on delete cascade,
    created_at timestamptz not null default now(),
    primary key (task_id, employee_id)
);

create index if not exists task_crew_employee_idx on public.task_crew (employee_id);

alter table public.task_crew enable row level security;

drop policy if exists "task_crew_select_own" on public.task_crew;
create policy "task_crew_select_own" on public.task_crew
    for select to authenticated using (employee_id = auth.uid());

drop policy if exists "task_crew_select_reader" on public.task_crew;
create policy "task_crew_select_reader" on public.task_crew
    for select to authenticated using (public.is_staff_reader());

drop policy if exists "task_crew_write_admin" on public.task_crew;
create policy "task_crew_write_admin" on public.task_crew
    for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------
-- 2. Crew members see and work on the task, like the lead does
-- ---------------------------------------------------------------
drop policy if exists "tasks_select_crew" on public.tasks;
create policy "tasks_select_crew" on public.tasks
    for select to authenticated using (
        exists (select 1 from public.task_crew c where c.task_id = tasks.id and c.employee_id = auth.uid())
    );

drop policy if exists "tasks_update_crew" on public.tasks;
create policy "tasks_update_crew" on public.tasks
    for update to authenticated
    using (exists (select 1 from public.task_crew c where c.task_id = tasks.id and c.employee_id = auth.uid()))
    with check (exists (select 1 from public.task_crew c where c.task_id = tasks.id and c.employee_id = auth.uid()));

-- Photos taken by anyone on the job are visible to everyone on the job.
drop policy if exists "uploads_select_task_team" on public.uploads;
create policy "uploads_select_task_team" on public.uploads
    for select to authenticated using (
        exists (
            select 1 from public.tasks t
            where t.id = uploads.task_id
              and (
                  t.employee_id = auth.uid()
                  or exists (select 1 from public.task_crew c where c.task_id = t.id and c.employee_id = auth.uid())
              )
        )
    );

-- ---------------------------------------------------------------
-- 3. Messaging: a crew member can write to the customer of a shared task
-- ---------------------------------------------------------------
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
    where (
            t.employee_id = auth.uid()
            or exists (select 1 from public.task_crew c where c.task_id = t.id and c.employee_id = auth.uid())
          )
      and p.role = 'customer'
      and p.status = 'approved'
    order by p.full_name;
$$;

revoke execute on function public.my_customer_contacts() from public, anon;
grant execute on function public.my_customer_contacts() to authenticated;

drop policy if exists "messages_insert_employee_customer" on public.messages;
create policy "messages_insert_employee_customer" on public.messages
    for insert to authenticated
    with check (
        auth.uid() = from_profile_id
        and exists (
            select 1 from public.tasks t
            where (
                    (
                        (t.employee_id = from_profile_id
                         or exists (select 1 from public.task_crew c where c.task_id = t.id and c.employee_id = from_profile_id))
                        and t.customer_id = to_profile_id
                    )
                    or (
                        t.customer_id = from_profile_id
                        and (t.employee_id = to_profile_id
                             or exists (select 1 from public.task_crew c where c.task_id = t.id and c.employee_id = to_profile_id))
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

-- ---------------------------------------------------------------
-- 4. Who is on each task, by name. Employees and customers cannot read other
--    people's profiles, so this hands back only the names for tasks the caller
--    is on (or the customer of), and everything to admins.
-- ---------------------------------------------------------------
create or replace function public.task_team(p_task_ids uuid[])
returns table (task_id uuid, employee_id uuid, full_name text, is_lead boolean)
language sql
security definer
set search_path = public
stable
as $$
    with allowed as (
        select t.id, t.employee_id as lead_id
        from public.tasks t
        where t.id = any (p_task_ids)
          and (
              public.is_staff_reader()
              or t.customer_id = auth.uid()
              or t.employee_id = auth.uid()
              or exists (select 1 from public.task_crew c where c.task_id = t.id and c.employee_id = auth.uid())
          )
    ),
    everyone as (
        select a.id as task_id, a.lead_id as employee_id, true as is_lead
        from allowed a
        where a.lead_id is not null
        union
        select c.task_id, c.employee_id, false
        from public.task_crew c
        join allowed a on a.id = c.task_id
    )
    select e.task_id, e.employee_id, p.full_name, e.is_lead
    from everyone e
    join public.profiles p on p.id = e.employee_id
    order by e.task_id, e.is_lead desc, p.full_name;
$$;

revoke execute on function public.task_team(uuid[]) from public, anon;
grant execute on function public.task_team(uuid[]) to authenticated;

-- ---------------------------------------------------------------
-- 5. Pickups whose date has passed are marked serviced. Called by the daily job
--    and whenever an admin opens the Tasks page. Returns how many it changed.
-- ---------------------------------------------------------------
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
      and scheduled_date is not null
      and scheduled_date < (now() at time zone 'Africa/Lagos')::date;

    get diagnostics v_count = row_count;
    return v_count;
end;
$$;

revoke execute on function public.mark_past_tasks_serviced() from public, anon;
grant execute on function public.mark_past_tasks_serviced() to authenticated, service_role;

-- ---------------------------------------------------------------
-- 6. Tell a crew member when they are put on a task
-- ---------------------------------------------------------------
create or replace function public.trg_notify_crew()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
    v_title text;
    v_date date;
begin
    begin
        select title, scheduled_date into v_title, v_date from public.tasks where id = new.task_id;

        perform public.notify(
            new.employee_id, 'task', 'You have been added to a task',
            coalesce(v_title, 'Task') || coalesce(' · ' || to_char(v_date, 'DD Mon'), ''),
            '/employee/tasks', new.task_id
        );
    exception when others then
        null;
    end;
    return new;
end;
$$;

drop trigger if exists notify_on_crew on public.task_crew;
create trigger notify_on_crew after insert on public.task_crew
    for each row execute function public.trg_notify_crew();

select 'done' as result;
