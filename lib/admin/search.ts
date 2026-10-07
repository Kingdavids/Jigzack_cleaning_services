// Helpers for the dashboard search: turning what an admin typed into the
// pieces the database can be asked about. Plain functions, so they can be
// tested; the search itself is in app/admin/search-actions.ts.

// Strips characters that have meaning inside a PostgREST or() filter, and keeps
// the term to a sensible length.
export const cleanTerm = (value: string) => value.replace(/[,()%*\\:"']/g, " ").replace(/\s+/g, " ").trim().slice(0, 60);

// What an invoice number looks like when typed: "INV-1A2B3C4D", "inv 1a2b", or
// just the first characters of it. Returns the hex part, or null if it isn't one.
export function invoiceCode(term: string) {
    const match = term.trim().match(/^(?:inv[\s-]*)?([0-9a-f]{4,8})$/i);

    return match ? match[1].toLowerCase() : null;
}

// The invoice number is the first 8 characters of the invoice id, so a typed
// prefix can be turned into the lowest and highest ids that start with it.
export function invoiceIdRange(code: string) {
    return {
        from: `${code.padEnd(8, "0")}-0000-0000-0000-000000000000`,
        to: `${code.padEnd(8, "f")}-ffff-ffff-ffff-ffffffffffff`,
    };
}

// A phone number can be typed 0803 123 4567 or +234 803 123 4567 and stored
// either way, so the search also tries the digits without the leading 0 or
// country code. Needs at least 6 digits to avoid matching half the customers.
export function phoneDigits(term: string) {
    const digits = term.replace(/\D/g, "");

    if (digits.length < 6 || digits.length < term.replace(/[\s+()-]/g, "").length) return null;

    return digits.replace(/^(?:234|0)/, "");
}

// The columns searched for a customer, and the filter for a typed term.
export const CUSTOMER_SEARCH_COLUMNS = ["full_name", "email", "phone", "whatsapp_number", "address", "lga", "account_code", "property_code"];

export function customerFilter(term: string) {
    const clean = cleanTerm(term);
    if (!clean) return null;

    const parts = CUSTOMER_SEARCH_COLUMNS.map((column) => `${column}.ilike.%${clean}%`);
    const digits = phoneDigits(clean);

    if (digits) parts.push(`phone.ilike.%${digits}%`, `whatsapp_number.ilike.%${digits}%`);

    return parts.join(",");
}

// The same for the details kept on an invoice for someone who isn't registered.
export function billToFilter(term: string) {
    const clean = cleanTerm(term);
    if (!clean) return null;

    const fields = ["full_name", "property_name", "email", "phone", "whatsapp_number", "address"];
    const parts = fields.map((field) => `bill_to->>${field}.ilike.%${clean}%`);
    const digits = phoneDigits(clean);

    if (digits) parts.push(`bill_to->>phone.ilike.%${digits}%`, `bill_to->>whatsapp_number.ilike.%${digits}%`);

    return parts.join(",");
}
