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
