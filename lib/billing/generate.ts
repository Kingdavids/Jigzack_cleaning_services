import type { SupabaseClient } from "@supabase/supabase-js";
import type { FacilityDetails } from "@/lib/customer/facilities";
import { buildLineItems, itemsTotal, monthLabel, type LineItem } from "@/lib/billing/pricing";
import { amountPaid } from "@/lib/billing/balance";
import { isMonthPrepaid } from "@/lib/billing/prepaid";
import {
    addDays,
    customerFrequency,
    describeFrequency,
    generateDates,
    monthWindow,
    parseFrequency,
    todayKey,
    type Frequency,
    type SchedulePeriod,
} from "@/lib/billing/schedule";

type SupabaseServerClient = SupabaseClient;

export type BillableCustomer = {
    profile_id: string | null;
    full_name: string | null;
    lga: string | null;
    preferred_pickup_frequency: string | null;
    facility_details: FacilityDetails;
    vacancies: FacilityDetails;
    unit_id?: string | null;
    // A charge the admin set for this customer. Empty means work it out from
    // their property details.
    monthly_rate?: number | string | null;
    // The weekdays an admin chose for this customer (Monday = 1). Empty means use the text.
    pickup_days?: number[] | null;
};

const BILLABLE_BASE = "profile_id, full_name, lga, preferred_pickup_frequency, facility_details, vacancies, unit_id";

// monthly_rate comes from supabase/billing-installments-2026-09.sql and pickup_days
// from supabase/schedule-days-2026-09.sql.
export const BILLABLE_SELECT = `${BILLABLE_BASE}, monthly_rate, pickup_days`;
const BILLABLE_WITH_RATE = `${BILLABLE_BASE}, monthly_rate`;

// Runs a customers query with monthly_rate, or without it if that SQL has not
// been run yet, so approvals and the daily job keep working in between.
export async function queryBillable(run: (select: string) => PromiseLike<{ data: unknown; error: unknown }>) {
    const first = await run(BILLABLE_SELECT);
    if (!first.error) return first.data;

    const second = await run(BILLABLE_WITH_RATE);
    if (!second.error) return second.data;

    return (await run(BILLABLE_BASE)).data;
}

export async function loadBillable(supabase: SupabaseServerClient, profileId: string) {
    const data = await queryBillable((select) => supabase.from("customers").select(select).eq("profile_id", profileId).maybeSingle());
    return (data ?? null) as unknown as BillableCustomer | null;
}

// What a month costs this customer: their set monthly charge if there is one,
// otherwise the per-unit prices from their property details.
export function chargeItems(customer: BillableCustomer): LineItem[] {
    const rate = Number(customer.monthly_rate ?? 0);

    if (Number.isFinite(rate) && rate > 0) {
        return [{ label: "Monthly waste management service", quantity: 1, unit_price: rate }];
    }

    return buildLineItems(customer.facility_details, customer.vacancies);
}

export type PlanOptions = {
    // How far ahead to look when no month is chosen. Four weeks by default.
    horizonDays?: number;
    // The admin's own wording for how often, for example "3 times a week".
    frequencyText?: string | null;
    // Weekdays picked by hand (Monday = 1 ... Saturday = 6). These win over any wording.
    days?: number[] | null;
    // Plan a whole calendar month instead of the next four weeks.
    period?: SchedulePeriod | null;
};

// Which frequency to plan for, and where it came from: days picked by hand, the
// admin's own wording, days saved for this customer, or what they wrote.
function resolveFrequency(customer: BillableCustomer, options: PlanOptions): { frequency: Frequency; source: string } {
    const picked = [...new Set((options.days ?? []).filter((d) => d >= 1 && d <= 6))].sort();

    if (picked.length > 0) return { frequency: { kind: "weekdays", days: picked }, source: "days chosen" };

    if (options.frequencyText?.trim()) {
        return { frequency: parseFrequency(options.frequencyText), source: options.frequencyText.trim() };
    }

    const hasSaved = (customer.pickup_days ?? []).length > 0;

    return {
        frequency: customerFrequency(customer),
        source: hasSaved ? "days saved for this customer" : (customer.preferred_pickup_frequency ?? "").trim(),
    };
}

// Works out which pickups would be created, without creating them. The
// frequency comes from the customer's saved days or their property details
// unless an admin passes their own, and it covers either the next four weeks or
// a whole month.
export async function planSchedule(supabase: SupabaseServerClient, customer: BillableCustomer, options: PlanOptions = {}) {
    const { frequency, source } = resolveFrequency(customer, options);
    const today = todayKey();
    const window = options.period
        ? monthWindow(options.period, today)
        : { startKey: addDays(today, 2), horizonDays: options.horizonDays ?? 28, label: "the next 4 weeks" };

    const dates = window.horizonDays < 0 ? [] : generateDates(frequency, window.startKey, window.horizonDays);

    const { data: existing } = customer.profile_id
        ? await supabase.from("tasks").select("scheduled_date").eq("customer_id", customer.profile_id).gte("scheduled_date", today)
        : { data: [] as { scheduled_date: string }[] };

    const taken = new Set((existing ?? []).map((t) => t.scheduled_date as string));
    const fresh = dates.filter((date) => !taken.has(date));

    return {
        frequency,
        source,
        label: describeFrequency(frequency),
        recognised: frequency.kind !== "unknown",
        fresh,
        alreadyScheduled: dates.length - fresh.length,
        windowLabel: window.label,
    };
}

// Creates pending pickups from the customer's frequency, skipping any date that
// already has a task. Unassigned (no employee) until an admin assigns them;
// everything about them stays editable.
export async function generateScheduleFor(supabase: SupabaseServerClient, customer: BillableCustomer, options: PlanOptions = {}) {
    if (!customer.profile_id) return { created: 0, frequency: "", recognised: false };

    const { frequency, fresh } = await planSchedule(supabase, customer, options);

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

export type InvoiceOutcome = "created" | "exists" | "no-pricing" | "prepaid" | "error";

// One invoice per customer per month, computed from their property details
// (minus vacant units). An existing invoice for the month, manual or not, is
// never touched.
export async function generateInvoiceFor(
    supabase: SupabaseServerClient,
    customer: BillableCustomer,
    month: string = monthLabel()
): Promise<InvoiceOutcome> {
    if (!customer.profile_id) return "error";

    // A month the customer paid for in advance gets no invoice.
    if (await isMonthPrepaid(supabase, customer.profile_id, month)) return "prepaid";

    const items = chargeItems(customer);
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

    const items = chargeItems(customer);
    if (items.length === 0) return false;

    const { data: open, error: findError } = await supabase
        .from("payments")
        .select("*")
        .eq("customer_id", customer.profile_id)
        .eq("invoice_month", month)
        .eq("auto_generated", true)
        .neq("status", "paid");

    if (findError) {
        console.error("recalculateOpenInvoice error:", findError.message);
        return false;
    }

    // An invoice that already has money paid against it keeps its figures, so a
    // receipt that was issued never stops adding up.
    const ids = (open ?? []).filter((row) => amountPaid(row) === 0).map((row) => row.id as string);
    if (ids.length === 0) return false;

    const { data, error } = await supabase
        .from("payments")
        .update({
            amount: itemsTotal(items),
            units: items.reduce((sum, item) => sum + item.quantity, 0) || 1,
            line_items: items,
        })
        .in("id", ids)
        .select("id");

    if (error) {
        console.error("recalculateOpenInvoice error:", error.message);
        return false;
    }

    return Boolean(data && data.length > 0);
}
