import type { SupabaseClient } from "@supabase/supabase-js";
import type { FacilityDetails } from "@/lib/customer/facilities";
import { buildLineItems, itemsTotal, monthLabel, unitLineItems, unitsCoverBilling, type EstateUnit, type LineItem } from "@/lib/billing/pricing";
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
    // True for an estate account, billed for its units rather than for itself.
    is_estate?: boolean | null;
    // A charge the admin set for this customer. Empty means work it out from
    // their property details.
    monthly_rate?: number | string | null;
    // The weekdays an admin chose for this customer (Monday = 1). Empty means use the text.
    pickup_days?: number[] | null;
    // A discount given to this customer, taken off their monthly charge.
    discount_type?: "percent" | "amount" | null;
    discount_value?: number | string | null;
    discount_reason?: string | null;
    // Arrears waiting to land on their next invoice (or their current one, if
    // it is still untouched). Cleared once it lands on one, so it is only ever
    // added once.
    arrears?: number | string | null;
};

const BILLABLE_BASE = "profile_id, full_name, lga, preferred_pickup_frequency, facility_details, vacancies, unit_id, is_estate";
const BILLABLE_WITH_RATE = `${BILLABLE_BASE}, monthly_rate`;
const BILLABLE_WITH_DAYS = `${BILLABLE_WITH_RATE}, pickup_days`;
const BILLABLE_WITH_DISCOUNT = `${BILLABLE_WITH_DAYS}, discount_type, discount_value, discount_reason`;

// monthly_rate comes from supabase/billing-installments-2026-09.sql, pickup_days
// from supabase/schedule-days-2026-09.sql, discount from
// supabase/customer-discount-2026-09.sql, and arrears from
// supabase/customer-arrears-2026-09.sql.
export const BILLABLE_SELECT = `${BILLABLE_WITH_DISCOUNT}, arrears`;

// Runs a customers query with everything above, falling back a step at a time
// for whichever of those SQL files has not been run yet, so approvals and the
// daily job keep working in between.
export async function queryBillable(run: (select: string) => PromiseLike<{ data: unknown; error: unknown }>) {
    for (const select of [BILLABLE_SELECT, BILLABLE_WITH_DISCOUNT, BILLABLE_WITH_DAYS, BILLABLE_WITH_RATE]) {
        const result = await run(select);
        if (!result.error) return result.data;
    }

    return (await run(BILLABLE_BASE)).data;
}

export async function loadBillable(supabase: SupabaseServerClient, profileId: string) {
    const data = await queryBillable((select) => supabase.from("customers").select(select).eq("profile_id", profileId).maybeSingle());
    return (data ?? null) as unknown as BillableCustomer | null;
}

const UNITS_WITH_PRICING = "id, label, property_type, monthly_rate, is_vacant, quantity";
const UNITS_WITH_PRICING_NO_QTY = "id, label, property_type, monthly_rate, is_vacant";
const UNITS_BASE = "id, label";

// An estate's units, with their price if that SQL has been run. Empty for a
// non-estate customer, and plain label-only units before the pricing columns
// exist, so an estate stays billed the old way until it is.
export async function loadEstateUnits(supabase: SupabaseServerClient, estateProfileId: string): Promise<EstateUnit[]> {
    const { data, error } = await supabase.from("units").select(UNITS_WITH_PRICING).eq("estate_profile_id", estateProfileId);

    if (!error) return (data ?? []) as unknown as EstateUnit[];

    const noQty = await supabase.from("units").select(UNITS_WITH_PRICING_NO_QTY).eq("estate_profile_id", estateProfileId);
    if (!noQty.error) return ((noQty.data ?? []) as unknown as EstateUnit[]).map((u) => ({ ...u, quantity: 1 }));

    const fallback = await supabase.from("units").select(UNITS_BASE).eq("estate_profile_id", estateProfileId);
    return ((fallback.data ?? []) as { id: string; label: string }[]).map((u) => ({
        ...u,
        property_type: null,
        monthly_rate: null,
        is_vacant: false,
        quantity: 1,
    }));
}

// What a discount takes off, capped so a charge never goes below zero.
function discountAmount(customer: BillableCustomer, baseTotal: number): number {
    const value = Number(customer.discount_value ?? 0);
    if (!customer.discount_type || !Number.isFinite(value) || value <= 0 || baseTotal <= 0) return 0;

    const raw = customer.discount_type === "percent" ? (baseTotal * Math.min(value, 100)) / 100 : value;

    return Math.min(Math.round(raw * 100) / 100, baseTotal);
}

// "10" instead of "10.0", but "12.5" kept as it is. Used anywhere a discount
// percentage is shown, so a flat-amount discount reads the same way a
// percentage one does.
export function formatPercent(value: number): string {
    const rounded = Math.round(value * 10) / 10;
    return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

// What an estate charges before any account-wide override or discount: each
// unit's own price once every unit has a type, otherwise the counts on the
// estate's own property form, exactly as a non-estate customer is priced.
function baseChargeItems(customer: BillableCustomer, units?: EstateUnit[]): LineItem[] {
    if (customer.is_estate && units && unitsCoverBilling(units)) {
        return unitLineItems(units);
    }

    return buildLineItems(customer.facility_details, customer.vacancies);
}

// What a month costs this customer: their set monthly charge if there is one,
// otherwise their units' own prices (for an estate that has them) or the
// per-unit prices from their property details, minus any discount they have
// been given. `units` only matters for an estate; pass it whenever you have it.
export function chargeItems(customer: BillableCustomer, units?: EstateUnit[]): LineItem[] {
    const rate = Number(customer.monthly_rate ?? 0);

    const base =
        Number.isFinite(rate) && rate > 0
            ? [{ label: "Monthly waste management service", quantity: 1, unit_price: rate }]
            : baseChargeItems(customer, units);

    if (base.length === 0) return base;

    const baseTotal = itemsTotal(base);
    const discount = discountAmount(customer, baseTotal);
    if (discount <= 0) return base;

    // Worked out as a percentage of the base charge either way, so a discount
    // given as a flat amount still reads as a percentage on the invoice, the
    // same as one given as a percentage.
    const percent = formatPercent((discount / baseTotal) * 100);
    const reasonTag = customer.discount_reason?.trim() ? `: ${customer.discount_reason.trim()}` : "";
    const label = `Discount (${percent}%)${reasonTag}`;

    return [...base, { label, quantity: 1, unit_price: -discount }];
}

// The narrow slice of a customer's record needed to work out their discount,
// used wherever a screen wants to show "this customer is on a discount"
// without loading everything chargeItems needs.
export type DiscountableCustomer = Pick<
    BillableCustomer,
    "facility_details" | "vacancies" | "monthly_rate" | "discount_type" | "discount_value" | "discount_reason" | "is_estate"
>;

export type DiscountInfo = {
    type: "percent" | "amount";
    value: number;
    reason: string | null;
    // Always the percentage, whichever way the discount was set.
    percent: string;
};

// The discount a customer currently has, expressed as a percentage of what
// they would otherwise be charged. Returns null when they have none, or when
// there is nothing yet to work a percentage out of. `units` only matters for
// an estate; pass it whenever you have it.
export function discountInfo(customer: DiscountableCustomer, units?: EstateUnit[]): DiscountInfo | null {
    if (!customer.discount_type) return null;

    const rate = Number(customer.monthly_rate ?? 0);
    const base =
        Number.isFinite(rate) && rate > 0 ? rate : itemsTotal(baseChargeItems(customer as BillableCustomer, units));

    const value = Number(customer.discount_value ?? 0);
    const amount = discountAmount(customer as BillableCustomer, base);
    if (amount <= 0) return null;

    return {
        type: customer.discount_type,
        value,
        reason: customer.discount_reason?.trim() || null,
        percent: formatPercent((amount / base) * 100),
    };
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

    // Their last pickup before the window, so weekly, fortnightly and monthly
    // pickups carry on from the same day rather than restarting.
    const { data: lastBefore } = customer.profile_id
        ? await supabase
              .from("tasks")
              .select("scheduled_date")
              .eq("customer_id", customer.profile_id)
              .neq("status", "declined")
              .lt("scheduled_date", window.startKey)
              .order("scheduled_date", { ascending: false })
              .limit(1)
        : { data: [] as { scheduled_date: string }[] };

    const anchor = (lastBefore?.[0]?.scheduled_date as string | undefined) ?? null;
    const dates = window.horizonDays < 0 ? [] : generateDates(frequency, window.startKey, window.horizonDays, anchor);

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

// customers.arrears is money owed from before, waiting to be put on an
// invoice. Once it is on one it is owed there, so the waiting figure goes back
// to zero; otherwise every later invoice would charge it again. Only cleared
// if it is still the amount that landed, so a change made meanwhile survives.
export async function clearPendingArrears(supabase: SupabaseServerClient, profileId: string, landed: number) {
    const { error } = await supabase.from("customers").update({ arrears: 0 }).eq("profile_id", profileId).eq("arrears", landed);
    if (error) console.error("clearPendingArrears error:", error.message);
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

    const units = customer.is_estate ? await loadEstateUnits(supabase, customer.profile_id) : undefined;
    const items = chargeItems(customer, units);
    if (items.length === 0) return "no-pricing";

    // An invoice for this month already, or one made by hand covering several
    // months including this one. Before the covered_months column exists, only
    // the month itself is checked.
    const byMonth = supabase.from("payments").select("id").eq("customer_id", customer.profile_id);
    const covered = await byMonth.or(`invoice_month.eq."${month}",covered_months.cs.{"${month}"}`).limit(1);
    const { data: existing } = covered.error
        ? await supabase.from("payments").select("id").eq("customer_id", customer.profile_id).eq("invoice_month", month).limit(1)
        : covered;

    if (existing && existing.length > 0) return "exists";

    // Arrears waiting from their Billing section land on this invoice, once.
    const arrears = Number(customer.arrears ?? 0) || 0;

    const { error } = await supabase.from("payments").insert({
        customer_id: customer.profile_id,
        amount: itemsTotal(items),
        arrears,
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

    if (arrears > 0) await clearPendingArrears(supabase, customer.profile_id, arrears);

    return "created";
}

// Re-prices an unpaid, still-automatic invoice after the property details,
// vacancies or arrears change. Manually edited invoices (auto_generated =
// false) are left alone on purpose.
export async function recalculateOpenInvoice(
    supabase: SupabaseServerClient,
    customer: BillableCustomer,
    month: string = monthLabel()
) {
    if (!customer.profile_id) return false;

    const units = customer.is_estate ? await loadEstateUnits(supabase, customer.profile_id) : undefined;
    const items = chargeItems(customer, units);
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

    // The invoice keeps the arrears already on it. Only arrears still waiting
    // in the customer's Billing section are put on (and then cleared there).
    const pending = Number(customer.arrears ?? 0) || 0;

    const { data, error } = await supabase
        .from("payments")
        .update({
            amount: itemsTotal(items),
            ...(pending > 0 ? { arrears: pending } : {}),
            units: items.reduce((sum, item) => sum + item.quantity, 0) || 1,
            line_items: items,
        })
        .in("id", ids)
        .select("id");

    if (error) {
        console.error("recalculateOpenInvoice error:", error.message);
        return false;
    }

    if (pending > 0 && data && data.length > 0) await clearPendingArrears(supabase, customer.profile_id, pending);

    return Boolean(data && data.length > 0);
}
