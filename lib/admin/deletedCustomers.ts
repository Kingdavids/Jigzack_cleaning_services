import type { SupabaseClient } from "@supabase/supabase-js";

// How long a deleted customer stays in Recently deleted before the daily job
// erases them for good. Keep in step with purge_deleted_customers() in the database.
export const RECENTLY_DELETED_DAYS = 30;

// Profile ids of customers in Recently deleted. They stay approved accounts
// underneath, so the lists and dropdowns that read profiles use this to leave
// them out.
export async function deletedProfileIds(supabase: SupabaseClient): Promise<Set<string>> {
    const { data } = await supabase.from("customers").select("profile_id").eq("status", "deleted");

    return new Set((data ?? []).map((row) => row.profile_id as string).filter(Boolean));
}

export function daysLeft(deletedAt: string | null) {
    if (!deletedAt) return RECENTLY_DELETED_DAYS;

    const elapsed = Math.floor((new Date().getTime() - new Date(deletedAt).getTime()) / 86_400_000);
    return Math.max(0, RECENTLY_DELETED_DAYS - elapsed);
}
