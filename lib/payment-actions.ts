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
        .select("*")
        .eq("profile_id", profile.id)
        .maybeSingle();

    if (!customer) return { success: false, error: "Finish your account setup first." };
    if (customer.registration_fee_paid) return { success: true };

    // Sending again (to add a receipt that was forgotten) keeps whatever was sent
    // before unless it is replaced.
    const previous = customer as { registration_fee_note?: string | null; registration_fee_receipt_path?: string | null; registration_fee_submitted_at?: string | null };
    const alreadyReported = Boolean(previous.registration_fee_submitted_at);
    const note = String(formData.get("note") ?? "").trim().slice(0, 300) || previous.registration_fee_note || "";
    const receipt = formData.get("receipt");
    let receiptPath: string | null = previous.registration_fee_receipt_path ?? null;
    let uploadedNew = false;

    if (receipt instanceof File && receipt.size > 0) {
        const extension = RECEIPT_EXTENSIONS[receipt.type];

        if (!extension || receipt.size > MAX_RECEIPT_BYTES) {
            return { success: false, error: "The receipt must be a photo or PDF under 10MB." };
        }

        const newPath = `${profile.id}/registration-${randomUUID()}.${extension}`;

        const { error: uploadError } = await supabase.storage.from(PAYMENT_RECEIPT_BUCKET).upload(newPath, receipt, { upsert: false });

        if (uploadError) {
            console.error("Payment receipt upload failed:", uploadError.message);
            return { success: false, error: "Could not upload the receipt. Please try again." };
        }

        const replaced = receiptPath;
        receiptPath = newPath;
        uploadedNew = true;
        // The receipt it replaces is removed once the new one is saved, below.
        previous.registration_fee_receipt_path = replaced;
    }

    const { error } = await supabase.rpc("report_registration_fee", { p_note: note, p_receipt_path: receiptPath });

    if (error) {
        console.error("report_registration_fee error:", error.message);
        if (uploadedNew && receiptPath) await supabase.storage.from(PAYMENT_RECEIPT_BUCKET).remove([receiptPath]);

        return {
            success: false,
            error: /schema cache|could not find the function/i.test(error.message)
                ? "This is not switched on yet. Please tell us and we will fix it."
                : "Could not send this. Please try again.",
        };
    }

    // The receipt that was replaced is no longer needed.
    if (uploadedNew && previous.registration_fee_receipt_path) {
        await supabase.storage.from(PAYMENT_RECEIPT_BUCKET).remove([previous.registration_fee_receipt_path]);
    }

    // Tell the admins there is something to confirm. Best effort.
    const { data: recipients } = await supabase.rpc("approved_admin_emails");

    if (recipients && recipients.length > 0) {
        const origin = await siteOrigin();

        await sendEmail({
            to: recipients,
            subject: alreadyReported ? `Proof of payment added by ${customer.full_name}` : `Registration fee reported by ${customer.full_name}`,
            html: `
                <p><strong>${escapeHtml(customer.full_name)}</strong> ${alreadyReported ? "added a receipt for" : "says they have paid"} the registration fee${alreadyReported ? "" : receiptPath ? " and attached a receipt" : ""}.</p>
                ${note ? `<p>Their note: ${escapeHtml(note)}</p>` : ""}
                <p><a href="${escapeHtml(`${origin}/admin/payments#registration-fees`)}">Check and confirm it</a></p>
            `,
        });
    }

    revalidatePath("/auth/registration-fee");
    revalidatePath("/admin");
    revalidatePath("/admin/customers");

    return { success: true };
}

// "I paid by transfer" on an unpaid invoice. Like the registration fee, it only
// tells the admin; the invoice stays unpaid until an admin confirms it.
export async function reportInvoiceTransfer(formData: FormData): Promise<PaymentActionState> {
    const profile = await getUserProfile();

    if (profile.role !== "customer" || profile.status !== "approved") {
        return { success: false, error: "Only approved customers can do this." };
    }

    const supabase = await createClient();
    const paymentId = String(formData.get("paymentId") ?? "");
    const note = String(formData.get("note") ?? "").trim().slice(0, 300);
    const receipt = formData.get("receipt");

    if (!paymentId) return { success: false, error: "Invalid request." };

    // Only the customer the invoice belongs to (not a tenant viewing an estate bill).
    const { data: invoice } = await supabase
        .from("payments")
        .select("*")
        .eq("id", paymentId)
        .eq("customer_id", profile.id)
        .maybeSingle();

    if (!invoice) return { success: false, error: "Could not find that invoice." };
    if (invoice.status === "paid") return { success: true };

    // Sending again (to add a receipt that was forgotten) keeps whatever was sent
    // before unless it is replaced.
    const previousProof = invoice as { transfer_reported_at?: string | null; transfer_note?: string | null; transfer_receipt_path?: string | null };
    const alreadyReported = Boolean(previousProof.transfer_reported_at);
    const keptNote = note || previousProof.transfer_note || "";
    let receiptPath: string | null = previousProof.transfer_receipt_path ?? null;
    let uploadedNew = false;

    if (receipt instanceof File && receipt.size > 0) {
        const extension = RECEIPT_EXTENSIONS[receipt.type];

        if (!extension || receipt.size > MAX_RECEIPT_BYTES) {
            return { success: false, error: "The receipt must be a photo or PDF under 10MB." };
        }

        const newPath = `${profile.id}/invoice-${paymentId}-${randomUUID()}.${extension}`;

        const { error: uploadError } = await supabase.storage.from(PAYMENT_RECEIPT_BUCKET).upload(newPath, receipt, { upsert: false });

        if (uploadError) {
            console.error("Invoice receipt upload failed:", uploadError.message);
            return { success: false, error: "Could not upload the receipt. Please try again." };
        }

        previousProof.transfer_receipt_path = receiptPath;
        receiptPath = newPath;
        uploadedNew = true;
    }

    const { error } = await supabase.rpc("report_invoice_transfer", {
        p_payment_id: paymentId,
        p_note: keptNote,
        p_receipt_path: receiptPath,
    });

    if (error) {
        console.error("report_invoice_transfer error:", error.message);
        if (uploadedNew && receiptPath) await supabase.storage.from(PAYMENT_RECEIPT_BUCKET).remove([receiptPath]);

        return {
            success: false,
            error: /schema cache|could not find the function/i.test(error.message)
                ? "This is not switched on yet. Please tell us and we will fix it."
                : "Could not send this. Please try again.",
        };
    }

    // The receipt that was replaced is no longer needed.
    if (uploadedNew && previousProof.transfer_receipt_path) {
        await supabase.storage.from(PAYMENT_RECEIPT_BUCKET).remove([previousProof.transfer_receipt_path]);
    }

    const { data: recipients } = await supabase.rpc("approved_admin_emails");

    if (recipients && recipients.length > 0) {
        const origin = await siteOrigin();
        const total = Number(invoice.amount ?? 0) + Number(invoice.arrears ?? 0);

        await sendEmail({
            to: recipients,
            subject: alreadyReported
                ? `Proof of payment added by ${profile.full_name ?? "a customer"}`
                : `Payment reported by ${profile.full_name ?? "a customer"}`,
            html: `
                <p><strong>${escapeHtml(profile.full_name ?? "A customer")}</strong> ${alreadyReported ? "added proof of payment for" : "says they paid"} their ${escapeHtml(invoice.invoice_month ?? "latest")} invoice (₦${total.toLocaleString()})${alreadyReported ? "" : " by bank transfer"}${alreadyReported ? "" : receiptPath ? " and attached a receipt" : ""}.</p>
                ${keptNote ? `<p>Their note: ${escapeHtml(keptNote)}</p>` : ""}
                <p><a href="${escapeHtml(`${origin}/admin/payments`)}">Check and confirm it</a></p>
            `,
        });
    }

    revalidatePath("/customer/payments");
    revalidatePath("/admin/payments");
    revalidatePath("/admin");

    return { success: true };
}
