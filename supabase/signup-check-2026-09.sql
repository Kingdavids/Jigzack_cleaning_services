-- Signups that are in Supabase but not in the admin area.
-- Run the checks first (blocks 1 and 2). Block 3 repairs the one cause the app
-- cannot show you. Safe to run more than once. Run it in the Supabase SQL editor.

-- ---------------------------------------------------------------
-- 1. What is going on: how many people fall into each group
-- ---------------------------------------------------------------
select 'A. logins with no profile row (invisible in the app)' as what, count(*) as people
from auth.users u
left join public.profiles p on p.id = u.id
where p.id is null
union all
select 'B. customer profiles with no property form yet (now listed under Customers)', count(*)
from public.profiles p
where p.role = 'customer'
  and not exists (select 1 from public.customers c where c.profile_id = p.id)
union all
select 'C. pending signups (in Signup approvals)', count(*) from public.profiles where status = 'pending'
union all
select 'D. customers in Recently deleted', count(*) from public.customers where status = 'deleted'
union all
select 'E. customer records with no login', count(*) from public.customers where profile_id is null;

-- ---------------------------------------------------------------
-- 2. Who they are: logins that have no profile (group A)
-- ---------------------------------------------------------------
select u.id, u.email, u.created_at, u.email_confirmed_at is not null as email_confirmed
from auth.users u
left join public.profiles p on p.id = u.id
where p.id is null
order by u.created_at desc;

-- ---------------------------------------------------------------
-- 3. Repair group A: give each of them a profile as a pending customer, so they
--    appear in Signup approvals. Nobody is approved automatically.
-- ---------------------------------------------------------------
insert into public.profiles (id, full_name, email, role, status)
select
    u.id,
    coalesce(u.raw_user_meta_data ->> 'full_name', split_part(u.email, '@', 1)),
    u.email,
    'customer',
    'pending'
from auth.users u
left join public.profiles p on p.id = u.id
where p.id is null
  and u.email is not null;

select 'done' as result;
