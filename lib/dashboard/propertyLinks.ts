import type { createClient } from "@/utils/supabase/server";
import { balanceOf, loadWithPaid } from "@/lib/billing/balance";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

// Remembers which property a customer last switched to, so it survives moving
// between Dashboard, Payments and Schedule instead of resetting to their own
// on every navigation. Read on the server as a fallback for whichever page
// has no ?property= of its own, and written by PropertySwitcher on change.
export const ACTIVE_PROPERTY_COOKIE = "jigzack_active_property";

export type PropertyOption = {
    profileId: string;
    label: string;
    address: string | null;
    needsDetails: boolean;
};

// Every property a customer can switch to from their own dashboard: their own
// first, then any other property an admin has invited them to manage. Empty
// list (just their own) for everyone who was never invited to add one.
export async function loadMyProperties(
    supabase: SupabaseServerClient,
    primaryProfileId: string,
    own: { full_name: string | null; address: string | null }
): Promise<PropertyOption[]> {
    const { data: links } = await supabase.from("property_links").select("linked_profile_id").eq("primary_profile_id", primaryProfileId);

    const linkedIds = (links ?? []).map((row) => row.linked_profile_id as string);

    const options: PropertyOption[] = [
        { profileId: primaryProfileId, label: own.full_name ?? "My property", address: own.address, needsDetails: false },
    ];

    if (linkedIds.length === 0) return options;

    const { data: linkedCustomers } = await supabase.from("customers").select("profile_id, full_name, address").in("profile_id", linkedIds);

    for (const c of linkedCustomers ?? []) {
        options.push({
            profileId: c.profile_id as string,
            label: (c.full_name as string) ?? "Another property",
            address: (c.address as string | null) ?? null,
            // A placeholder created by the invite has no address yet.
            needsDetails: !c.address,
        });
    }

    return options;
}

// Resolves which property's data a customer page should load: their own by
// default, or a linked property if the requested id is genuinely one of
// theirs. Falls back to their own for an invalid or missing request, so a
// customer who was never invited never sees anything different.
export async function resolveActiveProperty(
    supabase: SupabaseServerClient,
    primaryProfileId: string,
    requestedProfileId: string | undefined
): Promise<{ activeProfileId: string; isLinked: boolean }> {
    if (!requestedProfileId || requestedProfileId === primaryProfileId) {
        return { activeProfileId: primaryProfileId, isLinked: false };
    }

    const { data } = await supabase
        .from("property_links")
        .select("id")
        .eq("primary_profile_id", primaryProfileId)
        .eq("linked_profile_id", requestedProfileId)
        .maybeSingle();

    return data ? { activeProfileId: requestedProfileId, isLinked: true } : { activeProfileId: primaryProfileId, isLinked: false };
}

// What is still owed, added up across every property a customer manages. For
// a customer with just their own property this is the same figure their own
// invoices already give; it only differs once more than one property is
// linked to their login.
export async function loadCombinedOutstanding(supabase: SupabaseServerClient, profileIds: string[]): Promise<number> {
    const rows = (await loadWithPaid(
        (select) => supabase.from("payments").select(select).in("customer_id", profileIds).neq("status", "paid"),
        "amount, arrears, status"
    )) as { amount: number | string | null; arrears: number | string | null; status: string | null; amount_paid?: number | string | null }[];

    return rows.reduce((sum, row) => sum + balanceOf(row), 0);
}
