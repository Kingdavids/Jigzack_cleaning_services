-- The notification bell: one place that records everything a person should be
-- told about (messages, invoices, receipts, tasks, photos, signups, expenses and
-- what admins change). The app shows them live, in the bell, as a popup and with
-- a sound. Safe to run more than once. Run it in the Supabase SQL editor.
--
-- Run billing-installments-2026-09.sql first if you have not, so receipts
-- notify too. If you run this one first, run it again afterwards.

-- ---------------------------------------------------------------
-- 1. The notifications themselves
-- ---------------------------------------------------------------
create table if not exists public.notifications (
    id uuid primary key default gen_random_uuid(),
    recipient_id uuid not null references public.profiles (id) on delete cascade,
    kind text not null,
    title text not null,
    body text,
    -- Where the bell takes you when you tap it.
    href text,
    -- The thing it is about, for example the message thread it belongs to.
    ref_id uuid,
    -- Stops a burst (ten photos, a week of pickups) from ringing ten times.
    dedupe_key text,
    created_at timestamptz not null default now(),
    read_at timestamptz
);

create index if not exists notifications_recipient_idx on public.notifications (recipient_id, created_at desc);
create index if not exists notifications_unread_idx on public.notifications (recipient_id) where read_at is null;

alter table public.notifications enable row level security;

drop policy if exists "notifications_select_own" on public.notifications;
create policy "notifications_select_own" on public.notifications
    for select to authenticated using (recipient_id = auth.uid());

drop policy if exists "notifications_update_own" on public.notifications;
create policy "notifications_update_own" on public.notifications
    for update to authenticated using (recipient_id = auth.uid()) with check (recipient_id = auth.uid());

drop policy if exists "notifications_delete_own" on public.notifications;
create policy "notifications_delete_own" on public.notifications
    for delete to authenticated using (recipient_id = auth.uid());

-- Live updates to the bell.
do $$
begin
    alter publication supabase_realtime add table public.notifications;
exception
    when duplicate_object then null;
end
$$;

-- ---------------------------------------------------------------
-- 2. Helpers the triggers use. Nobody calls these from the app.
-- ---------------------------------------------------------------
create or replace function public.notify(
    p_recipient uuid,
    p_kind text,
    p_title text,
    p_body text,
    p_href text,
    p_ref uuid default null,
    p_dedupe text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
    if p_recipient is null then
        return;
    end if;

    if p_dedupe is not null and exists (
        select 1 from public.notifications
        where recipient_id = p_recipient
          and dedupe_key = p_dedupe
          and created_at > now() - interval '10 minutes'
    ) then
        return;
    end if;

    insert into public.notifications (recipient_id, kind, title, body, href, ref_id, dedupe_key)
    values (p_recipient, p_kind, left(p_title, 200), left(p_body, 300), p_href, p_ref, p_dedupe);
end;
$$;

create or replace function public.notify_admins(
    p_kind text,
    p_title text,
    p_body text,
    p_href text,
    p_ref uuid default null,
    p_dedupe text default null,
    p_owners_only boolean default false,
    p_except uuid default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
    v_admin uuid;
begin
    for v_admin in
        select id from public.profiles
        where role = 'admin'
          and status = 'approved'
          and (not p_owners_only or coalesce(is_owner, false))
          and (p_except is null or id <> p_except)
    loop
        perform public.notify(v_admin, p_kind, p_title, p_body, p_href, p_ref, p_dedupe);
    end loop;
end;
$$;

revoke execute on function public.notify(uuid, text, text, text, text, uuid, text) from public, anon, authenticated;
revoke execute on function public.notify_admins(text, text, text, text, uuid, text, boolean, uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------
-- 3. Triggers. Every one swallows its own errors, so a problem here can
--    never stop a message, invoice or task from being saved.
-- ---------------------------------------------------------------

-- Messages (and announcements)
create or replace function public.trg_notify_message()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
    v_from text;
    v_role text;
begin
    begin
        if new.to_profile_id is null or new.to_profile_id = new.from_profile_id then
            return new;
        end if;

        select full_name into v_from from public.profiles where id = new.from_profile_id;
        select role into v_role from public.profiles where id = new.to_profile_id;

        perform public.notify(
            new.to_profile_id,
            'message',
            case when coalesce(new.is_broadcast, false)
                 then 'Announcement: ' || coalesce(new.subject, '')
                 else 'New message from ' || coalesce(v_from, 'someone') end,
            coalesce(new.subject, ''),
            '/' || coalesce(v_role, 'customer') || '/messages',
            coalesce(new.parent_message_id, new.id)
        );
    exception when others then
        null;
    end;
    return new;
end;
$$;

drop trigger if exists notify_on_message on public.messages;
create trigger notify_on_message after insert on public.messages
    for each row execute function public.trg_notify_message();

-- Invoices
create or replace function public.trg_notify_invoice()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
    v_name text;
begin
    begin
        select full_name into v_name from public.profiles where id = new.customer_id;

        perform public.notify(
            new.customer_id, 'invoice',
            'New invoice: ₦' || to_char(new.amount + new.arrears, 'FM999,999,999'),
            coalesce(new.invoice_month, ''),
            '/customer/invoices/' || new.id, new.id
        );

        perform public.notify_admins(
            'invoice', 'New invoice generated',
            coalesce(v_name, 'A customer') || ' · ₦' || to_char(new.amount + new.arrears, 'FM999,999,999'),
            '/admin/payments', new.id, 'invoice-batch'
        );
    exception when others then
        null;
    end;
    return new;
end;
$$;

drop trigger if exists notify_on_invoice on public.payments;
create trigger notify_on_invoice after insert on public.payments
    for each row execute function public.trg_notify_invoice();

-- A customer says they paid by transfer
create or replace function public.trg_notify_transfer_reported()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
    v_name text;
begin
    begin
        if new.transfer_reported_at is not null and new.transfer_reported_at is distinct from old.transfer_reported_at then
            select full_name into v_name from public.profiles where id = new.customer_id;

            perform public.notify_admins(
                'payment', 'Payment reported by ' || coalesce(v_name, 'a customer'),
                coalesce(new.invoice_month, 'Invoice') || ' · check and confirm',
                '/admin/payments', new.id
            );
        end if;
    exception when others then
        null;
    end;
    return new;
end;
$$;

drop trigger if exists notify_on_transfer_reported on public.payments;
create trigger notify_on_transfer_reported after update of transfer_reported_at on public.payments
    for each row execute function public.trg_notify_transfer_reported();

-- Tasks
create or replace function public.trg_notify_task_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
    begin
        if new.employee_id is not null then
            perform public.notify(
                new.employee_id, 'task', 'New task assigned',
                new.title || coalesce(' · ' || to_char(new.scheduled_date, 'DD Mon'), ''),
                '/employee/tasks', new.id
            );
        end if;

        if new.customer_id is not null then
            if new.auto_generated then
                perform public.notify(
                    new.customer_id, 'task', 'Your pickup schedule was updated',
                    'New pickups have been scheduled for you',
                    '/customer/schedule', null, 'schedule:' || new.customer_id
                );
            else
                perform public.notify(
                    new.customer_id, 'task', 'Pickup scheduled',
                    new.title || coalesce(' · ' || to_char(new.scheduled_date, 'DD Mon'), ''),
                    '/customer/schedule', new.id
                );
            end if;
        end if;
    exception when others then
        null;
    end;
    return new;
end;
$$;

drop trigger if exists notify_on_task_insert on public.tasks;
create trigger notify_on_task_insert after insert on public.tasks
    for each row execute function public.trg_notify_task_insert();

create or replace function public.trg_notify_task_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
    begin
        if new.employee_id is not null and new.employee_id is distinct from old.employee_id then
            perform public.notify(
                new.employee_id, 'task', 'Task assigned to you',
                new.title || coalesce(' · ' || to_char(new.scheduled_date, 'DD Mon'), ''),
                '/employee/tasks', new.id
            );
            perform public.notify(
                new.customer_id, 'task', 'Your pickup has been assigned',
                new.title || coalesce(' · ' || to_char(new.scheduled_date, 'DD Mon'), ''),
                '/customer/schedule', new.id
            );
        end if;

        if new.scheduled_date is distinct from old.scheduled_date and new.scheduled_date is not null then
            perform public.notify(
                new.customer_id, 'task', 'Pickup date changed',
                new.title || ' · now ' || to_char(new.scheduled_date, 'DD Mon'),
                '/customer/schedule', new.id
            );
            perform public.notify(
                new.employee_id, 'task', 'Task date changed',
                new.title || ' · now ' || to_char(new.scheduled_date, 'DD Mon'),
                '/employee/tasks', new.id
            );
        end if;

        -- Pickups marked serviced because their date passed do not ring anyone.
        -- A reopened pickup has its own notification, so it is left out here.
        if new.status is distinct from old.status
           and not (new.status = 'completed' and new.scheduled_date is not null
                    and new.scheduled_date < (now() at time zone 'Africa/Lagos')::date)
           and not (old.status = 'completed' and new.status = 'pending') then
            perform public.notify(
                new.customer_id, 'task',
                case new.status when 'in progress' then 'Your pickup is under way'
                                when 'completed' then 'Your pickup is done'
                                else 'Pickup ' || new.status end,
                new.title, '/customer/schedule', new.id
            );
            perform public.notify_admins(
                'task', 'Task ' || new.status, new.title, '/admin/tasks', new.id
            );
        end if;
    exception when others then
        null;
    end;
    return new;
end;
$$;

drop trigger if exists notify_on_task_update on public.tasks;
create trigger notify_on_task_update after update on public.tasks
    for each row execute function public.trg_notify_task_update();

-- Photos uploaded
create or replace function public.trg_notify_upload()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
    v_key text := 'photos:' || coalesce(new.customer_id::text, '') || ':' || coalesce(new.task_title, '') || ':' || coalesce(new.photo_type, '');
begin
    begin
        perform public.notify(
            new.customer_id, 'photos', 'New ' || coalesce(new.photo_type, '') || ' photos uploaded',
            coalesce(new.task_title, ''), '/customer/schedule', null, v_key
        );
        perform public.notify_admins(
            'photos', 'New ' || coalesce(new.photo_type, '') || ' photos uploaded',
            coalesce(new.task_title, ''), '/admin/uploads', null, v_key
        );
    exception when others then
        null;
    end;
    return new;
end;
$$;

drop trigger if exists notify_on_upload on public.uploads;
create trigger notify_on_upload after insert on public.uploads
    for each row execute function public.trg_notify_upload();

-- New signups waiting for approval
create or replace function public.trg_notify_signup()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
    begin
        if new.role in ('customer', 'employee') and new.status = 'pending' then
            perform public.notify_admins(
                'signup', 'New signup awaiting approval',
                coalesce(new.full_name, new.email, 'Someone') || ' (' || new.role || ')',
                '/admin/approvals', new.id
            );
        end if;
    exception when others then
        null;
    end;
    return new;
end;
$$;

drop trigger if exists notify_on_signup on public.profiles;
create trigger notify_on_signup after insert on public.profiles
    for each row execute function public.trg_notify_signup();

-- Registration fee: reported by the customer, confirmed by an admin
create or replace function public.trg_notify_registration_fee()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
    v_name text;
begin
    begin
        if new.registration_fee_submitted_at is not null
           and new.registration_fee_submitted_at is distinct from old.registration_fee_submitted_at
           and not new.registration_fee_paid then
            select full_name into v_name from public.profiles where id = new.profile_id;

            perform public.notify_admins(
                'payment', 'Registration fee reported by ' || coalesce(v_name, 'a customer'),
                'Check and confirm it', '/admin/payments#registration-fees', new.profile_id
            );
        end if;

        if new.registration_fee_paid and not old.registration_fee_paid then
            perform public.notify(new.profile_id, 'payment', 'Registration fee confirmed', 'Your dashboard is open', '/customer', new.profile_id);
        end if;
    exception when others then
        null;
    end;
    return new;
end;
$$;

drop trigger if exists notify_on_registration_fee on public.customers;
create trigger notify_on_registration_fee after update of registration_fee_submitted_at, registration_fee_paid on public.customers
    for each row execute function public.trg_notify_registration_fee();

-- An already approved customer finishes their property form. Anyone still
-- pending is already announced (and emailed) as a new signup, so this is only
-- for people approved before they filled it in.
create or replace function public.trg_notify_setup_finished()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
    v_status text;
begin
    begin
        select status into v_status from public.profiles where id = new.profile_id;

        if v_status = 'approved' then
            perform public.notify_admins(
                'signup', coalesce(new.full_name, 'A customer') || ' finished their property form',
                'Set up their pickup schedule and check the registration fee',
                '/admin/customers/' || new.profile_id, new.profile_id
            );
        end if;
    exception when others then
        null;
    end;
    return new;
end;
$$;

drop trigger if exists notify_on_setup_finished on public.customers;
create trigger notify_on_setup_finished after insert on public.customers
    for each row execute function public.trg_notify_setup_finished();

-- ---------------------------------------------------------------
-- 4. Triggers on tables that may not exist yet
-- ---------------------------------------------------------------

-- Receipts: a payment recorded against an invoice
create or replace function public.trg_notify_receipt()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
    v_customer uuid;
begin
    begin
        select customer_id into v_customer from public.payments where id = new.payment_id;

        perform public.notify(
            v_customer, 'receipt',
            'Receipt ready: ₦' || to_char(new.amount, 'FM999,999,999') || ' received',
            case when new.balance_after = 0 then 'Your invoice is paid in full'
                 else '₦' || to_char(new.balance_after, 'FM999,999,999') || ' is still owed' end,
            '/customer/receipts/' || new.id, new.id
        );
    exception when others then
        null;
    end;
    return new;
end;
$$;

create or replace function public.trg_notify_expense()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
    v_name text;
begin
    begin
        if tg_op = 'INSERT' then
            select full_name into v_name from public.profiles where id = new.employee_id;

            perform public.notify_admins(
                'expense', 'New expense from ' || coalesce(v_name, 'staff'),
                '₦' || to_char(new.amount, 'FM999,999,999') || ' · ' || new.category, '/admin/expenses', new.id
            );
        elsif new.status is distinct from old.status then
            perform public.notify(
                new.employee_id, 'expense', 'Expense ' || new.status,
                '₦' || to_char(new.amount, 'FM999,999,999') || ' · ' || new.category, '/employee/expenses', new.id
            );
        end if;
    exception when others then
        null;
    end;
    return new;
end;
$$;

-- What admins change, for owners to follow along
create or replace function public.trg_notify_activity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
    begin
        perform public.notify_admins(
            'activity', coalesce(new.actor_name, 'An admin'), new.summary,
            '/admin/activity', null, null, true, new.actor_id
        );
    exception when others then
        null;
    end;
    return new;
end;
$$;

do $$
begin
    if to_regclass('public.payment_installments') is not null then
        drop trigger if exists notify_on_receipt on public.payment_installments;
        create trigger notify_on_receipt after insert on public.payment_installments
            for each row execute function public.trg_notify_receipt();
    end if;

    if to_regclass('public.expenses') is not null then
        drop trigger if exists notify_on_expense on public.expenses;
        create trigger notify_on_expense after insert or update of status on public.expenses
            for each row execute function public.trg_notify_expense();
    end if;

    if to_regclass('public.activity_log') is not null then
        drop trigger if exists notify_on_activity on public.activity_log;
        create trigger notify_on_activity after insert on public.activity_log
            for each row execute function public.trg_notify_activity();
    end if;
end
$$;

select 'done' as result;
