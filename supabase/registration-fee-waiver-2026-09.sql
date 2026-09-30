-- Ticking "Existing customer, no registration fee" at approval only worked if
-- that customer had already filled in their property form (so their
-- customers row existed yet to update); otherwise the waiver was lost and the
-- fee gate still came up for them later. The intent is now also recorded on
-- their profile, and a trigger applies it automatically the moment their
-- customer row is created, whichever order those two things happen in. Safe
-- to run more than once. Run it in the Supabase SQL editor.

alter table public.profiles add column if not exists registration_fee_waived boolean not null default false;

create or replace function public.apply_registration_fee_waiver()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
    if new.registration_fee_paid is distinct from true and exists (
        select 1 from public.profiles where id = new.profile_id and registration_fee_waived = true
    ) then
        new.registration_fee_paid := true;
        new.registration_fee_paid_at := now();
        new.registration_fee_reference := coalesce(new.registration_fee_reference, 'Existing customer, fee waived');
    end if;

    return new;
end;
$$;

drop trigger if exists apply_registration_fee_waiver on public.customers;
create trigger apply_registration_fee_waiver
    before insert on public.customers
    for each row execute function public.apply_registration_fee_waiver();

select 'done' as result;
