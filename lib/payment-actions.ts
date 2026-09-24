"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { createClient } from "@/utils/supabase/server";
import { getUserProfile } from "@/lib/auth/getUserProfile";
import { escapeHtml, sendEmail } from "@/lib/send-email";
import { siteOrigin } from "@/lib/site-origin";
import { MAX_RECEIPT_BYTES, RECEIPT_EXTENSIONS } from "@/lib/expenses";
import { PAYMENT_RECEIPT_BUCKET } from "@/lib/bank-details";

export type PaymentActionState = { success: boolean; error?: string } | null;

// The registration fee is paid by bank transfer. The customer says they have
// paid, and can add a note and a receipt if they like. Nothing unlocks until
// an admin confirms it, so a false report only costs the admin a glance.
export async function reportRegistrationFee(formData: FormData): Promise<PaymentActionState> {
    const profile = await getUserProfile();

    if (profile.role !== "customer" || profile.status !== "approved") {
        return { success: false, error: "Only approved customers can do this." };
    }

    const supabase = await createClient();

    const { data: customer } = await supabase
        .from("customers")
        .select("full_name, registration_fee_paid")
        .eq("profile_id", profile.id)
        .maybeSingle();

    if (!customer) return { success: false, error: "Finish your account setup first." };
    if (customer.registration_fee_paid) return { success: true };

    const note = String(formData.get("note") ?? "").trim().slice(0, 300);
    const receipt = formData.get("receipt");
    let receiptPath: string | null = null;

    if (receipt instanceof File && receipt.size > 0) {
        const extension = RECEIPT_EXTENSIONS[receipt.type];

        if (!extension || receipt.size > MAX_RECEIPT_BYTES) {
            return { success: false, error: "The receipt must be a photo or PDF under 10MB." };
        }

        receiptPath = `${profile.id}/registration-${randomUUID()}.${extension}`;

        const { error: uploadError } = await supabase.storage.from(PAYMENT_RECEIPT_BUCKET).upload(receiptPath, receipt, { upsert: false });

        if (uploadError) {
            console.error("Payment receipt upload failed:", uploadError.message);
            return { success: false, error: "Could not upload the receipt. Please try again." };
        }
    }

    const { error } = await supabase.rpc("report_registration_fee", { p_note: note, p_receipt_path: receiptPath });

    if (error) {
        console.error("report_registration_fee error:", error.message);
        if (receiptPath) await supabase.storage.from(PAYMENT_RECEIPT_BUCKET).remove([receiptPath]);

        return {
            success: false,
            error: /schema cache|could not find the function/i.test(error.message)
                ? "This is not switched on yet. Please tell us and we will fix it."
                : "Could not send this. Please try again.",
        };
    }

    // Tell the admins there is something to confirm. Best effort.
    const { data: recipients } = await supabase.rpc("approved_admin_emails");

    if (recipients && recipients.length > 0) {
        const origin = await siteOrigin();

        await sendEmail({
            to: recipients,
            subject: `Registration fee reported by ${customer.full_name}`,
            html: `
                <p><strong>${escapeHtml(customer.full_name)}</strong> says they have paid the registration fee${receiptPath ? " and attached a receipt" : ""}.</p>
                ${note ? `<p>Their note: ${escapeHtml(note)}</p>` : ""}
                <p><a href="${escapeHtml(`${origin}/admin/customers/${profile.id}`)}">Check and confirm it</a></p>
            `,
        });
    }

    revalidatePath("/auth/registration-fee");
    revalidatePath("/admin");
    revalidatePath("/admin/customers");

    return { success: true };
}
