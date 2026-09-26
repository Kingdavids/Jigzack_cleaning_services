"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/utils/supabase/server";
import { getUserProfile } from "@/lib/auth/getUserProfile";
import { isFullAdmin, isOwner } from "@/lib/auth/roles";
import { logActivity } from "@/lib/activity";
import { PAYMENT_RECEIPT_BUCKET } from "@/lib/bank-details";
import { RECEIPT_BUCKET } from "@/lib/expenses";
import { removeUnreferencedAttachments } from "@/lib/message-attachments";

export type BulkResult = { success: boolean; error?: string; deleted?: number };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_AT_ONCE = 200;

async function requireFullAdmin() {
    const profile = await getUserProfile();

    if (!isFullAdmin(profile) || profile.status !== "approved") {
        throw new Error("Not authorized");
    }

    return profile;
}

// Permanent deletion of invoices, expenses and messages is owner only.
async function requireOwner() {
    const profile = await getUserProfile();

    if (!isOwner(profile) || profile.status !== "approved") {
        throw new Error("Not authorized");
    }

    return profile;
}

function cleanIds(ids: string[]) {
    return [...new Set(ids.filter((id) => typeof id === "string" && UUID.test(id)))].slice(0, MAX_AT_ONCE);
}

const plural = (n: number, noun: string) => `${n} ${noun}${n === 1 ? "" : "s"}`;

// A delete the database refuses does not fail: it just removes nothing. So a
// count of zero is reported as a problem instead of a success.
const NOTHING_DELETED =
    "Nothing was deleted. Either there was nothing to remove, or the database rule that allows it has not been applied yet. Run the latest SQL file from the supabase folder.";

// ---------------------------------------------------------------------------
// Tasks: any full admin. Works on every status, not only pending ones.
// ---------------------------------------------------------------------------
export async function deleteTasks(ids: string[]): Promise<BulkResult> {
    const actor = await requireFullAdmin();
    const supabase = await createClient();
    const clean = cleanIds(ids);

    if (clean.length === 0) return { success: false, error: "Nothing selected." };

    const { data, error } = await supabase.from("tasks").delete().in("id", clean).select("id");

    if (error) {
        console.error("deleteTasks error:", error.message);
        return { success: false, error: "Could not delete those tasks. Please try again." };
    }

    const deleted = data?.length ?? 0;
    if (deleted === 0) {
        return { success: false, error: NOTHING_DELETED };
    }

    await logActivity(supabase, actor, "tasks_deleted", `Deleted ${plural(deleted, "task")}`);

    revalidatePath("/admin/tasks");
    revalidatePath("/employee/tasks");
    revalidatePath("/customer/schedule");
    revalidatePath("/admin");

    return { success: true, deleted };
}

// ---------------------------------------------------------------------------
// Invoices: owner only. A paid invoice is a real financial record, so deleting
// one needs the word DELETE typed as well.
// ---------------------------------------------------------------------------
export async function deleteInvoices(ids: string[], confirm: string): Promise<BulkResult> {
    const actor = await requireOwner();
    const supabase = await createClient();
    const clean = cleanIds(ids);

    if (clean.length === 0) return { success: false, error: "Nothing selected." };

    const { data: rows } = await supabase.from("payments").select("id, status, transfer_receipt_path").in("id", clean);

    const paid = (rows ?? []).filter((r) => r.status === "paid").length;

    if (paid > 0 && confirm.trim() !== "DELETE") {
        return { success: false, error: `${plural(paid, "selected invoice")} already paid. Type DELETE to confirm.` };
    }

    const { data, error } = await supabase.from("payments").delete().in("id", clean).select("id");

    if (error) {
        console.error("deleteInvoices error:", error.message);
        return { success: false, error: "Could not delete those invoices. Please try again." };
    }

    const deleted = data?.length ?? 0;
    if (deleted === 0) {
        return { success: false, error: NOTHING_DELETED };
    }

    const files = (rows ?? []).map((r) => r.transfer_receipt_path as string | null).filter((p): p is string => Boolean(p));
    if (files.length > 0) await supabase.storage.from(PAYMENT_RECEIPT_BUCKET).remove(files);

    await logActivity(supabase, actor, "invoices_deleted", `Deleted ${plural(deleted, "invoice")}${paid > 0 ? ` (${paid} paid)` : ""}`);

    revalidatePath("/admin/payments");
    revalidatePath("/customer/payments");
    revalidatePath("/customer");
    revalidatePath("/admin");

    return { success: true, deleted };
}

// ---------------------------------------------------------------------------
// Expenses: owner only.
// ---------------------------------------------------------------------------
export async function deleteExpenses(ids: string[]): Promise<BulkResult> {
    const actor = await requireOwner();
    const supabase = await createClient();
    const clean = cleanIds(ids);

    if (clean.length === 0) return { success: false, error: "Nothing selected." };

    const { data: rows } = await supabase.from("expenses").select("id, receipt_path").in("id", clean);

    const { data, error } = await supabase.from("expenses").delete().in("id", clean).select("id");

    if (error) {
        console.error("deleteExpenses error:", error.message);
        return { success: false, error: "Could not delete those expenses. Please try again." };
    }

    const deleted = data?.length ?? 0;
    if (deleted === 0) {
        return { success: false, error: NOTHING_DELETED };
    }

    const files = (rows ?? []).map((r) => r.receipt_path as string | null).filter((p): p is string => Boolean(p));
    if (files.length > 0) await supabase.storage.from(RECEIPT_BUCKET).remove(files);

    await logActivity(supabase, actor, "expenses_deleted", `Deleted ${plural(deleted, "expense")}`);

    revalidatePath("/admin/expenses");
    revalidatePath("/employee/expenses");
    revalidatePath("/admin");

    return { success: true, deleted };
}

// ---------------------------------------------------------------------------
// Declined signups: owner only. The login goes too, so their email is free and
// they can sign up again.
// ---------------------------------------------------------------------------
const DECLINED_RULE = "Only an owner can delete a declined signup.";

export async function deleteDeclinedSignup(profileId: string): Promise<BulkResult> {
    const actor = await requireOwner();
    const supabase = await createClient();

    if (!profileId || !UUID.test(profileId)) return { success: false, error: "Invalid request." };

    const { data: person } = await supabase.from("profiles").select("full_name, email, role, status").eq("id", profileId).maybeSingle();

    if (!person) return { success: false, error: "Could not find that signup." };
    if (person.status !== "declined") return { success: false, error: "Only a declined signup can be deleted here." };

    const { error } = await supabase.rpc("admin_delete_declined_signup", { p_profile_id: profileId });

    if (error) {
        console.error("admin_delete_declined_signup error:", error.message);

        return {
            success: false,
            error: /schema cache|could not find the function/i.test(error.message)
                ? "Deleting declined signups is not switched on yet. Run supabase/declined-delete-2026-09.sql in Supabase first."
                : error.code === "P0001"
                    ? error.message
                    : "Could not delete this signup. Please try again.",
        };
    }

    await logActivity(supabase, actor, "declined_signup_deleted", `Deleted the declined signup of ${person.full_name ?? person.email ?? "someone"} (${person.role})`);

    revalidatePath("/admin/approvals");
    revalidatePath("/admin/customers");
    revalidatePath("/admin/employees");
    revalidatePath("/admin");

    return { success: true, deleted: 1 };
}

// Every declined signup shown on the Approvals page, in one go.
export async function deleteAllDeclinedSignups(confirm: string): Promise<BulkResult> {
    const actor = await requireOwner();
    const supabase = await createClient();

    if (confirm.trim() !== "DELETE") return { success: false, error: "Type DELETE to confirm." };

    // The same list the page shows: not admins, and not employees who were removed on purpose.
    const { data: declined, error: listError } = await supabase
        .from("profiles")
        .select("id")
        .eq("status", "declined")
        .neq("role", "admin")
        .or("decline_reason.is.null,decline_reason.not.ilike.Removed*")
        .limit(MAX_AT_ONCE);

    if (listError) {
        console.error("deleteAllDeclinedSignups list error:", listError.message);
        return { success: false, error: "Could not load the declined signups. Please try again." };
    }

    if (!declined || declined.length === 0) return { success: false, error: "There are no declined signups to delete." };

    let deleted = 0;
    let firstError = "";

    for (const row of declined) {
        const { error } = await supabase.rpc("admin_delete_declined_signup", { p_profile_id: row.id });

        if (error) {
            if (!firstError) firstError = error.message;
            continue;
        }

        deleted += 1;
    }

    if (deleted === 0) {
        return {
            success: false,
            error: /schema cache|could not find the function/i.test(firstError)
                ? "Deleting declined signups is not switched on yet. Run supabase/declined-delete-2026-09.sql in Supabase first."
                : DECLINED_RULE,
        };
    }

    await logActivity(supabase, actor, "declined_signups_cleared", `Deleted ${plural(deleted, "declined signup")}`);

    revalidatePath("/admin/approvals");
    revalidatePath("/admin/customers");
    revalidatePath("/admin/employees");
    revalidatePath("/admin");

    return { success: true, deleted };
}

// Deletes messages and reports which rows went, including any attached files.
// Before the attachments SQL has been run there is no such column, so it asks
// again without it.
async function deleteMessagesReturning(run: (select: string) => PromiseLike<{ data: unknown; error: { message: string } | null }>) {
    let result = await run("id, attachment_path");

    if (result.error && /attachment_path/.test(result.error.message)) {
        result = await run("id");
    }

    return {
        error: result.error,
        rows: (result.data ?? []) as { id: string; attachment_path?: string | null }[],
    };
}

// ---------------------------------------------------------------------------
// Messages: owner only. Removes every message, or the whole thread of the ones
// picked, so no orphan replies are left behind.
// ---------------------------------------------------------------------------
export async function deleteMessageThreads(rootIds: string[]): Promise<BulkResult> {
    const actor = await requireOwner();
    const supabase = await createClient();
    const clean = cleanIds(rootIds);

    if (clean.length === 0) return { success: false, error: "Nothing selected." };

    const list = clean.join(",");
    const { rows, error } = await deleteMessagesReturning((select) =>
        supabase.from("messages").delete().or(`id.in.(${list}),parent_message_id.in.(${list})`).select(select)
    );

    if (error) {
        console.error("deleteMessageThreads error:", error.message);
        return { success: false, error: "Could not delete those messages. Please try again." };
    }

    const deleted = rows.length;
    if (deleted === 0) {
        return { success: false, error: NOTHING_DELETED };
    }

    await removeUnreferencedAttachments(supabase, rows.map((row) => row.attachment_path));

    await logActivity(supabase, actor, "messages_deleted", `Deleted ${plural(deleted, "message")}`);

    revalidatePath("/admin/messages");
    revalidatePath("/employee/messages");
    revalidatePath("/customer/messages");

    return { success: true, deleted };
}

export async function deleteAllMessages(confirm: string): Promise<BulkResult> {
    const actor = await requireOwner();
    const supabase = await createClient();

    if (confirm.trim() !== "DELETE") return { success: false, error: "Type DELETE to confirm." };

    const { rows, error } = await deleteMessagesReturning((select) =>
        supabase.from("messages").delete().neq("id", "00000000-0000-0000-0000-000000000000").select(select)
    );

    if (error) {
        console.error("deleteAllMessages error:", error.message);
        return { success: false, error: "Could not delete the messages. Please try again." };
    }

    const deleted = rows.length;
    if (deleted === 0) {
        return { success: false, error: NOTHING_DELETED };
    }

    await removeUnreferencedAttachments(supabase, rows.map((row) => row.attachment_path));

    await logActivity(supabase, actor, "messages_cleared", `Deleted every message (${plural(deleted, "message")})`);

    revalidatePath("/admin/messages");
    revalidatePath("/employee/messages");
    revalidatePath("/customer/messages");

    return { success: true, deleted };
}

// ---------------------------------------------------------------------------
// Employees: owner only. Removing keeps every record they made (jobs, photos,
// expenses) and only stops them signing in. Restoring undoes it.
// ---------------------------------------------------------------------------
export async function removeEmployee(profileId: string): Promise<BulkResult> {
    const actor = await requireOwner();
    const supabase = await createClient();

    if (!profileId || !UUID.test(profileId)) return { success: false, error: "Invalid request." };

    const { data: target } = await supabase
        .from("profiles")
        .select("id, full_name, email, role")
        .eq("id", profileId)
        .maybeSingle();

    if (!target || target.role !== "employee") return { success: false, error: "That person is not an employee." };

    const { error } = await supabase
        .from("profiles")
        .update({ status: "declined", decline_reason: "Removed by an admin", declined_at: new Date().toISOString() })
        .eq("id", profileId);

    if (error) {
        console.error("removeEmployee error:", error.message);
        return { success: false, error: "Could not remove this employee. Please try again." };
    }

    // Their upcoming jobs go back to unassigned so nothing is left waiting on them.
    await supabase.from("tasks").update({ employee_id: null }).eq("employee_id", profileId).eq("status", "pending");

    await logActivity(supabase, actor, "employee_removed", `Removed the employee ${target.full_name ?? target.email ?? ""}`.trim(), {
        type: "profile",
        id: profileId,
    });

    revalidatePath("/admin/employees");
    revalidatePath("/admin/tasks");
    revalidatePath("/admin/approvals");

    return { success: true };
}

export async function restoreEmployee(profileId: string): Promise<BulkResult> {
    const actor = await requireOwner();
    const supabase = await createClient();

    if (!profileId || !UUID.test(profileId)) return { success: false, error: "Invalid request." };

    const { data: target } = await supabase
        .from("profiles")
        .select("id, full_name, role")
        .eq("id", profileId)
        .maybeSingle();

    if (!target || target.role !== "employee") return { success: false, error: "That person is not an employee." };

    const { error } = await supabase
        .from("profiles")
        .update({ status: "approved", decline_reason: null, declined_at: null })
        .eq("id", profileId);

    if (error) {
        console.error("restoreEmployee error:", error.message);
        return { success: false, error: "Could not restore this employee. Please try again." };
    }

    await logActivity(supabase, actor, "employee_restored", `Restored the employee ${target.full_name ?? ""}`.trim(), {
        type: "profile",
        id: profileId,
    });

    revalidatePath("/admin/employees");
    revalidatePath("/admin/approvals");

    return { success: true };
}

// ---------------------------------------------------------------------------
// Activity log: owner only. Older entries only, or everything. The clearing
// itself is written as a new entry afterwards, so it always leaves a trace.
// ---------------------------------------------------------------------------
export async function clearActivityLog(scope: "older30" | "older90" | "all", confirm: string): Promise<BulkResult> {
    const actor = await requireOwner();
    const supabase = await createClient();

    if (!["older30", "older90", "all"].includes(scope)) return { success: false, error: "Invalid request." };
    if (scope === "all" && confirm.trim() !== "DELETE") return { success: false, error: "Type DELETE to confirm." };

    let query = supabase.from("activity_log").delete();

    if (scope === "all") {
        query = query.neq("id", "00000000-0000-0000-0000-000000000000");
    } else {
        const cutoff = new Date();
        cutoff.setDate(cutoff.getDate() - (scope === "older30" ? 30 : 90));
        query = query.lt("created_at", cutoff.toISOString());
    }

    const { data, error } = await query.select("id");

    if (error) {
        console.error("clearActivityLog error:", error.message);
        return { success: false, error: "Could not clear the activity log. Please try again." };
    }

    const deleted = data?.length ?? 0;
    if (deleted === 0) {
        return { success: false, error: NOTHING_DELETED };
    }

    await logActivity(
        supabase,
        actor,
        "activity_cleared",
        `Cleared ${plural(deleted, "activity entry").replace("entrys", "entries")} (${scope === "all" ? "everything" : scope === "older30" ? "older than 30 days" : "older than 90 days"})`
    );

    revalidatePath("/admin/activity");

    return { success: true, deleted };
}

// Deletes an employee for good: login, profile and setup details, which also
// frees their email address. Their expenses and messages go with them; jobs and
// photos stay so customers keep their history. The exact name must be typed.
export async function deleteEmployeeForever(profileId: string, confirmName: string): Promise<BulkResult> {
    const actor = await requireOwner();
    const supabase = await createClient();

    if (!profileId || !UUID.test(profileId)) return { success: false, error: "Invalid request." };

    const { data: target } = await supabase
        .from("profiles")
        .select("id, full_name, role")
        .eq("id", profileId)
        .maybeSingle();

    if (!target || target.role !== "employee") return { success: false, error: "That person is not an employee." };

    if (confirmName.trim().toLowerCase() !== (target.full_name ?? "").trim().toLowerCase()) {
        return { success: false, error: "The name you typed does not match. Nothing was deleted." };
    }

    // Their expense receipt files are removed along with their records.
    const { data: receipts } = await supabase.from("expenses").select("receipt_path").eq("employee_id", profileId);

    const { error } = await supabase.rpc("admin_delete_employee", { p_profile_id: profileId });

    if (error) {
        console.error("admin_delete_employee error:", error.code, error.message);
        return {
            success: false,
            error: /schema cache|could not find the function/i.test(error.message)
                ? "Deleting employees is not switched on yet. Run supabase/employee-delete-2026-09.sql first."
                : `Could not delete this employee. (${error.code || "unknown"}: ${error.message.slice(0, 120)})`,
        };
    }

    const files = (receipts ?? []).map((r) => r.receipt_path as string | null).filter((p): p is string => Boolean(p));
    if (files.length > 0) await supabase.storage.from(RECEIPT_BUCKET).remove(files);

    await logActivity(supabase, actor, "employee_deleted", `Deleted the employee ${target.full_name ?? ""}`.trim());

    revalidatePath("/admin/employees");
    revalidatePath("/admin/tasks");
    revalidatePath("/admin/expenses");
    revalidatePath("/admin/messages");
    revalidatePath("/admin");

    return { success: true };
}
