import type { SupabaseClient } from "@supabase/supabase-js";
import { billingMonthLabel, itemsTotal, type LineItem } from "@/lib/billing/pricing";
import { billToOf, personKey, phoneKey, type BillTo } from "@/lib/billing/billTo";

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

// ---------------------------------------------------------------
// People who already have invoices as "not registered" but are not on the list.
// ---------------------------------------------------------------

export type InvoiceHistoryRow = {
    bill_to: unknown;
    amount: number | string;
    covered_months?: string[] | null;
    invoice_kind?: string | null;
    invoice_month?: string | null;
    created_at: string;
};

export type InvoiceHistoryPerson = {
    key: string;
    billTo: BillTo;
    invoiceCount: number;
    // What one month cost on their latest service invoice; 0 when they have none.
    suggested: number;
    // True when their service invoices were not all for the same monthly amount.
    varies: boolean;
    latestMonth: string | null;
};

// A multi-month invoice covers several months at once, so it is shared out per month.
const perMonth = (row: InvoiceHistoryRow) => {
    const months = Math.max(1, row.covered_months?.length ?? 1);
    return Math.round((Number(row.amount) / months) * 100) / 100;
};

// Groups unregistered invoices by person and works out a suggested monthly
// charge for each. Only service invoices count towards the charge: a
// recyclables sale or another one-off says nothing about a monthly rate.
// Anyone already on the list, or with a login now, is left out.
export function suggestFromInvoices(rows: InvoiceHistoryRow[], onList: UnregisteredCustomer[], registered: Set<string>): InvoiceHistoryPerson[] {
    const listed = onList.map(identityKeys);
    const groups = new Map<string, { billTo: BillTo; rows: InvoiceHistoryRow[] }>();

    const newestFirst = [...rows].sort((a, b) => (a.created_at < b.created_at ? 1 : -1));

    for (const row of newestFirst) {
        const billTo = billToOf(row);
        if (!billTo) continue;

        const email = billTo.email?.trim().toLowerCase();
        if (email && registered.has(email)) continue;

        const keys = identityKeys(billTo);
        if (listed.some((entry) => sameIdentity(entry, keys))) continue;

        const key = personKey(billTo);
        const group = groups.get(key) ?? { billTo, rows: [] };
        group.rows.push(row);
        groups.set(key, group);
    }

    return [...groups.entries()]
        .map(([key, group]) => {
            const service = group.rows.filter((row) => !row.invoice_kind || row.invoice_kind === "service").filter((row) => Number(row.amount) > 0);
            const amounts = new Set(service.map(perMonth));

            return {
                key,
                billTo: group.billTo,
                invoiceCount: group.rows.length,
                suggested: service.length > 0 ? perMonth(service[0]) : 0,
                varies: amounts.size > 1,
                latestMonth: group.rows[0].invoice_month ?? null,
            };
        })
        .sort((a, b) => (a.billTo.property_name || a.billTo.full_name).localeCompare(b.billTo.property_name || b.billTo.full_name));
}

// Invoices made out to people without an account. Asks for fewer columns when
// the SQL for the newer ones has not been run yet.
export async function loadInvoiceHistory(supabase: SupabaseClient): Promise<InvoiceHistoryRow[]> {
    const columns = [
        "bill_to, amount, covered_months, invoice_kind, invoice_month, created_at",
        "bill_to, amount, invoice_kind, invoice_month, created_at",
        "bill_to, amount, covered_months, invoice_month, created_at",
        "bill_to, amount, invoice_month, created_at",
    ];

    for (const select of columns) {
        const { data, error } = await supabase.from("payments").select(select).is("customer_id", null).not("bill_to", "is", null).limit(5000);
        if (!error) return (data ?? []) as unknown as InvoiceHistoryRow[];
    }

    return [];
}

// True when an invoice for this month, or a multi-month one including it, is
// already made out to this person.
export function invoicedForMonth(rows: InvoiceHistoryRow[], person: UnregisteredCustomer, month: string) {
    const me = identityKeys(person);

    return rows.some(
        (row) =>
            (row.invoice_month === month || (row.covered_months ?? []).includes(month)) &&
            sameIdentity(me, rowIdentity(row))
    );
}

// What happened for one person, in words an admin can read.
export function outcomeMessage(outcome: UnregisteredOutcome, name: string, month: string) {
    switch (outcome) {
        case "created":
            return `${month} invoice created for ${name}.`;
        case "exists":
            return `${name} already has an invoice for ${month}.`;
        case "prepaid":
            return `${name} paid ${month} in advance, so there is no invoice to make.`;
        case "registered":
            return `${name} now has a login with this email, so bill them from their account instead.`;
        case "paused":
            return `Monthly billing is paused for ${name}. Resume it first.`;
        case "no-pricing":
            return `${name} has no monthly charge set.`;
        default:
            return "Could not create the invoice. Please try again.";
    }
}
