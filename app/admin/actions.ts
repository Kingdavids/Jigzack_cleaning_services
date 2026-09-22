"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/utils/supabase/server";
import { getUserProfile } from "@/lib/auth/getUserProfile";

async function requireAdmin() {
    const profile = await getUserProfile();

    if (profile.role !== "admin") {
        throw new Error("Not authorized");
    }

    return profile;
}

export type TaskActionState = { success: boolean; error?: string } | null;

export async function createTask(
    _prevState: TaskActionState,
    formData: FormData
): Promise<TaskActionState> {
    await requireAdmin();
    const supabase = await createClient();

    const title = String(formData.get("title") || "").trim();
    const customerId = String(formData.get("customerId") || "") || null;
    const employeeId = String(formData.get("employeeId") || "");
    const scheduledDate = String(formData.get("scheduledDate") || "") || null;
    const zone = String(formData.get("zone") || "").trim() || null;
    const priority = String(formData.get("priority") || "low");

    if (!title || !employeeId) {
        return { success: false, error: "Title and employee are required." };
    }

    const { error } = await supabase.from("tasks").insert({
        title,
        customer_id: customerId,
        employee_id: employeeId,
        scheduled_date: scheduledDate,
        zone,
        priority,
    });

    if (error) {
        console.error("createTask insert error:", error.message);
        return { success: false, error: "Could not create task. Please try again." };
    }

    revalidatePath("/admin/tasks");
    revalidatePath("/employee");
    revalidatePath("/employee/tasks");
    revalidatePath("/customer");
    revalidatePath("/customer/tasks");

    return { success: true };
}

export async function createInvoice(formData: FormData) {
    await requireAdmin();
    const supabase = await createClient();

    const customerId = String(formData.get("customerId") || "");
    const amount = Number(formData.get("amount") || 0);
    const description = String(formData.get("description") || "").trim() || null;
    const invoiceMonth = String(formData.get("invoiceMonth") || "").trim() || null;

    if (!customerId || !amount) return;

    const { error } = await supabase.from("payments").insert({
        customer_id: customerId,
        amount,
        description,
        invoice_month: invoiceMonth,
    });

    if (error) {
        console.error("createInvoice insert error:", error.message);
        return;
    }

    revalidatePath("/admin/payments");
    revalidatePath("/customer");
    revalidatePath("/customer/payments");
}

export type MessageActionState = { success: boolean; error?: string } | null;

export async function sendMessage(
    _prevState: MessageActionState,
    formData: FormData
): Promise<MessageActionState> {
    const profile = await requireAdmin();
    const supabase = await createClient();

    const toProfileId = String(formData.get("toProfileId") || "");
    const subject = String(formData.get("subject") || "").trim();
    const body = String(formData.get("body") || "").trim();

    if (!toProfileId || !subject || !body) {
        return { success: false, error: "Recipient, subject, and message are required." };
    }

    const { error } = await supabase.from("messages").insert({
        from_profile_id: profile.id,
        to_profile_id: toProfileId,
        subject,
        body,
    });

    if (error) {
        console.error("sendMessage insert error:", error.message);
        return { success: false, error: "Could not send message. Please try again." };
    }

    revalidatePath("/admin/messages");

    return { success: true };
}

const BROADCAST_ROLES: Record<string, ("customer" | "employee")[]> = {
    all_customers: ["customer"],
    all_employees: ["employee"],
    everyone: ["customer", "employee"],
};

// Broadcasts are one-way (see the messages_insert_to_admin RLS policy,
// which rejects any reply whose thread root has is_broadcast = true) --
// a fan-out announcement isn't meant to become a support conversation.
export async function sendBroadcast(
    _prevState: MessageActionState,
    formData: FormData
): Promise<MessageActionState> {
    const profile = await requireAdmin();
    const supabase = await createClient();

    const audience = String(formData.get("audience") || "");
    const subject = String(formData.get("subject") || "").trim();
    const body = String(formData.get("body") || "").trim();

    const roles = BROADCAST_ROLES[audience];

    if (!roles || !subject || !body) {
        return { success: false, error: "Audience, subject, and message are required." };
    }

    const { data: recipients, error: recipientsError } = await supabase
        .from("profiles")
        .select("id")
        .in("role", roles)
        .eq("status", "approved");

    if (recipientsError) {
        console.error("broadcast recipients error:", recipientsError.message);
        return { success: false, error: "Could not load recipients. Please try again." };
    }

    if (!recipients || recipients.length === 0) {
        return { success: false, error: "No approved recipients found for this broadcast." };
    }

    const rows = recipients.map((r) => ({
        from_profile_id: profile.id,
        to_profile_id: r.id,
        subject,
        body,
        is_broadcast: true,
    }));

    const { error } = await supabase.from("messages").insert(rows);

    if (error) {
        console.error("broadcast insert error:", error.message);
        return { success: false, error: "Could not send broadcast. Please try again." };
    }

    revalidatePath("/admin/messages");
    revalidatePath("/employee/messages");
    revalidatePath("/customer/messages");

    return { success: true };
}
