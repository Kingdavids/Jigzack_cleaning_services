"use server";

import { revalidatePath } from "next/cache";
import { randomUUID } from "node:crypto";
import { createClient } from "@/utils/supabase/server";
import { getUserProfile } from "@/lib/auth/getUserProfile";
import { isFullAdmin } from "@/lib/auth/roles";
import { todayLagos } from "@/lib/tasks";
import { MAX_PHOTOS_PER_SLOT } from "@/lib/upload-constants";
import { EXPENSE_CATEGORIES, MAX_RECEIPT_BYTES, RECEIPT_BUCKET, RECEIPT_EXTENSIONS } from "@/lib/expenses";

export type TaskServiceResult = { success: boolean; error?: string; needsConfirm?: boolean };

// A pickup dated in the future is not due yet. Starting or finishing it early
// needs a deliberate "yes", so a tap on the wrong day cannot mark tomorrow's
// pickup as done. The screen asks; the server checks again.
async function futureCheck(supabase: Awaited<ReturnType<typeof createClient>>, taskId: string, confirmed: boolean): Promise<TaskServiceResult | null> {
    const { data: task } = await supabase.from("tasks").select("scheduled_date").eq("id", taskId).maybeSingle();

    if (task?.scheduled_date && task.scheduled_date > todayLagos() && !confirmed) {
        return {
            success: false,
            needsConfirm: true,
            error: `This pickup is scheduled for ${task.scheduled_date}, which has not come yet. Confirm to service it early.`,
        };
    }

    return null;
}

export async function startTask(formData: FormData): Promise<TaskServiceResult> {
    await getUserProfile();
    const supabase = await createClient();

    const taskId = String(formData.get("taskId") || "");

    if (!taskId) return { success: false, error: "Missing task." };

    const early = await futureCheck(supabase, taskId, formData.get("confirmEarly") === "yes");
    if (early) return early;

    // Which tasks this person may change is decided by the database: the ones they
    // lead and, once the crew SQL has run, the ones they are a crew member on.
    const { data, error } = await supabase
        .from("tasks")
        .update({
            status: "in progress",
            started_at: new Date().toISOString(),
        })
        .eq("id", taskId)
        .eq("status", "pending")
        .select("id");

    if (error) {
        console.error("startTask error:", error.message);
        return { success: false, error: "Could not start this task. Please try again." };
    }

    if (!data || data.length === 0) return { success: false, error: "This task can't be started. It may already be under way or serviced." };

    revalidatePath("/employee/tasks");
    revalidatePath("/admin/tasks");
    revalidatePath("/admin");
    revalidatePath("/customer/schedule");

    return { success: true };
}

export async function endTask(formData: FormData): Promise<TaskServiceResult> {
    await getUserProfile();
    const supabase = await createClient();

    const taskId = String(formData.get("taskId") || "");

    if (!taskId) return { success: false, error: "Missing task." };

    const early = await futureCheck(supabase, taskId, formData.get("confirmEarly") === "yes");
    if (early) return early;

    const { data, error } = await supabase
        .from("tasks")
        .update({
            status: "completed",
            completed_at: new Date().toISOString(),
        })
        .eq("id", taskId)
        .in("status", ["pending", "in progress"])
        .select("id");

    if (error) {
        console.error("endTask error:", error.message);
        return { success: false, error: "Could not finish this task. Please try again." };
    }

    if (!data || data.length === 0) return { success: false, error: "This task can't be finished. It may already be serviced." };

    revalidatePath("/employee");
    revalidatePath("/employee/tasks");
    revalidatePath("/admin/tasks");
    revalidatePath("/admin");
    revalidatePath("/customer");
    revalidatePath("/customer/tasks");
    revalidatePath("/customer/schedule");

    return { success: true };
}

const IMAGE_EXTENSIONS: Record<string, string> = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "image/heic": "heic",
    "image/heif": "heif",
};

const MAX_PHOTO_BYTES = 15 * 1024 * 1024;

export type UploadActionState = { success: boolean; error?: string; uploaded?: number } | null;

export async function uploadTaskPhoto(
    _prevState: UploadActionState,
    formData: FormData
): Promise<UploadActionState> {
    const profile = await getUserProfile();
    const supabase = await createClient();

    const taskId = String(formData.get("taskId") || "");
    const photoType = String(formData.get("photoType") || "");
    const files = formData.getAll("photo").filter((f): f is File => f instanceof File && f.size > 0);

    if (!taskId || !photoType || files.length === 0) {
        return { success: false, error: "Choose at least one photo." };
    }

    if (photoType !== "before" && photoType !== "after") {
        return { success: false, error: "Photos must be marked before or after." };
    }

    if (profile.role !== "employee" && !isFullAdmin(profile)) {
        return { success: false, error: "Only staff can upload task photos." };
    }

    const { count: existingCount } = await supabase
        .from("uploads")
        .select("id", { count: "exact", head: true })
        .eq("task_id", taskId)
        .eq("photo_type", photoType);

    const remainingSlots = MAX_PHOTOS_PER_SLOT - (existingCount ?? 0);

    if (remainingSlots <= 0) {
        return { success: false, error: `You can only keep ${MAX_PHOTOS_PER_SLOT} ${photoType} photos per task.` };
    }

    const filesToUpload = files.slice(0, remainingSlots);

    const { data: task, error: taskError } = await supabase
        .from("tasks")
        .select("title, customer_id, employee_id")
        .eq("id", taskId)
        .single();

    if (taskError) {
        console.error("Could not load task for upload:", taskError.message);
        return { success: false, error: "Could not load this task. Please try again." };
    }

    // Staff can only add photos to the jobs they are on, as the lead or as crew.
    if (!isFullAdmin(profile) && task.employee_id !== profile.id) {
        const { data: onCrew } = await supabase
            .from("task_crew")
            .select("task_id")
            .eq("task_id", taskId)
            .eq("employee_id", profile.id)
            .maybeSingle();

        if (!onCrew) return { success: false, error: "This task isn't assigned to you." };
    }

    let uploaded = 0;

    for (const file of filesToUpload) {
        // The browser compresses to a JPEG first, but the server can't rely on
        // that: only real images under the size cap are stored, and the file
        // extension comes from the type, not from whatever name was sent.
        const fileExt = IMAGE_EXTENSIONS[file.type];

        if (!fileExt || file.size > MAX_PHOTO_BYTES) {
            console.error("Rejected upload:", file.type, file.size);
            continue;
        }

        const filePath = `${profile.id}/${taskId}-${photoType}-${Date.now()}-${uploaded}.${fileExt}`;

        const { error: uploadError } = await supabase.storage
            .from("task-photos")
            .upload(filePath, file, { upsert: false });

        if (uploadError) {
            console.error("Photo upload failed:", uploadError.message);
            continue;
        }

        const { data: publicUrlData } = supabase.storage.from("task-photos").getPublicUrl(filePath);

        const { error: insertError } = await supabase.from("uploads").insert({
            task_id: taskId,
            employee_id: profile.id,
            customer_id: task?.customer_id ?? null,
            task_title: task?.title ?? null,
            image_url: publicUrlData.publicUrl,
            photo_type: photoType, // "before" or "after"
            created_at: new Date().toISOString(),
        });

        if (insertError) {
            console.error("Uploads insert error:", insertError.message);
            continue;
        }

        uploaded += 1;
    }

    revalidatePath("/employee/tasks");
    revalidatePath("/employee/uploads");
    revalidatePath("/admin/uploads");
    revalidatePath("/admin");
    revalidatePath("/customer");
    revalidatePath("/customer/tasks");

    if (uploaded === 0) {
        return { success: false, error: "Upload failed. Please try again." };
    }

    if (uploaded < files.length) {
        return {
            success: true,
            uploaded,
            error: `Only ${uploaded} of ${files.length} photos were saved (5-photo limit per slot).`,
        };
    }

    return { success: true, uploaded };
}

export async function deleteTaskPhoto(uploadId: string) {
    const profile = await getUserProfile();
    const supabase = await createClient();

    if (!uploadId) return;

    const { data: upload, error: fetchError } = await supabase
        .from("uploads")
        .select("id, employee_id, image_url")
        .eq("id", uploadId)
        .single();

    if (fetchError || !upload) return;

    if (upload.employee_id !== profile.id && !isFullAdmin(profile)) return;

    const storagePath = upload.image_url.split("/task-photos/")[1];

    if (storagePath) {
        await supabase.storage.from("task-photos").remove([decodeURIComponent(storagePath)]);
    }

    await supabase.from("uploads").delete().eq("id", uploadId);

    revalidatePath("/employee/tasks");
    revalidatePath("/employee/uploads");
    revalidatePath("/admin/uploads");
    revalidatePath("/admin");
    revalidatePath("/customer");
    revalidatePath("/customer/tasks");
}
// ---------------------------------------------------------------------------
// Expenses: staff log what they spent; only the admin (and the person who
// logged it) can see the entry. Receipts go in a private bucket.
// ---------------------------------------------------------------------------

export type ExpenseActionState = { success: boolean; error?: string } | null;

const lagosToday = () => new Date().toLocaleDateString("en-CA", { timeZone: "Africa/Lagos" });

export async function submitExpense(formData: FormData): Promise<ExpenseActionState> {
    const profile = await getUserProfile();

    if (profile.role !== "employee" || profile.status !== "approved") {
        return { success: false, error: "Only approved staff can log expenses." };
    }

    const amount = Math.round(Number(String(formData.get("amount") ?? "").replace(/,/g, "")) * 100) / 100;
    const category = String(formData.get("category") ?? "");
    const note = String(formData.get("note") ?? "").trim().slice(0, 500);
    const date = String(formData.get("date") ?? "");
    const taskId = String(formData.get("taskId") ?? "");
    const receipt = formData.get("receipt");

    if (!Number.isFinite(amount) || amount <= 0 || amount > 5_000_000) {
        return { success: false, error: "Enter an amount between ₦1 and ₦5,000,000." };
    }

    if (!EXPENSE_CATEGORIES.some((c) => c.value === category)) {
        return { success: false, error: "Choose a category." };
    }

    if (note.length < 3) {
        return { success: false, error: "Add a short note saying what the money was for." };
    }

    const today = lagosToday();
    const earliest = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toLocaleDateString("en-CA", { timeZone: "Africa/Lagos" });

    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date > today || date < earliest) {
        return { success: false, error: "Choose a date within the last 60 days that is not in the future." };
    }

    const supabase = await createClient();

    // Only attach a task that is really assigned to this person.
    let linkedTask: string | null = null;
    if (taskId) {
        const { data: task } = await supabase
            .from("tasks")
            .select("id")
            .eq("id", taskId)
            .eq("employee_id", profile.id)
            .maybeSingle();
        linkedTask = task?.id ?? null;
    }

    let receiptPath: string | null = null;

    if (receipt instanceof File && receipt.size > 0) {
        const extension = RECEIPT_EXTENSIONS[receipt.type];

        if (!extension || receipt.size > MAX_RECEIPT_BYTES) {
            return { success: false, error: "The receipt must be a photo or PDF under 10MB." };
        }

        receiptPath = `${profile.id}/${randomUUID()}.${extension}`;

        const { error: uploadError } = await supabase.storage.from(RECEIPT_BUCKET).upload(receiptPath, receipt, { upsert: false });

        if (uploadError) {
            console.error("Receipt upload failed:", uploadError.message);
            return { success: false, error: "Could not upload the receipt. Please try again." };
        }
    }

    const { error } = await supabase.from("expenses").insert({
        employee_id: profile.id,
        task_id: linkedTask,
        amount,
        category,
        note,
        expense_date: date,
        receipt_path: receiptPath,
    });

    if (error) {
        console.error("submitExpense insert error:", error.code, error.message, error.details, error.hint);
        if (receiptPath) await supabase.storage.from(RECEIPT_BUCKET).remove([receiptPath]);

        return {
            success: false,
            error: /relation|does not exist|schema cache/i.test(error.message)
                ? "Expenses aren't switched on yet. Please tell the admin."
                : `Could not save this expense. Please try again. (code ${error.code || "unknown"})`,
        };
    }

    revalidatePath("/employee/expenses");
    revalidatePath("/admin/expenses");
    revalidatePath("/admin");

    return { success: true };
}

export async function deleteExpense(expenseId: string): Promise<ExpenseActionState> {
    const profile = await getUserProfile();
    const supabase = await createClient();

    const { data: expense } = await supabase
        .from("expenses")
        .select("id, status, receipt_path")
        .eq("id", expenseId)
        .eq("employee_id", profile.id)
        .maybeSingle();

    if (!expense) return { success: false, error: "Could not find that expense." };
    if (expense.status !== "submitted") return { success: false, error: "The admin has already reviewed this one." };

    const { error } = await supabase.from("expenses").delete().eq("id", expenseId).eq("employee_id", profile.id);

    if (error) {
        console.error("deleteExpense error:", error.message);
        return { success: false, error: "Could not remove this expense." };
    }

    if (expense.receipt_path) await supabase.storage.from(RECEIPT_BUCKET).remove([expense.receipt_path]);

    revalidatePath("/employee/expenses");
    revalidatePath("/admin/expenses");
    revalidatePath("/admin");

    return { success: true };
}
