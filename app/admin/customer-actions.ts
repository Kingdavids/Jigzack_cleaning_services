"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/utils/supabase/server";
import { getUserProfile } from "@/lib/auth/getUserProfile";
import { isFullAdmin } from "@/lib/auth/roles";
import { logActivity } from "@/lib/activity";
import { escapeHtml, sendEmail } from "@/lib/send-email";
import { siteOrigin } from "@/lib/site-origin";

export type CustomerAccountResult = { success: boolean; error?: string; message?: string };

async function requireFullAdmin() {
    const profile = await getUserProfile();

    if (!isFullAdmin(profile) || profile.status !== "approved") {
        throw new Error("Not authorized");
    }

    return profile;
}

const lagosToday = () => new Date().toLocaleDateString("en-CA", { timeZone: "Africa/Lagos" });

// Suspending pauses an account without losing anything. The customer cannot
// open their dashboard, they are left out of the monthly invoices and the
// schedules, and their upcoming automatic pickups are removed. Reactivating
// brings them back (schedules regenerate on the next run).
export async function setCustomerSuspended(profileId: string, suspended: boolean): Promise<CustomerAccountResult> {
    const actor = await requireFullAdmin();
    const supabase = await createClient();

    if (!profileId) return { success: false, error: "Invalid request." };

    const { data: customer } = await supabase
        .from("customers")
        .select("id, full_name, status")
        .eq("profile_id", profileId)
        .maybeSingle();

    if (!customer) return { success: false, error: "Could not find that customer." };

    const { error } = await supabase
        .from("customers")
        .update({ status: suspended ? "inactive" : "active" })
        .eq("profile_id", profileId);

    if (error) {
        console.error("setCustomerSuspended error:", error.message);
        return { success: false, error: "Could not update this customer. Please try again." };
    }

    let removed = 0;

    if (suspended) {
        const { data: gone } = await supabase
            .from("tasks")
            .delete()
            .eq("customer_id", profileId)
            .eq("status", "pending")
            .eq("auto_generated", true)
            .gte("scheduled_date", lagosToday())
            .select("id");

        removed = gone?.length ?? 0;
    }

    await logActivity(
        supabase,
        actor,
        suspended ? "customer_suspended" : "customer_reactivated",
        `${suspended ? "Suspended" : "Reactivated"} ${customer.full_name}`,
        { type: "profile", id: profileId }
    );

    revalidatePath("/admin/customers");
    revalidatePath(`/admin/customers/${profileId}`);
    revalidatePath("/admin/tasks");
    revalidatePath("/admin");

    return {
        success: true,
        message: suspended
            ? `Suspended.${removed > 0 ? ` Removed ${removed} upcoming pickups.` : ""}`
            : "Reactivated. Their pickups will be scheduled again on the next run.",
    };
}

// Permanent. Removes the login, the customer record, their invoices, tasks,
// photos and messages. To make an accident hard, the customer's exact name has
// to be typed in.
export async function deleteCustomerAccount(profileId: string, confirmName: string): Promise<CustomerAccountResult> {
    const actor = await requireFullAdmin();
    const supabase = await createClient();

    if (!profileId) return { success: false, error: "Invalid request." };

    const { data: customer } = await supabase
        .from("customers")
        .select("full_name")
        .eq("profile_id", profileId)
        .maybeSingle();

    if (!customer) return { success: false, error: "Could not find that customer." };

    if (confirmName.trim().toLowerCase() !== customer.full_name.trim().toLowerCase()) {
        return { success: false, error: "The name you typed does not match. Nothing was deleted." };
    }

    // Remember where their photo files are before the records disappear.
    const { data: photos } = await supabase.from("uploads").select("image_url").eq("customer_id", profileId);

    const { error } = await supabase.rpc("admin_delete_customer", { p_profile_id: profileId });

    if (error) {
        console.error("admin_delete_customer error:", error.message);

        if (/schema cache|could not find the function/i.test(error.message)) {
            return { success: false, error: "Deleting is not switched on yet. Run supabase/customer-delete-2026-09.sql first." };
        }

        return {
            success: false,
            error: error.message.startsWith("This estate")
                ? error.message
                : `Could not delete this customer. (${error.code || "unknown"}: ${error.message.slice(0, 120)})`,
        };
    }

    const paths = (photos ?? [])
        .map((p) => (p.image_url as string).split("/task-photos/")[1])
        .filter(Boolean)
        .map((p) => decodeURIComponent(p));

    if (paths.length > 0) {
        await supabase.storage.from("task-photos").remove(paths);
    }

    await logActivity(supabase, actor, "customer_deleted", `Deleted the customer ${customer.full_name}`);

    revalidatePath("/admin/customers");
    revalidatePath("/admin/tasks");
    revalidatePath("/admin/payments");
    revalidatePath("/admin/uploads");
    revalidatePath("/admin/messages");
    revalidatePath("/admin");

    return { success: true, message: "Deleted." };
}

// The registration fee is paid by bank transfer. "confirm" covers both a
// customer who reported paying and one who paid you directly (an existing
// customer, say). "reject" clears the report so they can send it again.
export async function setRegistrationFee(profileId: string, action: "confirm" | "reject", note: string): Promise<CustomerAccountResult> {
    const actor = await requireFullAdmin();
    const supabase = await createClient();

    if (!profileId || !["confirm", "reject"].includes(action)) return { success: false, error: "Invalid request." };

    const { data: customer } = await supabase
        .from("customers")
        .select("full_name, email, registration_fee_paid")
        .eq("profile_id", profileId)
        .maybeSingle();

    if (!customer) return { success: false, error: "Could not find that customer." };

    const cleanNote = note.trim().slice(0, 300);

    const update =
        action === "confirm"
            ? {
                  registration_fee_paid: true,
                  registration_fee_paid_at: new Date().toISOString(),
                  registration_fee_reference: cleanNote || "Confirmed by admin",
              }
            : {
                  registration_fee_paid: false,
                  registration_fee_paid_at: null,
                  registration_fee_submitted_at: null,
                  registration_fee_receipt_path: null,
              };

    const { error } = await supabase.from("customers").update(update).eq("profile_id", profileId);

    if (error) {
        console.error("setRegistrationFee error:", error.message);
        return {
            success: false,
            error: /registration_fee_submitted_at|registration_fee_receipt_path/.test(error.message)
                ? "Not switched on yet. Run supabase/manual-payments-2026-09.sql first."
                : "Could not update this customer. Please try again.",
        };
    }

    if (action === "confirm" && customer.email && !customer.registration_fee_paid) {
        await sendEmail({
            to: [customer.email],
            subject: "Your Jigzack registration fee is confirmed",
            html: `
                <p>Hi ${escapeHtml(customer.full_name ?? "there")},</p>
                <p>We have confirmed your registration fee. Your dashboard is now open.</p>
                <p><a href="${escapeHtml(`${await siteOrigin()}/auth`)}">Log in to your account</a></p>
                <p>Jigzack Cleaning Services</p>
            `,
        });
    }

    await logActivity(
        supabase,
        actor,
        action === "confirm" ? "registration_fee_confirmed" : "registration_fee_rejected",
        `${action === "confirm" ? "Confirmed" : "Rejected"} the registration fee for ${customer.full_name}`,
        { type: "profile", id: profileId }
    );

    revalidatePath(`/admin/customers/${profileId}`);
    revalidatePath("/admin/customers");
    revalidatePath("/admin");

    return { success: true, message: action === "confirm" ? "Registration fee confirmed." : "Cleared. They can report it again." };
}

// The customer said they paid by transfer but nothing arrived. Clear the report
// so the invoice goes back to plain "awaiting payment".
export async function clearInvoiceTransferReport(paymentId: string): Promise<CustomerAccountResult> {
    const actor = await requireFullAdmin();
    const supabase = await createClient();

    if (!paymentId) return { success: false, error: "Invalid request." };

    const { error } = await supabase
        .from("payments")
        .update({ transfer_reported_at: null, transfer_note: null, transfer_receipt_path: null })
        .eq("id", paymentId)
        .eq("status", "pending");

    if (error) {
        console.error("clearInvoiceTransferReport error:", error.message);
        return { success: false, error: "Could not update this invoice. Please try again." };
    }

    await logActivity(supabase, actor, "invoice_transfer_cleared", "Marked a reported transfer as not received", { type: "payment", id: paymentId });

    revalidatePath("/admin/payments");
    revalidatePath("/customer/payments");
    revalidatePath("/admin");

    return { success: true, message: "Cleared." };
}

// A customer record with no login attached (for example after the login was
// deleted in the Supabase dashboard). It cannot be opened, so it is removed
// from the list. Records that still have a login use the full delete instead.
export async function deleteCustomerRecord(customerId: string): Promise<CustomerAccountResult> {
    const actor = await requireFullAdmin();
    const supabase = await createClient();

    if (!customerId) return { success: false, error: "Invalid request." };

    const { data: customer } = await supabase
        .from("customers")
        .select("id, full_name, profile_id")
        .eq("id", customerId)
        .maybeSingle();

    if (!customer) return { success: false, error: "Could not find that record." };
    if (customer.profile_id) return { success: false, error: "This customer still has a login. Open them and use Delete customer." };

    const { error } = await supabase.from("customers").delete().eq("id", customerId).is("profile_id", null);

    if (error) {
        console.error("deleteCustomerRecord error:", error.code, error.message);
        return { success: false, error: `Could not remove this record. (${error.code || "unknown"})` };
    }

    await logActivity(supabase, actor, "customer_record_removed", `Removed the customer record ${customer.full_name} (no login)`);

    revalidatePath("/admin/customers");
    revalidatePath("/admin");

    return { success: true, message: "Removed." };
}
