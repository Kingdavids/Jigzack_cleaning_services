-- Lets open pages update the moment an invoice changes: an admin edits it,
-- records a payment, or a customer reports a transfer. Each person still only
-- receives changes to invoices they are allowed to read. Safe to run more than
-- once. Run it in the Supabase SQL editor.

do $$
begin
    if not exists (
        select 1 from pg_publication_tables
        where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'payments'
    ) then
        alter publication supabase_realtime add table public.payments;
    end if;
end
$$;

select 'done' as result;
