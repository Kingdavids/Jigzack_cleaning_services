import type { SupabaseClient } from "@supabase/supabase-js";
import { BILLABLE_SELECT, generateInvoiceFor, generateScheduleFor, type BillableCustomer } from "@/lib/billing/generate";

// The bulk runs behind the admin "Generate" buttons and the scheduled job.
// They take whichever client the caller has (a signed-in admin's, or the
// service client the scheduled job uses) so both paths share one code path.

export async function approvedBillableCustomers(supabase: SupabaseClient) {
    const { data: profiles } = await supabase
        .from("profiles")
        .select("id")
        .eq("role", "customer")
        .eq("status", "approved");

    const ids = (profiles ?? []).map((p) => p.id as string);
    if (ids.length === 0) return [];

    const { data } = await supabase
        .from("customers")
        .select(BILLABLE_SELECT)
        .in("profile_id", ids)
        .is("unit_id", null)
        .eq("status", "active");

    return (data ?? []) as unknown as BillableCustomer[];
}

export async function runScheduleGeneration(supabase: SupabaseClient) {
    const customers = await approvedBillableCustomers(supabase);
    let created = 0;
    let unrecognised = 0;

    for (const customer of customers) {
        const result = await generateScheduleFor(supabase, customer);
        created += result.created;
        if (!result.recognised) unrecognised += 1;
    }

    return { customers: customers.length, created, unrecognised };
}

export async function runInvoiceGeneration(supabase: SupabaseClient) {
    const customers = await approvedBillableCustomers(supabase);
    const tally = { created: 0, exists: 0, "no-pricing": 0, error: 0 };

    for (const customer of customers) {
        tally[await generateInvoiceFor(supabase, customer)] += 1;
    }

    return { customers: customers.length, ...tally };
}
