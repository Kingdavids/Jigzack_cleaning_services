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

export async function createTask(formData: FormData) {
    await requireAdmin();
    const supabase = await createClient();

    const title = String(formData.get("title") || "").trim();
    const customerId = String(formData.get("customerId") || "");
    const employeeId = String(formData.get("employeeId") || "");
    const scheduledDate = String(formData.get("scheduledDate") || "") || null;
    const zone = String(formData.get("zone") || "").trim() || null;
    const priority = String(formData.get("priority") || "low");

    if (!title || !customerId || !employeeId) return;

    await supabase.from("tasks").insert({
        title,
        customer_id: customerId,
        employee_id: employeeId,
        scheduled_date: scheduledDate,
        zone,
        priority,
    });

    revalidatePath("/admin");
    revalidatePath("/employee");
    revalidatePath("/customer");
}

export async function createInvoice(formData: FormData) {
    await requireAdmin();
    const supabase = await createClient();

    const customerId = String(formData.get("customerId") || "");
    const amount = Number(formData.get("amount") || 0);
    const description = String(formData.get("description") || "").trim() || null;
    const invoiceMonth = String(formData.get("invoiceMonth") || "").trim() || null;

    if (!customerId || !amount) return;

    await supabase.from("payments").insert({
        customer_id: customerId,
        amount,
        description,
        invoice_month: invoiceMonth,
    });

    revalidatePath("/admin");
    revalidatePath("/customer");
}

export async function sendMessage(formData: FormData) {
    const profile = await requireAdmin();
    const supabase = await createClient();

    const toProfileId = String(formData.get("toProfileId") || "");
    const subject = String(formData.get("subject") || "").trim();
    const body = String(formData.get("body") || "").trim();

    if (!toProfileId || !subject || !body) return;

    await supabase.from("messages").insert({
        from_profile_id: profile.id,
        to_profile_id: toProfileId,
        subject,
        body,
    });

    revalidatePath("/admin");
}
