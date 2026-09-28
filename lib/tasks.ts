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

// The day after a pickup's date, or tomorrow when that date has already gone.
export function nextPickupDay(date: string) {
    const today = todayLagos();
    const next = new Date(`${date < today ? today : date}T00:00:00Z`);
    next.setUTCDate(next.getUTCDate() + 1);
    return next.toISOString().slice(0, 10);
}

export type MoveTaskResult = { success: boolean; error?: string; message?: string };

// Pushes a pickup that has not started to the next day. Who may do it is
// decided by the caller and the database (admins, or the lead and crew). The
// date is matched as well, so a double tap only moves it once. The database
// tells the customer and the lead that the date changed.
export async function moveTaskToNextDay(supabase: SupabaseClient, taskId: string): Promise<MoveTaskResult> {
    if (!taskId) return { success: false, error: "Missing task." };

    const { data: task } = await supabase.from("tasks").select("status, scheduled_date").eq("id", taskId).maybeSingle();

    if (!task) return { success: false, error: "Could not find that task." };
    if (task.status !== "pending") return { success: false, error: "Only a pickup that has not started can be moved." };
    if (!task.scheduled_date) return { success: false, error: "This pickup has no date yet." };

    const next = nextPickupDay(task.scheduled_date);

    const { data, error } = await supabase
        .from("tasks")
        .update({ scheduled_date: next })
        .eq("id", taskId)
        .eq("status", "pending")
        .eq("scheduled_date", task.scheduled_date)
        .select("id");

    if (error) {
        console.error("moveTaskToNextDay error:", error.code, error.message);
        if (error.code === "23505") return { success: false, error: "This customer already has a pickup on the next day." };
        return { success: false, error: "Could not move this pickup. Please try again." };
    }

    if (!data || data.length === 0) return { success: false, error: "This pickup has already changed. Refresh and try again." };

    const label = new Date(`${next}T00:00:00Z`).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "short", timeZone: "UTC" });

    return { success: true, message: `Moved to ${label}. The customer has been told.` };
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

export type TaskCustomer = {
    task_id: string;
    customer_profile_id: string;
    full_name: string | null;
    phone: string | null;
    whatsapp_number: string | null;
    address: string | null;
    landmark: string | null;
    lga: string | null;
    state: string | null;
    property_type: string | null;
    waste_type: string | null;
    preferred_pickup_frequency: string | null;
    special_notes: string | null;
    can_message: boolean;
};

// Who each task is for and how to reach them. Empty (not an error) before the
// employee-task-customers SQL has been run.
export async function loadTaskCustomers(supabase: SupabaseClient, taskIds: string[]) {
    const customers = new Map<string, TaskCustomer>();

    if (taskIds.length === 0) return customers;

    const { data, error } = await supabase.rpc("task_customer_details", { p_task_ids: taskIds });

    if (error) return customers;

    for (const row of (data ?? []) as TaskCustomer[]) {
        customers.set(row.task_id, row);
    }

    return customers;
}

// "Ada", "Ada and Bola", "Ada, Bola and Chi".
export function teamNames(team: TeamMember[] | undefined) {
    const names = (team ?? []).map((m) => m.full_name ?? "Staff");

    if (names.length <= 1) return names[0] ?? "";

    return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}
