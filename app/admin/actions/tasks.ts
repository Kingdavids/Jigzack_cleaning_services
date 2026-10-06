"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/utils/supabase/server";
import { logActivity } from "@/lib/activity";
import { isPastDate, moveTaskToNextDay, splitAssignable, todayLagos } from "@/lib/tasks";
import { requireAdmin, duplicateSince } from "./shared";
import { TIMEZONE_OFFSET } from "@/lib/config/business";

export type TaskActionState = { success: boolean; error?: string } | null;

// Everyone else on the job besides the lead, with repeats and the lead removed.
const crewFrom = (values: unknown[], leadId: string | null) =>
    [...new Set(values.map((v) => String(v)).filter((v) => v && v !== leadId))];

// A pickup dated before today has already happened, so it is saved as serviced.
const servicedTimes = (date: string) => ({
    status: "completed",
    started_at: `${date}T08:00:00${TIMEZONE_OFFSET}`,
    completed_at: `${date}T17:00:00${TIMEZONE_OFFSET}`,
});

async function setCrew(supabase: Awaited<ReturnType<typeof createClient>>, taskId: string, crewIds: string[]) {
    const removed = await supabase.from("task_crew").delete().eq("task_id", taskId);

    // The table does not exist until supabase/tasks-crew-2026-09.sql has been run.
    if (removed.error) return crewIds.length === 0 ? null : "Extra crew members are not switched on yet. Run supabase/tasks-crew-2026-09.sql in Supabase first.";

    if (crewIds.length > 0) {
        const { error } = await supabase.from("task_crew").insert(crewIds.map((employee_id) => ({ task_id: taskId, employee_id })));
        if (error) {
            console.error("setCrew insert error:", error.message);
            return "Could not add the other crew members. Please try again.";
        }
    }

    return null;
}

export async function createTask(
    _prevState: TaskActionState,
    formData: FormData
): Promise<TaskActionState> {
    const actor = await requireAdmin();
    const supabase = await createClient();

    const title = String(formData.get("title") || "").trim();
    const customerId = String(formData.get("customerId") || "") || null;
    const employeeId = String(formData.get("employeeId") || "");
    const scheduledDate = String(formData.get("scheduledDate") || "") || null;
    const zone = String(formData.get("zone") || "").trim() || null;
    const priority = String(formData.get("priority") || "low");
    const crewIds = crewFrom(formData.getAll("crewIds"), employeeId);

    if (!title || !employeeId) {
        return { success: false, error: "Title and employee are required." };
    }

    const { data: duplicateTask } = await supabase
        .from("tasks")
        .select("id")
        .eq("title", title)
        .eq("employee_id", employeeId)
        .gte("created_at", duplicateSince())
        .limit(1);

    if (duplicateTask && duplicateTask.length > 0) {
        return { success: true };
    }

    const past = isPastDate(scheduledDate);

    const { data: created, error } = await supabase
        .from("tasks")
        .insert({
            title,
            customer_id: customerId,
            employee_id: employeeId,
            scheduled_date: scheduledDate,
            zone,
            priority,
            ...(past && scheduledDate ? servicedTimes(scheduledDate) : {}),
        })
        .select("id")
        .single();

    if (error || !created) {
        console.error("createTask insert error:", error?.message);
        return { success: false, error: "Could not create task. Please try again." };
    }

    if (crewIds.length > 0) {
        const crewError = await setCrew(supabase, created.id as string, crewIds);

        if (crewError) {
            await supabase.from("tasks").delete().eq("id", created.id);
            return { success: false, error: crewError };
        }
    }

    await logActivity(
        supabase,
        actor,
        "task_created",
        past ? "Recorded a past pickup as serviced" : crewIds.length > 0 ? "Created a pickup task for a crew" : "Created a pickup task",
        { type: "task", id: created.id as string }
    );
    revalidatePath("/admin/tasks");
    revalidatePath("/admin");
    revalidatePath("/employee");
    revalidatePath("/employee/tasks");
    revalidatePath("/customer");
    revalidatePath("/customer/tasks");
    revalidatePath("/customer/schedule");

    return { success: true };
}

export type TaskChangeResult = { success: boolean; error?: string; message?: string };

// Once a pickup has someone on it, it is locked: the date, area and people
// cannot be changed by accident. An admin can unlock it on purpose, and a
// pickup that has started or been serviced can never be changed.
export async function updateTask(
    taskId: string,
    employeeId: string | null,
    scheduledDate: string | null,
    zone: string,
    crewIds: string[] = [],
    unlock = false
): Promise<TaskChangeResult> {
    const actor = await requireAdmin();
    const supabase = await createClient();

    if (!taskId) return { success: false, error: "Missing task." };

    const { data: task } = await supabase.from("tasks").select("*").eq("id", taskId).maybeSingle();

    if (!task) return { success: false, error: "Could not find that task." };

    if (task.status !== "pending") {
        return { success: false, error: "This pickup has already started or been serviced, so it can't be changed." };
    }

    if (task.employee_id && !unlock) {
        return { success: false, error: "This pickup is assigned and locked. Unlock it first if you need to change it." };
    }

    const lead = employeeId || null;
    const date = scheduledDate || null;
    // A pickup an admin reopened is not marked serviced again just because its date has passed.
    const past = isPastDate(date) && !(task as { reopened_at?: string | null }).reopened_at;

    const { error } = await supabase
        .from("tasks")
        .update({
            employee_id: lead,
            scheduled_date: date,
            zone: zone.trim() || null,
            ...(past && date ? servicedTimes(date) : {}),
        })
        .eq("id", taskId);

    if (error) {
        console.error("updateTask error:", error.message);
        return { success: false, error: "Could not save this pickup. Please try again." };
    }

    const crewError = await setCrew(supabase, taskId, lead ? crewFrom(crewIds, lead) : []);
    if (crewError) return { success: false, error: crewError };

    await logActivity(
        supabase,
        actor,
        task.employee_id ? "task_reassigned" : "task_assigned",
        task.employee_id ? "Changed an assigned pickup" : lead ? "Assigned a pickup" : "Edited a pickup task",
        { type: "task", id: taskId }
    );
    revalidatePath("/admin/tasks");
    revalidatePath("/admin");
    revalidatePath("/employee");
    revalidatePath("/employee/tasks");
    revalidatePath("/customer");
    revalidatePath("/customer/schedule");

    return {
        success: true,
        message: past ? "Saved. The date has passed, so it is marked serviced." : lead ? "Assigned. The pickup is now locked." : "Pickup updated",
    };
}

// An admin marks a pickup serviced, for example when the employee did the job
// but did not tap End. A pickup dated in the future is not due yet, so it needs
// an explicit yes (the screen asks; this checks again).
export async function markTaskServiced(taskId: string, confirmEarly = false): Promise<TaskChangeResult> {
    const actor = await requireAdmin();
    const supabase = await createClient();

    if (!taskId) return { success: false, error: "Missing task." };

    const { data: task } = await supabase.from("tasks").select("*").eq("id", taskId).maybeSingle();

    if (!task) return { success: false, error: "Could not find that task." };
    if (task.status === "completed") return { success: false, error: "This pickup is already marked serviced." };
    if (task.status === "declined") return { success: false, error: "This pickup was declined, so it can't be marked serviced." };

    const date = (task.scheduled_date as string | null) ?? null;

    if (date && date > todayLagos() && !confirmEarly) {
        return { success: false, error: `This pickup is scheduled for ${date}, which has not come yet. Confirm to mark it serviced early.` };
    }

    // A pickup from an earlier day is recorded on its own day; anything else is recorded now.
    const past = isPastDate(date);
    const now = new Date().toISOString();

    const { data, error } = await supabase
        .from("tasks")
        .update({
            status: "completed",
            started_at: (task.started_at as string | null) ?? (past && date ? `${date}T08:00:00${TIMEZONE_OFFSET}` : now),
            completed_at: past && date ? `${date}T17:00:00${TIMEZONE_OFFSET}` : now,
        })
        .eq("id", taskId)
        .in("status", ["pending", "in progress"])
        .select("id");

    if (error) {
        console.error("markTaskServiced error:", error.message);
        return { success: false, error: "Could not mark it serviced. Please try again." };
    }

    if (!data || data.length === 0) return { success: false, error: "This pickup can't be marked serviced." };

    await logActivity(supabase, actor, "task_serviced", "Marked a pickup as serviced", { type: "task", id: taskId });
    revalidatePath("/admin/tasks");
    revalidatePath("/admin");
    revalidatePath("/employee");
    revalidatePath("/employee/tasks");
    revalidatePath("/customer");
    revalidatePath("/customer/tasks");
    revalidatePath("/customer/schedule");

    return { success: true, message: "Marked serviced. The customer has been told." };
}

// Puts a pickup that was marked serviced back to not done. It is flagged as
// reopened so the automatic "date has passed, so serviced" rule leaves it alone.
export async function reopenTask(taskId: string): Promise<TaskChangeResult> {
    const actor = await requireAdmin();
    const supabase = await createClient();

    if (!taskId) return { success: false, error: "Missing task." };

    const { data, error } = await supabase
        .from("tasks")
        .update({
            status: "pending",
            started_at: null,
            completed_at: null,
            reopened_at: new Date().toISOString(),
            reopened_by: actor.id,
        })
        .eq("id", taskId)
        .eq("status", "completed")
        .select("id");

    if (error) {
        console.error("reopenTask error:", error.message);
        return {
            success: false,
            error: /reopened_at|reopened_by/.test(error.message)
                ? "Not switched on yet. Run supabase/schedule-days-2026-09.sql in Supabase first."
                : "Could not revert this pickup. Please try again.",
        };
    }

    if (!data || data.length === 0) {
        return { success: false, error: "Only a pickup marked serviced can be reverted." };
    }

    await logActivity(supabase, actor, "task_reopened", "Reverted a serviced pickup to not done", { type: "task", id: taskId });
    revalidatePath("/admin/tasks");
    revalidatePath("/admin");
    revalidatePath("/employee");
    revalidatePath("/employee/tasks");
    revalidatePath("/customer");
    revalidatePath("/customer/schedule");

    return { success: true, message: "Back to not done. The crew and the customer have been told." };
}

// Pushes a pickup that has not started to the next day. An explicit, confirmed
// action, so it works on an assigned (locked) pickup without unlocking it.
export async function adminMoveTaskToNextDay(taskId: string): Promise<TaskChangeResult> {
    const actor = await requireAdmin();
    const supabase = await createClient();

    const result = await moveTaskToNextDay(supabase, taskId);

    if (result.success) {
        await logActivity(supabase, actor, "task_moved", "Moved a pickup to the next day", { type: "task", id: taskId });
        revalidatePath("/admin/tasks");
        revalidatePath("/admin");
        revalidatePath("/employee");
        revalidatePath("/employee/tasks");
        revalidatePath("/customer");
        revalidatePath("/customer/schedule");
    }

    return result;
}

export async function deleteTask(taskId: string, unlock = false): Promise<TaskChangeResult> {
    const actor = await requireAdmin();
    const supabase = await createClient();

    if (!taskId) return { success: false, error: "Missing task." };

    const { data: task } = await supabase.from("tasks").select("employee_id").eq("id", taskId).maybeSingle();

    if (task?.employee_id && !unlock) {
        return { success: false, error: "This pickup is assigned and locked. Unlock it first if you need to remove it." };
    }

    const { data, error } = await supabase.from("tasks").delete().eq("id", taskId).eq("status", "pending").select("id");

    if (error) {
        console.error("deleteTask error:", error.message);
        return { success: false, error: "Could not remove this pickup. Please try again." };
    }

    if (!data || data.length === 0) {
        return { success: false, error: "Only a pickup that has not started can be removed." };
    }

    await logActivity(supabase, actor, "task_deleted", "Deleted a pickup task", { type: "task", id: taskId });
    revalidatePath("/admin/tasks");
    revalidatePath("/admin");
    revalidatePath("/employee/tasks");
    revalidatePath("/customer/schedule");

    return { success: true, message: "Pickup removed" };
}

// ---------------------------------------------------------------------------
// Staff expenses
// ---------------------------------------------------------------------------

// Gives the ticked pickups to one employee (and any others going with them) in
// one go. Only pickups that have nobody on them yet are changed: anything
// already assigned, started, serviced or dated in the past is left alone and
// counted in the message, so nothing is overwritten by accident.
export async function assignTasks(taskIds: string[], employeeId: string, crewIds: string[] = []): Promise<TaskChangeResult & { assigned?: number }> {
    const actor = await requireAdmin();
    const supabase = await createClient();

    const ids = [...new Set((Array.isArray(taskIds) ? taskIds : []).map(String).filter(Boolean))];

    if (ids.length === 0) return { success: false, error: "Tick the pickups to assign first." };
    if (ids.length > 150) return { success: false, error: "That is too many at once. Assign up to 150 at a time." };
    if (!employeeId) return { success: false, error: "Choose who they go to." };

    const crew = crewFrom(crewIds, employeeId);

    const { data: people } = await supabase
        .from("profiles")
        .select("id")
        .in("id", [employeeId, ...crew])
        .eq("role", "employee")
        .eq("status", "approved");

    if ((people ?? []).length !== 1 + crew.length) return { success: false, error: "Choose approved employees only." };

    const { data: rows } = await supabase.from("tasks").select("id, status, employee_id, scheduled_date").in("id", ids);
    const { ids: eligible, skipped } = splitAssignable((rows ?? []) as { id: string; status: string | null; employee_id: string | null; scheduled_date: string | null }[], todayLagos());

    const left = [
        skipped.assigned > 0 && `${skipped.assigned} already assigned`,
        skipped.past > 0 && `${skipped.past} dated in the past`,
        skipped.started > 0 && `${skipped.started} started or serviced`,
    ].filter(Boolean);
    const leftText = left.length > 0 ? ` Left alone: ${left.join(", ")}.` : "";

    if (eligible.length === 0) return { success: false, error: `Nothing to assign.${leftText}` };

    // The checks on the row are repeated in the update, so a pickup that someone
    // else assigned a moment ago is not overwritten.
    const { data: updated, error } = await supabase
        .from("tasks")
        .update({ employee_id: employeeId })
        .in("id", eligible)
        .is("employee_id", null)
        .eq("status", "pending")
        .select("id");

    if (error) {
        console.error("assignTasks error:", error.message);
        return { success: false, error: "Could not assign these pickups. Please try again." };
    }

    const done = (updated ?? []).map((t) => t.id as string);

    if (crew.length > 0) {
        for (const id of done) {
            const crewError = await setCrew(supabase, id, crew);
            if (crewError) return { success: false, error: crewError };
        }
    }

    await logActivity(supabase, actor, "tasks_bulk_assigned", `Assigned ${done.length} pickup${done.length === 1 ? "" : "s"} in one go`);
    revalidatePath("/admin/tasks");
    revalidatePath("/admin");
    revalidatePath("/employee");
    revalidatePath("/employee/tasks");
    revalidatePath("/customer");
    revalidatePath("/customer/schedule");

    return { success: true, assigned: done.length, message: `Assigned ${done.length} pickup${done.length === 1 ? "" : "s"}.${leftText}` };
}
