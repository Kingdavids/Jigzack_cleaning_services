"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { createClient } from "@/utils/supabase/server";
import { logActivity } from "@/lib/activity";
import { EXPENSE_CATEGORIES, EXPENSE_STEPS_FROM, MAX_RECEIPT_BYTES, RECEIPT_BUCKET, RECEIPT_EXTENSIONS } from "@/lib/expenses";
import { todayLagos } from "@/lib/tasks";
import { naira } from "@/lib/customer/billing";
import { requireAdmin } from "./shared";

// An admin logs an expense (fuel for the office van, a repair, supplies...).
// It is approved straight away, since the admin is the one who approves.
export async function logAdminExpense(formData: FormData): Promise<{ success: boolean; error?: string }> {
    const admin = await requireAdmin();
    const supabase = await createClient();

    const amount = Math.round(Number(String(formData.get("amount") ?? "").replace(/,/g, "")) * 100) / 100;
    const category = String(formData.get("category") ?? "");
    const note = String(formData.get("note") ?? "").trim().slice(0, 500);
    const date = String(formData.get("date") ?? "");
    const receipt = formData.get("receipt");

    if (!Number.isFinite(amount) || amount <= 0 || amount > 50_000_000) return { success: false, error: "Enter an amount between ₦1 and ₦50,000,000." };
    if (!EXPENSE_CATEGORIES.some((c) => c.value === category)) return { success: false, error: "Choose a category." };
    if (note.length < 3) return { success: false, error: "Add a short note saying what the money was for." };

    const today = todayLagos();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date > today) return { success: false, error: "Choose a date that is not in the future." };

    let receiptPath: string | null = null;

    if (receipt instanceof File && receipt.size > 0) {
        const extension = RECEIPT_EXTENSIONS[receipt.type];
        if (!extension || receipt.size > MAX_RECEIPT_BYTES) return { success: false, error: "The receipt must be a photo or PDF under 10MB." };

        receiptPath = `${admin.id}/${randomUUID()}.${extension}`;
        const { error: uploadError } = await supabase.storage.from(RECEIPT_BUCKET).upload(receiptPath, receipt, { upsert: false });

        if (uploadError) {
            console.error("Admin receipt upload failed:", uploadError.message);
            return { success: false, error: "Could not upload the receipt. Run supabase/admin-expenses-recyclables-2026-10.sql in Supabase, or save without a receipt." };
        }
    }

    const { error } = await supabase.from("expenses").insert({
        employee_id: admin.id,
        amount,
        category,
        note,
        expense_date: date,
        receipt_path: receiptPath,
        status: "approved",
        admin_note: "Logged by an admin",
        reviewed_by: admin.id,
        reviewed_at: new Date().toISOString(),
    });

    if (error) {
        console.error("logAdminExpense error:", error.message);
        if (receiptPath) await supabase.storage.from(RECEIPT_BUCKET).remove([receiptPath]);
        return { success: false, error: "Could not save this expense. Please try again." };
    }

    await logActivity(supabase, admin, "expense_logged", `Logged an expense of ${naira(amount)} (${category})`);
    revalidatePath("/admin/expenses");
    revalidatePath("/admin/finance");
    revalidatePath("/admin");

    return { success: true };
}

export async function reviewExpense(
    expenseId: string,
    status: "approved" | "reimbursed" | "rejected",
    adminNote: string
): Promise<{ success: boolean; error?: string }> {
    const admin = await requireAdmin();
    const supabase = await createClient();

    if (!expenseId || !["approved", "reimbursed", "rejected"].includes(status)) {
        return { success: false, error: "Invalid request." };
    }

    // Each step only follows the one before it, so money already paid back
    // can't be marked rejected, and nothing is paid back without approval.
    const allowedFrom = EXPENSE_STEPS_FROM[status];

    const { data, error } = await supabase
        .from("expenses")
        .update({
            status,
            admin_note: adminNote.trim().slice(0, 500) || null,
            reviewed_by: admin.id,
            reviewed_at: new Date().toISOString(),
        })
        .eq("id", expenseId)
        .in("status", allowedFrom)
        .select("id");

    if (error) {
        console.error("reviewExpense error:", error.message);
        return { success: false, error: "Could not update this expense. Please try again." };
    }

    if (!data || data.length === 0) {
        return {
            success: false,
            error:
                status === "reimbursed"
                    ? "Approve this expense before marking it reimbursed."
                    : status === "rejected"
                        ? "This expense has already been paid back, so it can't be rejected."
                        : "This expense has already been paid back.",
        };
    }

    await logActivity(supabase, admin, "expense_" + status, `Marked a staff expense ${status}`, { type: "expense", id: expenseId });
    revalidatePath("/admin/expenses");
    revalidatePath("/admin");
    revalidatePath("/employee/expenses");

    return { success: true };
}
