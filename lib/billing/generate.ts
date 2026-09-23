import type { createClient } from "@/utils/supabase/server";
import type { FacilityDetails } from "@/lib/customer/facilities";
import { buildLineItems, itemsTotal, monthLabel } from "@/lib/billing/pricing";
import { addDays, describeFrequency, generateDates, parseFrequency, todayKey } from "@/lib/billing/schedule";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

export type BillableCustomer = {
    profile_id: string | null;
    full_name: string | null;
    lga: string | null;
    preferred_pickup_frequency: string | null;
    facility_details: FacilityDetails;
    vacancies: FacilityDetails;
    unit_id?: string | null;
};

export const BILLABLE_SELECT =
    "profile_id, full_name, lga, preferred_pickup_frequency, facility_details, vacancies, unit_id";

// Creates pending pickups from the customer's stated frequency, skipping any
// date that already has a task. Unassigned (no employee) until an admin
// assigns them; everything about them stays editable.
export async function generateScheduleFor(supabase: SupabaseServerClient, customer: BillableCustomer, horizonDays = 28) {
    if (!customer.profile_id) return { created: 0, frequency: "", recognised: false };

    const frequency = parseFrequency(customer.preferred_pickup_frequency);
    const today = todayKey();
    const dates = generateDates(frequency, addDays(today, 2), horizonDays);

    const { data: existing } = await supabase
        .from("tasks")
        .select("scheduled_date")
        .eq("customer_id", customer.profile_id)
        .gte("scheduled_date", today);

    const taken = new Set((existing ?? []).map((t) => t.scheduled_date as string));
    const fresh = dates.filter((date) => !taken.has(date));

    if (fresh.length > 0) {
        const { error } = await supabase.from("tasks").insert(
            fresh.map((date) => ({
                title: "Scheduled pickup",
                customer_id: customer.profile_id,
                scheduled_date: date,
                zone: customer.lga,
                auto_generated: true,
            }))
        );

        if (error) {
            console.error("generateScheduleFor insert error:", error.message);
            return { created: 0, frequency: describeFrequency(frequency), recognised: frequency.kind !== "unknown" };
        }
    }

    return {
        created: fresh.length,
        frequency: describeFrequency(frequency),
        recognised: frequency.kind !== "unknown",
    };
}

export type InvoiceOutcome = "created" | "exists" | "no-pricing" | "error";

// One invoice per customer per month, computed from their property details
// (minus vacant units). An existing invoice for the month, manual or not, is
// never touched.
export async function generateInvoiceFor(
    supabase: SupabaseServerClient,
    customer: BillableCustomer,
    month: string = monthLabel()
): Promise<InvoiceOutcome> {
    if (!customer.profile_id) return "error";

    const items = buildLineItems(customer.facility_details, customer.vacancies);
    if (items.length === 0) return "no-pricing";

    const { data: existing } = await supabase
        .from("payments")
        .select("id")
        .eq("customer_id", customer.profile_id)
        .eq("invoice_month", month)
        .limit(1);

    if (existing && existing.length > 0) return "exists";

    const { error } = await supabase.from("payments").insert({
        customer_id: customer.profile_id,
        amount: itemsTotal(items),
        arrears: 0,
        units: items.reduce((sum, item) => sum + item.quantity, 0) || 1,
        description: `Waste management service charge, ${month}`,
        invoice_month: month,
        line_items: items,
        auto_generated: true,
    });

    if (error) {
        console.error("generateInvoiceFor insert error:", error.message);
        return "error";
    }

    return "created";
}

// Re-prices an unpaid, still-automatic invoice after the property details or
// vacancies change. Manually edited invoices (auto_generated = false) are
// left alone on purpose.
export async function recalculateOpenInvoice(
    supabase: SupabaseServerClient,
    customer: BillableCustomer,
    month: string = monthLabel()
) {
    if (!customer.profile_id) return false;

    const items = buildLineItems(customer.facility_details, customer.vacancies);
    if (items.length === 0) return false;

    const { data, error } = await supabase
        .from("payments")
        .update({
            amount: itemsTotal(items),
            units: items.reduce((sum, item) => sum + item.quantity, 0) || 1,
            line_items: items,
        })
        .eq("customer_id", customer.profile_id)
        .eq("invoice_month", month)
        .eq("auto_generated", true)
        .neq("status", "paid")
        .select("id");

    if (error) {
        console.error("recalculateOpenInvoice error:", error.message);
        return false;
    }

    return Boolean(data && data.length > 0);
}
