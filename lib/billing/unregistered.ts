import type { SupabaseClient } from "@supabase/supabase-js";
import { billingMonthLabel, itemsTotal, type LineItem } from "@/lib/billing/pricing";
import { phoneKey, type BillTo } from "@/lib/billing/billTo";

// People who are not registered on the app but are billed every month. Each has
// a saved monthly charge, and the billing job on the 25th makes their invoice
// along with the registered customers'. They are not emailed: they have no
// dashboard to open an invoice in, so an admin shares it with them.

export type UnregisteredCustomer = {
    id: string;
    full_name: string;
    property_name: string | null;
    phone: string | null;
    whatsapp_number: string | null;
    email: string | null;
    address: string | null;
    landmark: string | null;
    lga: string | null;
    state: string | null;
    property_type: string | null;
    monthly_rate: number | string;
    paused: boolean;
    note: string | null;
    created_at: string;
};

export const UNREGISTERED_COLUMNS =
    "id, full_name, property_name, phone, whatsapp_number, email, address, landmark, lga, state, property_type, monthly_rate, paused, note, created_at";

export const monthlyChargeOf = (person: Pick<UnregisteredCustomer, "monthly_rate">) => {
    const rate = Number(person.monthly_rate);
    return Number.isFinite(rate) && rate > 0 ? rate : 0;
};

// The single line their invoice carries.
export function unregisteredLineItems(person: Pick<UnregisteredCustomer, "monthly_rate">): LineItem[] {
    const rate = monthlyChargeOf(person);
    return rate > 0 ? [{ label: "Monthly waste management service", quantity: 1, unit_price: rate }] : [];
}

// Who the invoice is made out to, in the same shape an admin's one-off invoice uses.
export function billToOfPerson(person: UnregisteredCustomer): BillTo {
    return {
        full_name: person.full_name,
        property_name: person.property_name,
        phone: person.phone,
        whatsapp_number: person.whatsapp_number,
        email: person.email,
        address: person.address,
        landmark: person.landmark,
        lga: person.lga,
        state: person.state,
        property_type: person.property_type,
        facility_details: null,
    };
}

// The ways an invoice or an advance payment can point at the same person: their
// email, the last ten digits of their phone, or their name.
export function identityKeys(person: { email?: string | null; phone?: string | null; full_name?: string | null }) {
    const keys = [person.email?.trim().toLowerCase(), phoneKey(person.phone), person.full_name?.trim().toLowerCase()];
    return new Set(keys.filter((key): key is string => Boolean(key)));
}

export function sameIdentity(a: Set<string>, b: Set<string>) {
    for (const key of a) if (b.has(key)) return true;
    return false;
}

export type UnregisteredOutcome = "created" | "exists" | "prepaid" | "registered" | "paused" | "no-pricing" | "error";

type BillRow = { bill_to: unknown; covered_months?: string[] | null };

const rowIdentity = (row: BillRow) => identityKeys((row.bill_to ?? {}) as { email?: string; phone?: string; full_name?: string });

// Logins that already exist, by email, so someone who has since registered is
// billed through their account instead of being billed twice.
export async function registeredEmails(supabase: SupabaseClient) {
    const { data } = await supabase.from("profiles").select("email").eq("role", "customer").limit(10000);

    return new Set((data ?? []).map((row) => String(row.email ?? "").trim().toLowerCase()).filter(Boolean));
}

// One invoice per person per month. An invoice already made for them for the
// month (by hand or automatically), a multi-month invoice that includes it, or
// an advance payment that covers it, all mean there is nothing to create.
export async function generateInvoiceForUnregistered(
    supabase: SupabaseClient,
    person: UnregisteredCustomer,
    registered: Set<string>,
    month: string = billingMonthLabel()
): Promise<UnregisteredOutcome> {
    if (person.paused) return "paused";

    const email = person.email?.trim().toLowerCase();
    if (email && registered.has(email)) return "registered";

    const items = unregisteredLineItems(person);
    if (items.length === 0) return "no-pricing";

    const me = identityKeys(person);

    // Invoices for this month, or covering it, made out to someone without an account.
    const byMonth = supabase.from("payments").select("bill_to").is("customer_id", null).not("bill_to", "is", null);
    const covered = await byMonth.or(`invoice_month.eq."${month}",covered_months.cs.{"${month}"}`).limit(500);
    const found = covered.error
        ? await supabase.from("payments").select("bill_to").is("customer_id", null).not("bill_to", "is", null).eq("invoice_month", month).limit(500)
        : covered;

    if (((found.data ?? []) as BillRow[]).some((row) => sameIdentity(me, rowIdentity(row)))) return "exists";

    // A month they paid for in advance gets no invoice.
    const { data: advance } = await supabase
        .from("prepayments")
        .select("bill_to")
        .is("customer_id", null)
        .contains("covered_months", [month])
        .limit(100);

    if (((advance ?? []) as BillRow[]).some((row) => sameIdentity(me, rowIdentity(row)))) return "prepaid";

    const { error } = await supabase.from("payments").insert({
        customer_id: null,
        bill_to: billToOfPerson(person),
        amount: itemsTotal(items),
        arrears: 0,
        units: 1,
        description: `Waste management service charge, ${month}`,
        invoice_month: month,
        line_items: items,
        auto_generated: true,
    });

    if (error) {
        console.error("generateInvoiceForUnregistered insert error:", error.message);
        return "error";
    }

    return "created";
}

export type UnregisteredTally = Record<UnregisteredOutcome, number>;

export const emptyUnregisteredTally = (): UnregisteredTally => ({
    created: 0,
    exists: 0,
    prepaid: 0,
    registered: 0,
    paused: 0,
    "no-pricing": 0,
    error: 0,
});

// Bills everyone on the saved list. Before the table exists this does nothing.
export async function runUnregisteredInvoiceGeneration(supabase: SupabaseClient, month: string = billingMonthLabel()) {
    const tally = emptyUnregisteredTally();

    const { data, error } = await supabase.from("unregistered_customers").select(UNREGISTERED_COLUMNS).order("created_at", { ascending: true }).limit(5000);
    if (error) return { people: 0, ...tally };

    const people = (data ?? []) as unknown as UnregisteredCustomer[];
    if (people.length === 0) return { people: 0, ...tally };

    const registered = await registeredEmails(supabase);

    for (const person of people) {
        tally[await generateInvoiceForUnregistered(supabase, person, registered, month)] += 1;
    }

    return { people: people.length, ...tally };
}
