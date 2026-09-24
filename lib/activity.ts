import type { SupabaseClient } from "@supabase/supabase-js";

// Records who did what in the admin area. It is deliberately best effort: a
// problem writing the log must never stop the change the admin just made, and
// before the activity_log table exists it quietly does nothing.
export async function logActivity(
    supabase: SupabaseClient,
    actor: { id: string; full_name?: string | null },
    action: string,
    summary: string,
    target?: { type?: string; id?: string | null }
) {
    try {
        await supabase.from("activity_log").insert({
            actor_id: actor.id,
            actor_name: actor.full_name ?? null,
            action,
            summary: summary.slice(0, 300),
            target_type: target?.type ?? null,
            target_id: target?.id ?? null,
        });
    } catch (err) {
        console.error("logActivity failed:", err);
    }
}
