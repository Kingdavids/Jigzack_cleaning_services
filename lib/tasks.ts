import type { SupabaseClient } from "@supabase/supabase-js";

// Pickups are dated in Lagos time, so "today" has to be too.
export const todayLagos = () => new Date().toLocaleDateString("en-CA", { timeZone: "Africa/Lagos" });

export const isPastDate = (date: string | null | undefined) => Boolean(date) && (date as string) < todayLagos();

// What to call a task's state to people. "pending" with someone on it is
// "assigned", and a finished pickup is "serviced".
export function taskDisplayStatus(status: string | null | undefined, hasEmployee: boolean) {
    const value = (status ?? "pending").toLowerCase();

    if (value === "pending" && hasEmployee) return "assigned";
    if (value === "completed") return "serviced";

    return value.replace(" ", "_");
}

export type TeamMember = { task_id: string; employee_id: string; full_name: string | null; is_lead: boolean };

// The names of everyone on each task, lead first. Empty (not an error) before
// the crew SQL has been run.
export async function loadTaskTeams(supabase: SupabaseClient, taskIds: string[]) {
    const teams = new Map<string, TeamMember[]>();

    if (taskIds.length === 0) return teams;

    const { data, error } = await supabase.rpc("task_team", { p_task_ids: taskIds });

    if (error) return teams;

    for (const member of (data ?? []) as TeamMember[]) {
        teams.set(member.task_id, [...(teams.get(member.task_id) ?? []), member]);
    }

    return teams;
}

// "Ada", "Ada and Bola", "Ada, Bola and Chi".
export function teamNames(team: TeamMember[] | undefined) {
    const names = (team ?? []).map((m) => m.full_name ?? "Staff");

    if (names.length <= 1) return names[0] ?? "";

    return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}
