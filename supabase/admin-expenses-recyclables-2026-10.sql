-- 1. Admins can log expenses (with a receipt), and are not alerted about their
--    own entries. 2. Recyclable waste: kilograms collected in and sold or
--    dispatched out, per material. Safe to run more than once. Run it in the
--    Supabase SQL editor.

-- ---------------------------------------------------------------
-- 1a. Admins may upload expense receipts, to their own folder like staff do.
-- ---------------------------------------------------------------
drop policy if exists "expense_receipts_upload_admin" on storage.objects;
create policy "expense_receipts_upload_admin" on storage.objects
    for insert to authenticated with check (
        bucket_id = 'expense-receipts'
        and (storage.foldername(name)) [1] = auth.uid()::text
        and public.is_admin()
    );

-- ---------------------------------------------------------------
-- 1b. Only claims waiting for review alert the admins. An expense an admin
--     logs is approved on the spot.
-- ---------------------------------------------------------------
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
            if new.status = 'submitted' then
                select full_name into v_name from public.profiles where id = new.employee_id;

                perform public.notify_admins(
                    'expense', 'New expense from ' || coalesce(v_name, 'staff'),
                    '₦' || to_char(new.amount, 'FM999,999,999') || ' · ' || new.category, '/admin/expenses', new.id
                );
            end if;
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

-- ---------------------------------------------------------------
-- 2. Recyclable waste movements
--    in  = collected or received; out = sold or dispatched.
-- ---------------------------------------------------------------
create table if not exists public.recyclable_movements (
    id uuid primary key default gen_random_uuid(),
    direction text not null check (direction in ('in', 'out')),
    material text not null check (material in ('plastic', 'pet_bottles', 'cans', 'metal', 'paper', 'glass', 'electronics', 'other')),
    -- For "other": what it is.
    material_note text,
    kg numeric(12, 2) not null check (kg > 0),
    movement_date date not null default current_date,
    -- Where it came from (in) or who took it (out).
    party text,
    note text,
    recorded_by uuid references public.profiles (id) on delete set null,
    created_at timestamptz not null default now()
);

create index if not exists recyclable_movements_date_idx on public.recyclable_movements (movement_date desc);

alter table public.recyclable_movements enable row level security;

drop policy if exists "recyclables_select_reader" on public.recyclable_movements;
create policy "recyclables_select_reader" on public.recyclable_movements
    for select to authenticated using (public.is_staff_reader());

drop policy if exists "recyclables_insert_admin" on public.recyclable_movements;
create policy "recyclables_insert_admin" on public.recyclable_movements
    for insert to authenticated with check (public.is_admin());

drop policy if exists "recyclables_update_admin" on public.recyclable_movements;
create policy "recyclables_update_admin" on public.recyclable_movements
    for update to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "recyclables_delete_admin" on public.recyclable_movements;
create policy "recyclables_delete_admin" on public.recyclable_movements
    for delete to authenticated using (public.is_admin());

select 'done' as result;
