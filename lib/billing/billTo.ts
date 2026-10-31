import type { FacilityDetails } from "@/lib/customer/facilities";

// Who an invoice is for when that person is not registered on the app. Kept on
// the invoice itself (payments.bill_to), in the same shape as a customer
// record so invoices and receipts show it the same way.
export type BillTo = {
    full_name: string;
    // A commercial property's own name ("Grace Hotel"), printed instead of full_name.
    property_name: string | null;
    phone: string | null;
    whatsapp_number: string | null;
    email: string | null;
    address: string | null;
    landmark: string | null;
    lga: string | null;
    state: string | null;
    property_type: string | null;
    // Unit counts on the property, so the invoice lists them as it does for a customer.
    facility_details: FacilityDetails;
};

export function billToOf(invoice: { bill_to?: unknown } | null | undefined): BillTo | null {
    const raw = invoice?.bill_to;
    if (!raw || typeof raw !== "object") return null;

    const value = raw as Partial<BillTo>;
    if (!value.full_name) return null;

    return {
        full_name: String(value.full_name),
        property_name: value.property_name ?? null,
        phone: value.phone ?? null,
        whatsapp_number: value.whatsapp_number ?? null,
        email: value.email ?? null,
        address: value.address ?? null,
        landmark: value.landmark ?? null,
        lga: value.lga ?? null,
        state: value.state ?? null,
        property_type: value.property_type ?? null,
        facility_details: value.facility_details && typeof value.facility_details === "object" ? value.facility_details : null,
    };
}

// The last ten digits of a phone number, so 0803 123 4567 and +234 803 123 4567 match.
export const phoneKey = (value: string | null | undefined) => (value ?? "").replace(/\D/g, "").slice(-10);

// What makes two invoices or advance payments the same unregistered person:
// their email, else their phone number, else their name.
export function personKey(billTo: { email?: string | null; phone?: string | null; full_name: string }) {
    return billTo.email?.trim().toLowerCase() || phoneKey(billTo.phone) || billTo.full_name.trim().toLowerCase();
}

// A person can manage several properties, each billed on its own. The property
// is told apart by its name or its address, ignoring case, spacing and punctuation.
const compact = (value: string | null | undefined) => (value ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");

type PropertyLike = { property_name?: string | null; address?: string | null };

export const propertyKey = (billTo: PropertyLike) => compact(billTo.property_name) || compact(billTo.address);

const propertyLabels = (billTo: PropertyLike) => [compact(billTo.property_name), compact(billTo.address)].filter(Boolean);

// Two records are for the same property unless both say which and they differ.
// One that says nothing (a sale invoice, an older record) could be either.
export function sameProperty(a: PropertyLike, b: PropertyLike) {
    const mine = propertyLabels(a);
    const theirs = propertyLabels(b);

    return mine.length === 0 || theirs.length === 0 || mine.some((label) => theirs.includes(label));
}

type AccountLike = PropertyLike & { email?: string | null; phone?: string | null; full_name: string };

// The person and the property together: the same person with two properties has two.
export function accountKey(billTo: AccountLike) {
    const property = propertyKey(billTo);
    return property ? `${personKey(billTo)}|${property}` : personKey(billTo);
}

// Keys for a set of records. One that names no property joins the person's one
// property when they have just one, and otherwise stands on its own.
export function accountKeyer(records: AccountLike[]) {
    const properties = new Map<string, Set<string>>();

    for (const record of records) {
        if (!propertyKey(record)) continue;
        const person = personKey(record);
        properties.set(person, (properties.get(person) ?? new Set()).add(accountKey(record)));
    }

    return (record: AccountLike) => {
        if (propertyKey(record)) return accountKey(record);

        const only = properties.get(personKey(record));
        return only && only.size === 1 ? [...only][0] : personKey(record);
    };
}
