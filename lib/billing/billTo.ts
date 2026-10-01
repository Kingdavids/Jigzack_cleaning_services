import type { FacilityDetails } from "@/lib/customer/facilities";

// Who an invoice is for when that person is not registered on the app. Kept on
// the invoice itself (payments.bill_to), in the same shape as a customer
// record so invoices and receipts show it the same way.
export type BillTo = {
    full_name: string;
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
