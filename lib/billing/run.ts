import type { SupabaseClient } from "@supabase/supabase-js";
import { generateInvoiceFor, generateScheduleFor, queryBillable, type BillableCustomer } from "@/lib/billing/generate";

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

    const data = await queryBillable((select) =>
        supabase.from("customers").select(select).in("profile_id", ids).is("unit_id", null).eq("status", "active")
    );

    return (data ?? []) as unknown as BillableCustomer[];
}

// Pickups are set up one customer at a time by an admin. This only keeps the
// schedule going for customers who already have one that was generated for
// them, so it never starts a schedule nobody asked for.
async function customersWithGeneratedSchedule(supabase: SupabaseClient) {
    const { data } = await supabase.from("tasks").select("customer_id").eq("auto_generated", true).limit(5000);

    return new Set((data ?? []).map((row) => row.customer_id as string | null).filter((id): id is string => Boolean(id)));
}

export async function runScheduleGeneration(supabase: SupabaseClient) {
    const scheduled = await customersWithGeneratedSchedule(supabase);
    const customers = (await approvedBillableCustomers(supabase)).filter((c) => c.profile_id && scheduled.has(c.profile_id));
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
    const tally = { created: 0, exists: 0, "no-pricing": 0, prepaid: 0, error: 0 };

    for (const customer of customers) {
        tally[await generateInvoiceFor(supabase, customer)] += 1;
    }

    return { customers: customers.length, ...tally };
}
