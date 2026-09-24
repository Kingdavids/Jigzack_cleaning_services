"use server";

import { randomBytes, randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { createClient } from "@/utils/supabase/server";
import { getUserProfile } from "@/lib/auth/getUserProfile";
import { isFullAdmin } from "@/lib/auth/roles";
import { logActivity } from "@/lib/activity";
import { escapeHtml, sendEmail } from "@/lib/send-email";
import { siteOrigin } from "@/lib/site-origin";
import { approvalEmail } from "@/lib/approval-email";
import { ALL_FACILITIES, DOMESTIC_FACILITIES, facilityCount } from "@/lib/customer/facilities";
import { itemsTotal, monthLabel, normalizeLineItems, type LineItem } from "@/lib/billing/pricing";
import {
    BILLABLE_SELECT,
    generateInvoiceFor,
    generateScheduleFor,
    recalculateOpenInvoice,
    type BillableCustomer,
} from "@/lib/billing/generate";
import { runInvoiceGeneration, runScheduleGeneration } from "@/lib/billing/run";

async function requireAdmin() {
    const profile = await getUserProfile();

    // View-only admins can look but not change anything.
    if (!isFullAdmin(profile)) {
        throw new Error("Not authorized");
    }

    return profile;
}

// Identical rows created seconds apart are a double-submit (double click,
// retried request), not a second intent -- the client-side pending guard
// alone can't fully rule that out.
const DUPLICATE_WINDOW_MS = 15_000;
const duplicateSince = () => new Date(Date.now() - DUPLICATE_WINDOW_MS).toISOString();

export type TaskActionState = { success: boolean; error?: string } | null;

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

    await logActivity(supabase, actor, "task_created", "Created a pickup task");
    revalidatePath("/admin/tasks");
    revalidatePath("/employee");
    revalidatePath("/employee/tasks");
    revalidatePath("/customer");
    revalidatePath("/customer/tasks");

    return { success: true };
}

export type InvoiceActionState = { success: boolean; error?: string } | null;

export async function createInvoice(
    _prevState: InvoiceActionState,
    formData: FormData
): Promise<InvoiceActionState> {
    const actor = await requireAdmin();
    const supabase = await createClient();

    const customerId = String(formData.get("customerId") || "");
    const amount = Number(formData.get("amount") || 0);
    const description = String(formData.get("description") || "").trim() || null;
    const invoiceMonth = String(formData.get("invoiceMonth") || "").trim() || null;

    if (!customerId || !amount || amount <= 0) {
        return { success: false, error: "Choose a customer and enter an amount greater than zero." };
    }

    const { data: duplicateInvoice } = await supabase
        .from("payments")
        .select("id")
        .eq("customer_id", customerId)
        .eq("amount", amount)
        .gte("created_at", duplicateSince())
        .limit(1);

    if (duplicateInvoice && duplicateInvoice.length > 0) {
        return { success: true };
    }

    const { error } = await supabase.from("payments").insert({
        customer_id: customerId,
        amount,
        description,
        invoice_month: invoiceMonth,
    });

    if (error) {
        console.error("createInvoice insert error:", error.message);
        return { success: false, error: "Could not create invoice. Please try again." };
    }

    await logActivity(supabase, actor, "invoice_created", "Created a one-off invoice");
    revalidatePath("/admin/payments");
    revalidatePath("/customer");
    revalidatePath("/customer/payments");

    return { success: true };
}

const PAYMENT_METHODS = ["Bank transfer", "Cash", "POS", "Paystack", "Other"];

export async function markInvoicePaid(paymentId: string, method: string, reference: string) {
    const actor = await requireAdmin();
    const supabase = await createClient();

    if (!paymentId) return;

    const { error } = await supabase
        .from("payments")
        .update({
            status: "paid",
            paid_at: new Date().toISOString(),
            payment_method: PAYMENT_METHODS.includes(method) ? method : "Other",
            payment_reference: reference.trim().slice(0, 120) || null,
        })
        .eq("id", paymentId)
        .neq("status", "paid");

    if (error) {
        console.error("markInvoicePaid error:", error.message);
        return;
    }

    await logActivity(supabase, actor, "invoice_paid", `Marked an invoice paid (${method || "no method"})`, { type: "payment", id: paymentId });
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

    const { data: duplicateMessage } = await supabase
        .from("messages")
        .select("id")
        .eq("from_profile_id", profile.id)
        .eq("to_profile_id", toProfileId)
        .eq("subject", subject)
        .eq("body", body)
        .gte("created_at", duplicateSince())
        .limit(1);

    if (duplicateMessage && duplicateMessage.length > 0) {
        return { success: true };
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

    const { data: duplicateBroadcast } = await supabase
        .from("messages")
        .select("id")
        .eq("from_profile_id", profile.id)
        .eq("subject", subject)
        .eq("body", body)
        .eq("is_broadcast", true)
        .gte("created_at", duplicateSince())
        .limit(1);

    if (duplicateBroadcast && duplicateBroadcast.length > 0) {
        return { success: true };
    }

    const groupId = randomUUID();
    const rows = recipients.map((r) => ({
        from_profile_id: profile.id,
        to_profile_id: r.id,
        subject,
        body,
        is_broadcast: true,
        group_id: groupId,
    }));

    const { error } = await supabase.from("messages").insert(rows);

    if (error) {
        console.error("broadcast insert error:", error.message);
        return { success: false, error: "Could not send broadcast. Please try again." };
    }

    await logActivity(supabase, profile, "broadcast_sent", "Sent a broadcast announcement");
    revalidatePath("/admin/messages");
    revalidatePath("/employee/messages");
    revalidatePath("/customer/messages");

    return { success: true };
}

export type EstateActionState = { success: boolean; error?: string } | null;

export async function promoteToEstate(
    _prevState: EstateActionState,
    formData: FormData
): Promise<EstateActionState> {
    const actor = await requireAdmin();
    const supabase = await createClient();

    const profileId = String(formData.get("profileId") || "");

    if (!profileId) {
        return { success: false, error: "Choose a customer to promote." };
    }

    const { error } = await supabase
        .from("customers")
        .update({ is_estate: true })
        .eq("profile_id", profileId);

    if (error) {
        console.error("promoteToEstate error:", error.message);
        return { success: false, error: "Could not mark this customer as an estate." };
    }

    await logActivity(supabase, actor, "estate_created", "Made a customer an estate account");
    revalidatePath("/admin/estates");
    revalidatePath("/admin/customers");

    return { success: true };
}

export async function createUnit(
    _prevState: EstateActionState,
    formData: FormData
): Promise<EstateActionState> {
    const actor = await requireAdmin();
    const supabase = await createClient();

    const estateProfileId = String(formData.get("estateProfileId") || "");
    const label = String(formData.get("label") || "").trim();

    if (!estateProfileId || !label) {
        return { success: false, error: "A unit label is required." };
    }

    const { error } = await supabase.from("units").insert({
        estate_profile_id: estateProfileId,
        label,
    });

    if (error) {
        console.error("createUnit insert error:", error.message);
        return { success: false, error: "Could not add this unit." };
    }

    await logActivity(supabase, actor, "unit_created", "Added an estate unit");
    revalidatePath("/admin/estates");

    return { success: true };
}

export async function linkTenantToUnit(tenantProfileId: string, unitId: string | null) {
    const actor = await requireAdmin();
    const supabase = await createClient();

    if (!tenantProfileId) return;

    const { error } = await supabase
        .from("customers")
        .update({ unit_id: unitId })
        .eq("profile_id", tenantProfileId);

    if (error) {
        console.error("linkTenantToUnit error:", error.message);
        return;
    }

    await logActivity(supabase, actor, "tenant_linked", unitId ? "Linked a tenant to an estate unit" : "Unlinked a tenant from an estate unit", { type: "profile", id: tenantProfileId });
    revalidatePath("/admin/approvals");
    revalidatePath("/admin/estates");
}

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
            subject: "You're invited to join Jigzack Cleaning Services",
            html: `
                <p>You've been invited to create an employee account with Jigzack Cleaning Services.</p>
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
    reason?: string | null
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

    if (status === "approved" && target.role === "customer") {
        if (unitId) {
            await supabase.from("customers").update({ unit_id: unitId }).eq("profile_id", userId);
            isTenant = true;
            notes.push("Linked to their estate unit.");
        } else {
            const { data: customer } = await supabase
                .from("customers")
                .select(BILLABLE_SELECT)
                .eq("profile_id", userId)
                .maybeSingle();

            if (customer) {
                const billable = customer as unknown as BillableCustomer;
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
            reason: cleanReason,
        });
        const emailed = await sendEmail({ to: [target.email], subject, html });
        notes.push(emailed ? `Emailed ${target.email}.` : "Approval email not sent (email isn't configured).");
    }

    await logActivity(supabase, actor, status === "approved" ? "account_approved" : "account_declined", `${status === "approved" ? "Approved" : "Declined"} ${target.full_name ?? target.email ?? "an account"} (${target.role})`, { type: "profile", id: userId });
    revalidatePath("/admin/approvals");
    revalidatePath("/admin/customers");
    revalidatePath("/admin/tasks");
    revalidatePath("/admin/payments");
    revalidatePath("/admin");

    return { success: true, notes };
}

export type GenerateResult = { success: boolean; message: string };

export async function generateAllSchedules(): Promise<GenerateResult> {
    const actor = await requireAdmin();
    const supabase = await createClient();

    const { customers, created, unrecognised } = await runScheduleGeneration(supabase);

    await logActivity(supabase, actor, "schedules_generated", `Generated schedules: ${created} pickups added`);
    revalidatePath("/admin/tasks");

    return {
        success: true,
        message:
            `Added ${created} pickups across ${customers} customers.` +
            (unrecognised > 0 ? ` ${unrecognised} had a frequency we couldn't read and defaulted to weekly.` : ""),
    };
}

export async function generateAllInvoices(): Promise<GenerateResult> {
    const actor = await requireAdmin();
    const supabase = await createClient();

    const tally = await runInvoiceGeneration(supabase);

    await logActivity(supabase, actor, "invoices_generated", `Generated ${monthLabel()} invoices: ${tally.created} created`);
    revalidatePath("/admin/payments");
    revalidatePath("/customer/payments");

    return {
        success: true,
        message:
            `${tally.created} invoices created for ${monthLabel()}, ${tally.exists} already existed` +
            (tally["no-pricing"] > 0 ? `, ${tally["no-pricing"]} skipped (no priced property types, add manually)` : "") +
            (tally.error > 0 ? `, ${tally.error} failed` : "") +
            ".",
    };
}

export async function generateCustomerBilling(profileId: string, what: "schedule" | "invoice"): Promise<GenerateResult> {
    await requireAdmin();
    const supabase = await createClient();

    const { data: customer } = await supabase.from("customers").select(BILLABLE_SELECT).eq("profile_id", profileId).single();
    if (!customer) return { success: false, message: "Customer not found." };

    const billable = customer as unknown as BillableCustomer;

    revalidatePath("/admin/tasks");
    revalidatePath("/admin/payments");
    revalidatePath(`/admin/customers/${profileId}`);

    if (what === "schedule") {
        const result = await generateScheduleFor(supabase, billable);
        return {
            success: true,
            message: result.created > 0 ? `Added ${result.created} pickups (${result.frequency}).` : "Their schedule is already up to date.",
        };
    }

    const outcome = await generateInvoiceFor(supabase, billable);
    const messages: Record<string, string> = {
        created: `Invoice created for ${monthLabel()}.`,
        exists: `An invoice for ${monthLabel()} already exists.`,
        "no-pricing": "No priced property types are recorded for this customer. Add an invoice manually.",
        error: "Could not create the invoice.",
    };

    return { success: outcome === "created" || outcome === "exists", message: messages[outcome] };
}

// ---------------------------------------------------------------------------
// Customer records
// ---------------------------------------------------------------------------

export type CustomerActionState = { success: boolean; error?: string; message?: string } | null;

const countString = (value: FormDataEntryValue | null) => {
    const n = parseInt(String(value ?? "").trim(), 10);
    return Number.isFinite(n) && n > 0 ? String(n) : "";
};

export async function updateCustomerDetails(
    _prevState: CustomerActionState,
    formData: FormData
): Promise<CustomerActionState> {
    const actor = await requireAdmin();
    const supabase = await createClient();

    const profileId = String(formData.get("profileId") || "");
    if (!profileId) return { success: false, error: "Missing customer." };

    const { data: existing } = await supabase
        .from("customers")
        .select("facility_details")
        .eq("profile_id", profileId)
        .single();

    if (!existing) return { success: false, error: "Customer not found." };

    const facility_details: Record<string, string> = { ...((existing.facility_details as Record<string, string>) ?? {}) };
    for (const facility of ALL_FACILITIES) {
        facility_details[facility.key] = countString(formData.get(facility.key));
    }

    const status = String(formData.get("status") || "active");

    const { error } = await supabase
        .from("customers")
        .update({
            account_code: String(formData.get("accountCode") || "").trim() || null,
            property_code: String(formData.get("propertyCode") || "").trim() || null,
            property_class: String(formData.get("propertyClass") || "").trim() || null,
            preferred_pickup_frequency: String(formData.get("pickupFrequency") || "").trim() || null,
            status: status === "inactive" ? "inactive" : "active",
            facility_details,
        })
        .eq("profile_id", profileId);

    if (error) {
        console.error("updateCustomerDetails error:", error.message);
        return { success: false, error: "Could not save these details." };
    }

    await logActivity(supabase, actor, "customer_edited", "Edited a customer record", { type: "profile", id: profileId });
    revalidatePath(`/admin/customers/${profileId}`);
    revalidatePath("/admin/customers");
    revalidatePath("/customer");

    return { success: true, message: "Customer details saved." };
}

// The landlord tells the company a unit is vacant; the admin records it here
// and the (still automatic, unpaid) invoice for this month is re-priced.
export async function saveVacancies(
    _prevState: CustomerActionState,
    formData: FormData
): Promise<CustomerActionState> {
    const actor = await requireAdmin();
    const supabase = await createClient();

    const profileId = String(formData.get("profileId") || "");
    if (!profileId) return { success: false, error: "Missing customer." };

    const { data: customer } = await supabase.from("customers").select(BILLABLE_SELECT).eq("profile_id", profileId).single();
    if (!customer) return { success: false, error: "Customer not found." };

    const billable = customer as unknown as BillableCustomer;
    const vacancies: Record<string, string> = {};

    for (const facility of DOMESTIC_FACILITIES) {
        const vacant = parseInt(countString(formData.get(facility.key)) || "0", 10);
        const registered = facilityCount(billable.facility_details, facility.key);

        if (vacant > registered) {
            return {
                success: false,
                error: `${facility.label}: ${vacant} vacant is more than the ${registered} registered.`,
            };
        }

        if (vacant > 0) vacancies[facility.key] = String(vacant);
    }

    const { error } = await supabase
        .from("customers")
        .update({ vacancies, vacancy_note: String(formData.get("vacancyNote") || "").trim() || null })
        .eq("profile_id", profileId);

    if (error) {
        console.error("saveVacancies error:", error.message);
        return { success: false, error: "Could not save the vacancies." };
    }

    const recalculated = await recalculateOpenInvoice(supabase, { ...billable, vacancies });

    await logActivity(supabase, actor, "vacancies_saved", "Updated vacant units", { type: "profile", id: profileId });
    revalidatePath(`/admin/customers/${profileId}`);
    revalidatePath("/admin/payments");
    revalidatePath("/customer/payments");
    revalidatePath("/customer");

    return {
        success: true,
        message: recalculated
            ? "Vacancies saved and this month's unpaid invoice was re-priced."
            : "Vacancies saved. They'll apply to the next invoice (an edited or paid invoice isn't changed).",
    };
}

// ---------------------------------------------------------------------------
// Invoices
// ---------------------------------------------------------------------------

export async function updateInvoice(
    _prevState: InvoiceActionState,
    formData: FormData
): Promise<InvoiceActionState> {
    const actor = await requireAdmin();
    const supabase = await createClient();

    const paymentId = String(formData.get("paymentId") || "");
    if (!paymentId) return { success: false, error: "Missing invoice." };

    let items: LineItem[] = [];
    try {
        items = normalizeLineItems(JSON.parse(String(formData.get("lineItems") || "[]")));
    } catch {
        return { success: false, error: "The line items couldn't be read." };
    }

    if (items.length === 0) return { success: false, error: "Add at least one line item." };
    if (items.some((item) => item.quantity < 0 || item.unit_price < 0)) {
        return { success: false, error: "Quantities and prices can't be negative." };
    }

    const arrears = Number(formData.get("arrears") || 0);

    const { data, error } = await supabase
        .from("payments")
        .update({
            amount: itemsTotal(items),
            arrears: Number.isFinite(arrears) && arrears > 0 ? arrears : 0,
            units: items.reduce((sum, item) => sum + item.quantity, 0) || 1,
            description: String(formData.get("description") || "").trim() || null,
            invoice_month: String(formData.get("invoiceMonth") || "").trim() || null,
            line_items: items,
            // Hand-edited from here on, so automatic re-pricing must not overwrite it.
            auto_generated: false,
        })
        .eq("id", paymentId)
        .neq("status", "paid")
        .select("id");

    if (error) {
        console.error("updateInvoice error:", error.message);
        return { success: false, error: "Could not save the invoice." };
    }

    if (!data || data.length === 0) {
        return { success: false, error: "This invoice is already paid and can't be edited." };
    }

    await logActivity(supabase, actor, "invoice_edited", "Edited an invoice");
    revalidatePath("/admin/payments");
    revalidatePath("/customer/payments");
    revalidatePath("/customer");

    return { success: true };
}

// ---------------------------------------------------------------------------
// Schedule management
// ---------------------------------------------------------------------------

export async function updateTask(taskId: string, employeeId: string | null, scheduledDate: string | null, zone: string) {
    const actor = await requireAdmin();
    const supabase = await createClient();

    if (!taskId) return;

    const { error } = await supabase
        .from("tasks")
        .update({
            employee_id: employeeId || null,
            scheduled_date: scheduledDate || null,
            zone: zone.trim() || null,
        })
        .eq("id", taskId);

    if (error) {
        console.error("updateTask error:", error.message);
        return;
    }

    await logActivity(supabase, actor, "task_edited", "Edited a pickup task", { type: "task", id: taskId });
    revalidatePath("/admin/tasks");
    revalidatePath("/employee/tasks");
    revalidatePath("/customer/schedule");
}

export async function deleteTask(taskId: string) {
    const actor = await requireAdmin();
    const supabase = await createClient();

    if (!taskId) return;

    const { error } = await supabase.from("tasks").delete().eq("id", taskId).eq("status", "pending");

    if (error) {
        console.error("deleteTask error:", error.message);
        return;
    }

    await logActivity(supabase, actor, "task_deleted", "Deleted a pickup task", { type: "task", id: taskId });
    revalidatePath("/admin/tasks");
    revalidatePath("/employee/tasks");
    revalidatePath("/customer/schedule");
}

// ---------------------------------------------------------------------------
// Staff expenses
// ---------------------------------------------------------------------------

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

    const { error } = await supabase
        .from("expenses")
        .update({
            status,
            admin_note: adminNote.trim().slice(0, 500) || null,
            reviewed_by: admin.id,
            reviewed_at: new Date().toISOString(),
        })
        .eq("id", expenseId);

    if (error) {
        console.error("reviewExpense error:", error.message);
        return { success: false, error: "Could not update this expense. Please try again." };
    }

    await logActivity(supabase, admin, "expense_" + status, `Marked a staff expense ${status}`, { type: "expense", id: expenseId });
    revalidatePath("/admin/expenses");
    revalidatePath("/admin");
    revalidatePath("/employee/expenses");

    return { success: true };
}
