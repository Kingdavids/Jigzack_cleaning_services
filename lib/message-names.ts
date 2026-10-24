import type { SupabaseClient } from "@supabase/supabase-js";

// Profile id -> the name on that person's customer record (the "Account
// holder" they typed on the property form). Messages carry the name from
// signup instead, and the two can differ, so admins see both.
export type AccountHolders = Record<string, string>;

const normalise = (value: string) => value.trim().replace(/\s+/g, " ").toLowerCase();

// "Ada Obi" alone when the names agree (or there is no customer record to
// compare with), "Ada Obi (account holder: Mr Obi)" when they differ.
export function nameWithHolder(name: string | null | undefined, profileId: string | null | undefined, holders: AccountHolders | undefined) {
    const holder = profileId ? holders?.[profileId] : undefined;
    const shown = (name ?? "").trim();

    if (!holder) return name ?? null;
    if (!shown) return holder;
    if (normalise(shown) === normalise(holder)) return name;

    return `${shown} (account holder: ${holder})`;
}

// Quietly returns nothing for anyone the viewer can't read a customer record
// for, so a customer or employee just sees the plain name as before.
export async function loadAccountHolders(supabase: SupabaseClient, profileIds: (string | null | undefined)[]): Promise<AccountHolders> {
    const ids = [...new Set(profileIds.filter((id): id is string => Boolean(id)))];
    if (ids.length === 0) return {};

    const { data } = await supabase.from("customers").select("profile_id, full_name").in("profile_id", ids);

    const holders: AccountHolders = {};
    for (const row of (data ?? []) as { profile_id: string | null; full_name: string | null }[]) {
        if (row.profile_id && row.full_name) holders[row.profile_id] = row.full_name;
    }

    return holders;
}
