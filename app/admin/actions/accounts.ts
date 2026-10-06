"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { createClient } from "@/utils/supabase/server";
import { logActivity } from "@/lib/activity";
import { escapeHtml, sendEmail } from "@/lib/send-email";
import { siteOrigin } from "@/lib/site-origin";
import { approvalEmail } from "@/lib/approval-email";
import { generateInvoiceFor, generateScheduleFor, loadBillable } from "@/lib/billing/generate";
import { requireAdmin } from "./shared";
import { BUSINESS } from "@/lib/config/business";
import { WAIVED_REFERENCE } from "@/lib/finance/registration";

export type InviteActionState = {
    success: boolean;
    error?: string;
    link?: string;
    emailed?: boolean;
} | null;

// Employees can't self-register: an admin mints a single-use link (7 days)
// and the invited person signs up through it. The token is generated here,
// server-side, and only ever validated by the database.
export async function createEmployeeInvite(
    _prevState: InviteActionState,
    formData: FormData
): Promise<InviteActionState> {
    const admin = await requireAdmin();
    const supabase = await createClient();

    const email = String(formData.get("email") || "").trim().toLowerCase() || null;

    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return { success: false, error: "That email address doesn't look valid." };
    }

    const token = randomBytes(24).toString("hex");

    const { error } = await supabase.from("employee_invites").insert({
        token,
        email,
        invited_by: admin.id,
    });

    if (error) {
        console.error("createEmployeeInvite insert error:", error.message);
        return { success: false, error: "Could not create the invite. Please try again." };
    }

    const link = `${await siteOrigin()}/auth/employee-invite?token=${token}`;

    let emailed = false;
    if (email) {
        emailed = await sendEmail({
            to: [email],
            subject: `You're invited to join ${BUSINESS.name}`,
            html: `
                <p>You've been invited to create an employee account with ${BUSINESS.name}.</p>
                <p><a href="${escapeHtml(link)}">Set up your account</a></p>
                <p>This link works once and expires in 7 days.</p>
            `,
        });
    }

    await logActivity(supabase, admin, "employee_invited", email ? `Invited an employee (${email})` : "Created an employee invite link");
    revalidatePath("/admin/employees");

    return { success: true, link, emailed };
}

export async function revokeEmployeeInvite(inviteId: string) {
    const actor = await requireAdmin();
    const supabase = await createClient();

    if (!inviteId) return;

    const { error } = await supabase
        .from("employee_invites")
        .delete()
        .eq("id", inviteId)
        .is("used_at", null);

    if (error) {
        console.error("revokeEmployeeInvite error:", error.message);
        return;
    }

    await logActivity(supabase, actor, "employee_invite_revoked", "Revoked an employee invite");
    revalidatePath("/admin/employees");
}

// ---------------------------------------------------------------------------
// Approvals (with the applicant's email) and auto-generated schedule/invoice
// ---------------------------------------------------------------------------

export type ApprovalResult = { success: boolean; error?: string; notes?: string[] };

// Someone who was declined and then got in touch: put them back in the
// pending list, where the normal approve and decline controls apply. Their
// earlier reason is kept so the history isn't lost.
export async function reopenApplication(userId: string): Promise<ApprovalResult> {
    const actor = await requireAdmin();
    const supabase = await createClient();

    if (!userId) return { success: false, error: "Invalid request." };

    const { data: target } = await supabase.from("profiles").select("id, status").eq("id", userId).single();

    if (!target) return { success: false, error: "Could not find that user." };
    if (target.status !== "declined") return { success: true, notes: ["This application isn't declined."] };

    const { error } = await supabase.from("profiles").update({ status: "pending" }).eq("id", userId);

    if (error) {
        console.error("reopenApplication error:", error.message);
        return { success: false, error: "Could not reopen this application. Please try again." };
    }

    await logActivity(supabase, actor, "application_reopened", "Moved a declined application back to pending", { type: "profile", id: userId });
    revalidatePath("/admin/approvals");
    revalidatePath("/admin");

    return { success: true, notes: ["Moved back to pending. Review it under Signup approvals."] };
}

export async function setUserApproval(
    userId: string,
    status: "approved" | "declined",
    unitId: string | null,
    reason?: string | null,
    waiveFee = false
): Promise<ApprovalResult> {
    const actor = await requireAdmin();
    const supabase = await createClient();

    if (!userId || (status !== "approved" && status !== "declined")) {
        return { success: false, error: "Invalid request." };
    }

    const { data: target } = await supabase
        .from("profiles")
        .select("id, full_name, email, role, status")
        .eq("id", userId)
        .single();

    if (!target) return { success: false, error: "Could not find that user." };

    // A double click must not approve twice or email the person twice.
    if (target.status === status) return { success: true, notes: [`Already ${status}.`] };

    const cleanReason = status === "declined" ? (reason ?? "").trim().slice(0, 500) || null : null;

    let { error } = await supabase
        .from("profiles")
        .update({
            status,
            decline_reason: cleanReason,
            declined_at: status === "declined" ? new Date().toISOString() : null,
        })
        .eq("id", userId);

    // The reason columns come from supabase/declined-and-expenses-2026-09.sql.
    // Until that has been run, still record the decision itself.
    if (error && /decline_reason|declined_at/.test(error.message)) {
        ({ error } = await supabase.from("profiles").update({ status }).eq("id", userId));
    }

    if (error) {
        console.error("setUserApproval update error:", error.message);
        return { success: false, error: "Could not update this account. Please try again." };
    }

    const notes: string[] = [];
    let isTenant = false;
    let feeWaived = false;
    let isCommercial = false;

    if (status === "approved" && target.role === "customer") {
        if (unitId) {
            await supabase.from("customers").update({ unit_id: unitId }).eq("profile_id", userId);
            isTenant = true;
            notes.push("Linked to their estate unit.");
        } else {
            // Commercial sites are surveyed before they are quoted.
            const { data: kind } = await supabase.from("customers").select("property_type").eq("profile_id", userId).maybeSingle();
            isCommercial = String(kind?.property_type ?? "").toLowerCase() === "commercial";
            if (isCommercial) notes.push("Commercial facility: arrange a site visit before quoting. The approval email tells them so.");

            // An existing customer who was already with Jigzack before the app
            // does not pay the registration fee. Recorded on their profile too
            // (registration-fee-waiver-2026-09.sql), so it still applies the
            // moment their customer record is created even if that has not
            // happened yet, in whichever order those two things occur.
            if (waiveFee) {
                const { error: profileWaiveError } = await supabase
                    .from("profiles")
                    .update({ registration_fee_waived: true })
                    .eq("id", userId);

                if (profileWaiveError && !/registration_fee_waived/.test(profileWaiveError.message)) {
                    console.error("setUserApproval profile waive error:", profileWaiveError.message);
                }

                const { data: waived, error: waiveError } = await supabase
                    .from("customers")
                    .update({
                        registration_fee_paid: true,
                        registration_fee_paid_at: new Date().toISOString(),
                        registration_fee_reference: WAIVED_REFERENCE,
                    })
                    .eq("profile_id", userId)
                    .select("id");

                if (!waiveError && (!waived || waived.length === 0)) {
                    // No customer record yet: the waiver applies automatically the
                    // moment they finish their property form, no follow-up needed.
                    notes.push("They have not filled in their property form yet. The fee waiver applies automatically once they do.");
                } else if (waiveError) {
                    console.error("setUserApproval waive error:", waiveError.message);
                    notes.push("Could not waive the registration fee. Confirm it from their customer page.");
                } else {
                    feeWaived = true;
                    notes.push("Registration fee waived (existing customer).");
                }
            }

            const billable = await loadBillable(supabase, userId);

            if (billable) {
                const schedule = await generateScheduleFor(supabase, billable);
                const invoice = await generateInvoiceFor(supabase, billable);

                notes.push(
                    schedule.created > 0
                        ? `Created ${schedule.created} scheduled pickups (${schedule.frequency}).`
                        : "No new pickups were scheduled."
                );
                if (!schedule.recognised) {
                    notes.push("Their pickup frequency wasn't recognised, so it defaulted to weekly. Check the schedule.");
                }
                notes.push(
                    invoice === "created"
                        ? "Generated this month's invoice."
                        : invoice === "no-pricing"
                            ? "No invoice generated: no priced property types were entered. Add one manually."
                            : invoice === "exists"
                                ? "This month's invoice already exists."
                                : "Could not generate the invoice."
                );
            }
        }
    }

    if (target.email) {
        const { subject, html } = approvalEmail({
            name: target.full_name,
            role: target.role,
            status,
            origin: await siteOrigin(),
            isTenant,
            feeWaived,
            isCommercial,
            reason: cleanReason,
        });
        const emailed = await sendEmail({ to: [target.email], subject, html });
        notes.push(emailed ? `Emailed ${target.email}.` : "Approval email not sent (email isn't configured).");
    }

    await logActivity(supabase, actor, status === "approved" ? "account_approved" : "account_declined", `${status === "approved" ? "Approved" : "Declined"} ${target.full_name ?? target.email ?? "an account"} (${target.role})${feeWaived ? ", registration fee waived" : ""}`,{ type: "profile", id: userId });
    revalidatePath("/admin/approvals");
    revalidatePath("/admin/customers");
    revalidatePath("/admin/tasks");
    revalidatePath("/admin/payments");
    revalidatePath("/admin");

    return { success: true, notes };
}
