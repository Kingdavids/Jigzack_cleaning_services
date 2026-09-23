import type { createClient } from "@/utils/supabase/server";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

// A tenant (customers.unit_id set) has no billing of their own: the estate
// they belong to is the account that gets invoiced. Everything that shows or
// prints an invoice or receipt resolves "whose bill is this" through here.
export async function resolveBilling<T extends { unit_id?: string | null }>(
    supabase: SupabaseServerClient,
    profileId: string,
    customer: T | null
) {
    let billingProfileId = profileId;
    let billingCustomer: T | null = customer;
    let isTenant = false;

    if (customer?.unit_id) {
        const { data: unit } = await supabase
            .from("units")
            .select("estate_profile_id")
            .eq("id", customer.unit_id)
            .single();

        if (unit) {
            billingProfileId = unit.estate_profile_id;
            isTenant = true;

            const { data: estateCustomer } = await supabase
                .from("customers")
                .select("*")
                .eq("profile_id", unit.estate_profile_id)
                .single();

            billingCustomer = (estateCustomer as T | null) ?? customer;
        }
    }

    return { billingProfileId, billingCustomer, isTenant };
}

export function receiptNumber(paymentId: string) {
    return `RCT-${paymentId.replace(/-/g, "").slice(0, 8).toUpperCase()}`;
}

export function invoiceNumber(paymentId: string) {
    return `INV-${paymentId.replace(/-/g, "").slice(0, 8).toUpperCase()}`;
}

export function naira(value: number) {
    return `₦${value.toLocaleString()}`;
}

export function formatDate(value: string | null | undefined, fallback = "Not available") {
    if (!value) return fallback;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return date.toLocaleDateString("en-CA", { year: "numeric", month: "short", day: "numeric" });
}
