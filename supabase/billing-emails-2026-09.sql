-- Run once in the Supabase SQL editor on the live project.
-- Lets the daily job remember which invoice emails it has already sent, so
-- nobody gets the same email twice. Safe to run more than once.

alter table public.payments
    add column if not exists invoice_emailed_at timestamptz,
    add column if not exists reminders_sent integer not null default 0,
    add column if not exists last_reminder_at timestamptz;

select 'done' as result;
