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
import { billingMonthLabel, itemsTotal, normalizeLineItems, tooEarlyToBill, type LineItem } from "@/lib/billing/pricing";
import { EXPENSE_CATEGORIES, EXPENSE_STEPS_FROM, MAX_RECEIPT_BYTES, RECEIPT_BUCKET, RECEIPT_EXTENSIONS } from "@/lib/expenses";
import { amountPaid, balanceOf, groupInstallments, invoiceTotal, loadInstallments, round2 } from "@/lib/billing/balance";
import { coveredMonthsFrom, loadPrepayments } from "@/lib/billing/prepaid";
import { isPastDate, moveTaskToNextDay, todayLagos } from "@/lib/tasks";
import { frequencyToDays } from "@/lib/billing/schedule";
import { naira, receiptNumber } from "@/lib/customer/billing";
import {
    clearPendingArrears,
    discountInfo,
    generateInvoiceFor,
    generateScheduleFor,
    loadBillable,
    loadEstateUnits,
    planSchedule,
    recalculateOpenInvoice,
} from "@/lib/billing/generate";
import { runInvoiceGeneration, runScheduleGeneration } from "@/lib/billing/run";
import { removeUnreferencedAttachments, saveMessageAttachment } from "@/lib/message-attachments";
import { emailEachRecipient } from "@/lib/broadcast-email";

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

// Everyone else on the job besides the lead, with repeats and the lead removed.
const crewFrom = (values: unknown[], leadId: string | null) =>
    [...new Set(values.map((v) => String(v)).filter((v) => v && v !== leadId))];

// A pickup dated before today has already happened, so it is saved as serviced.
const servicedTimes = (date: string) => ({
    status: "completed",
    started_at: `${date}T08:00:00+01:00`,
    completed_at: `${date}T17:00:00+01:00`,
});

async function setCrew(supabase: Awaited<ReturnType<typeof createClient>>, taskId: string, crewIds: string[]) {
    const removed = await supabase.from("task_crew").delete().eq("task_id", taskId);

    // The table does not exist until supabase/tasks-crew-2026-09.sql has been run.
    if (removed.error) return crewIds.length === 0 ? null : "Extra crew members are not switched on yet. Run supabase/tasks-crew-2026-09.sql in Supabase first.";

    if (crewIds.length > 0) {
        const { error } = await supabase.from("task_crew").insert(crewIds.map((employee_id) => ({ task_id: taskId, employee_id })));
        if (error) {
            console.error("setCrew insert error:", error.message);
            return "Could not add the other crew members. Please try again.";
        }
    }

    return null;
}

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
    const crewIds = crewFrom(formData.getAll("crewIds"), employeeId);

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

    const past = isPastDate(scheduledDate);

    const { data: created, error } = await supabase
        .from("tasks")
        .insert({
            title,
            customer_id: customerId,
            employee_id: employeeId,
            scheduled_date: scheduledDate,
            zone,
            priority,
            ...(past && scheduledDate ? servicedTimes(scheduledDate) : {}),
        })
        .select("id")
        .single();

    if (error || !created) {
        console.error("createTask insert error:", error?.message);
        return { success: false, error: "Could not create task. Please try again." };
    }

    if (crewIds.length > 0) {
        const crewError = await setCrew(supabase, created.id as string, crewIds);

        if (crewError) {
            await supabase.from("tasks").delete().eq("id", created.id);
            return { success: false, error: crewError };
        }
    }

    await logActivity(
        supabase,
        actor,
        "task_created",
        past ? "Recorded a past pickup as serviced" : crewIds.length > 0 ? "Created a pickup task for a crew" : "Created a pickup task",
        { type: "task", id: created.id as string }
    );
    revalidatePath("/admin/tasks");
    revalidatePath("/admin");
    revalidatePath("/employee");
    revalidatePath("/employee/tasks");
    revalidatePath("/customer");
    revalidatePath("/customer/tasks");
    revalidatePath("/customer/schedule");

    return { success: true };
}

export type InvoiceActionState = { success: boolean; error?: string } | null;

export type NewInvoiceState = { success: boolean; error?: string; invoiceId?: string } | null;

// What InvoiceBuilder submits: the priced lines, arrears, the months covered
// and the property's unit counts.
type InvoiceKind = "service" | "recyclables" | "other";
type SaleLine = { material: string; materialNote: string | null; kg: number; price: number };

const MATERIAL_VALUES = ["plastic", "metal", "paper", "glass", "electronics", "other"];

function readBuiltInvoice(formData: FormData):
    | { error: string }
    | {
          kind: InvoiceKind;
          sales: SaleLine[];
          items: LineItem[];
          amount: number;
          arrears: number;
          invoiceMonth: string | null;
          coveredMonths: string[];
          propertyDetails: Record<string, string>;
      } {
    const rawKind = String(formData.get("invoiceKind") ?? "service");
    const kind: InvoiceKind = rawKind === "recyclables" || rawKind === "other" ? rawKind : "service";
    let sales: SaleLine[] = [];
    let items: LineItem[] = [];
    let coveredMonths: string[] = [];
    let propertyDetails: Record<string, string> = {};

    try {
        items = normalizeLineItems(JSON.parse(String(formData.get("lineItems") || "[]")));
        const months = JSON.parse(String(formData.get("coveredMonths") || "[]"));
        coveredMonths = Array.isArray(months) ? months.map(String).filter(Boolean).slice(0, 24) : [];
        const details = JSON.parse(String(formData.get("propertyDetails") || "{}"));
        propertyDetails = details && typeof details === "object" ? Object.fromEntries(Object.entries(details).map(([k, v]) => [k, String(v)])) : {};

        if (kind === "recyclables") {
            const raw = JSON.parse(String(formData.get("recyclableLines") || "[]"));
            sales = (Array.isArray(raw) ? raw : [])
                .map((line: { material?: unknown; materialNote?: unknown; kg?: unknown; price?: unknown }) => ({
                    material: String(line.material ?? ""),
                    materialNote: String(line.materialNote ?? "").trim().slice(0, 80) || null,
                    kg: round2(Number(line.kg)),
                    price: round2(Number(line.price)),
                }))
                .filter((line) => MATERIAL_VALUES.includes(line.material) && Number.isFinite(line.kg) && line.kg > 0 && Number.isFinite(line.price) && line.price >= 0);

            if (sales.some((line) => line.material === "other" && !line.materialNote)) return { error: "Say what each \"other\" material is." };
        }
    } catch {
        return { error: "The invoice details couldn't be read. Please try again." };
    }

    items = items.filter((item) => item.label && item.quantity > 0);
    if (items.length === 0) {
        return {
            error:
                kind === "recyclables"
                    ? "Add at least one material with its weight and price."
                    : kind === "other"
                        ? "Add at least one item with a name, quantity and price."
                        : "Add the property's units, or another charge, so there is something to bill.",
        };
    }

    const amount = round2(itemsTotal(items));
    if (amount <= 0) return { error: "The charges must add up to more than zero." };

    const arrearsInput = Number(formData.get("arrears") || 0);
    const arrears = Number.isFinite(arrearsInput) && arrearsInput > 0 ? round2(arrearsInput) : 0;

    // A sale or other invoice isn't a month of service: it has no month, and it
    // covers no months, so the automatic monthly invoice is never skipped for it.
    if (kind !== "service") return { kind, sales, items, amount, arrears, invoiceMonth: null, coveredMonths: [], propertyDetails: {} };

    const invoiceMonth = String(formData.get("invoiceMonth") ?? "").trim().slice(0, 60) || null;

    // A single month is only billed from the 25th; several months at once is paying ahead.
    const early = tooEarlyToBill(invoiceMonth);
    if (early) return { error: early };

    return { kind, sales, items, amount, arrears, invoiceMonth, coveredMonths, propertyDetails };
}

// What an invoice says it is for when no description was typed.
function invoiceDescription(kind: InvoiceKind, month: string | null) {
    return kind === "recyclables" ? "Sale of recyclables" : kind === "other" ? "Services and items" : `Waste management service${month ? `, ${month}` : ""}`;
}

// Why an invoice insert failed, in words an admin can act on.
function invoiceInsertError(message: string | undefined) {
    if (/invoice_kind/.test(message ?? "")) return "Not switched on yet. Run supabase/recyclables-trading-2026-10.sql in Supabase first.";
    if (/covered_months/.test(message ?? "")) return "Not switched on yet. Run supabase/invoice-months-2026-10.sql in Supabase first.";
    if (/bill_to/.test(message ?? "")) return "Not switched on yet. Run supabase/non-customer-invoices-2026-10.sql in Supabase first.";
    return "Could not create the invoice. Please try again.";
}

// Weight of each material in stock, to make sure a sale never sends out more
// than there is. Null where the recyclables table doesn't exist yet.
async function stockOf(supabase: Awaited<ReturnType<typeof createClient>>, material: string) {
    const { data, error } = await supabase.from("recyclable_movements").select("direction, kg").eq("material", material).limit(20000);
    if (error) return null;

    return (data ?? []).reduce((sum, r) => sum + (r.direction === "in" ? Number(r.kg) : -Number(r.kg)), 0);
}

async function checkSaleStock(supabase: Awaited<ReturnType<typeof createClient>>, sales: SaleLine[]): Promise<string | null> {
    const wanted = new Map<string, number>();
    for (const line of sales) wanted.set(line.material, (wanted.get(line.material) ?? 0) + line.kg);

    for (const [material, kg] of wanted) {
        const stock = await stockOf(supabase, material);
        if (stock === null) return "Recyclables tracking isn't switched on. Run supabase/admin-expenses-recyclables-2026-10.sql in Supabase first.";
        if (kg > stock + 0.001) return `Only ${Math.max(0, Math.round(stock * 100) / 100)} kg of ${material} is in stock, and this sale is for ${kg} kg.`;
    }

    return null;
}

// A sale takes its weight out of stock, tied to the invoice so removing the
// invoice puts the stock back. Returns an error (and nothing is left behind).
async function logSaleMovements(
    supabase: Awaited<ReturnType<typeof createClient>>,
    adminId: string,
    paymentId: string,
    buyer: string | null,
    sales: SaleLine[]
): Promise<string | null> {
    if (sales.length === 0) return null;

    const { error } = await supabase.from("recyclable_movements").insert(
        sales.map((line) => ({
            direction: "out",
            material: line.material,
            material_note: line.material === "other" ? line.materialNote : null,
            kg: line.kg,
            movement_date: todayLagos(),
            party: buyer,
            note: "Sale invoice",
            amount: round2(line.kg * line.price),
            payment_id: paymentId,
            recorded_by: adminId,
        }))
    );

    return error ? error.message : null;
}

// Who an invoice is for, from BillToFields: the person or business, an
// optional property name printed instead of theirs, contact details and the
// address the service is for.
function readBillTo(formData: FormData, kind: InvoiceKind = "service") {
    const text = (name: string, max = 200) => String(formData.get(name) ?? "").trim().slice(0, max) || null;

    const billTo = {
        full_name: text("fullName", 120),
        property_name: text("propertyName", 120),
        phone: text("phone", 40),
        whatsapp_number: text("whatsapp", 40),
        email: text("email", 160),
        address: text("address", 300),
        landmark: text("landmark", 160),
        lga: text("lga", 80),
        state: text("state", 80),
        property_type: text("propertyType", 40),
    };

    if (!billTo.full_name) return { error: "Enter the name of the person or business being billed." };
    if (!billTo.phone && !billTo.email) return { error: "Enter a phone number or an email address for them." };
    if (kind === "service" && !billTo.address) return { error: "Enter the address the service is for." };
    if (billTo.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(billTo.email)) return { error: "That email address doesn't look right." };

    return { billTo };
}

// Corrects the details on every invoice for someone not registered on the app.
// Each invoice keeps its own unit counts; only who and where change. Invoices
// already moved to a customer are left alone.
export async function updateBillToDetails(invoiceIds: string[], _prevState: CustomerActionState, formData: FormData): Promise<CustomerActionState> {
    const actor = await requireAdmin();
    const supabase = await createClient();

    const ids = [...new Set((invoiceIds ?? []).filter(Boolean))].slice(0, 500);
    if (ids.length === 0) return { success: false, error: "No invoices to update." };

    const read = readBillTo(formData);
    if ("error" in read) return { success: false, error: read.error };

    const { data: rows, error: loadError } = await supabase.from("payments").select("id, bill_to").in("id", ids).is("customer_id", null);

    if (loadError || !rows || rows.length === 0) {
        console.error("updateBillToDetails load error:", loadError?.message);
        return { success: false, error: "Could not find these invoices." };
    }

    for (const row of rows) {
        const before = (row.bill_to as Record<string, unknown> | null) ?? {};
        const { error } = await supabase
            .from("payments")
            .update({ bill_to: { ...before, ...read.billTo } })
            .eq("id", row.id)
            .is("customer_id", null);

        if (error) {
            console.error("updateBillToDetails error:", error.message);
            return { success: false, error: "Could not save the details. Please try again." };
        }
    }

    await logActivity(supabase, actor, "invoice_edited", `Updated the details for ${read.billTo.full_name} (not registered)`);
    revalidatePath("/admin/payments");
    revalidatePath("/admin");

    return { success: true, message: `Details updated on ${rows.length} invoice${rows.length === 1 ? "" : "s"}.` };
}

// An invoice for someone who is not registered on the app. Their details are
// kept on the invoice itself (payments.bill_to); an admin prints, downloads or
// shares it with them, since they have no dashboard to see it in.
export async function createNonCustomerInvoice(_prevState: NewInvoiceState, formData: FormData): Promise<NewInvoiceState> {
    const actor = await requireAdmin();
    const supabase = await createClient();

    const built = readBuiltInvoice(formData);
    if ("error" in built) return { success: false, error: built.error };

    const { kind, sales, items, amount, arrears, invoiceMonth, coveredMonths, propertyDetails } = built;

    const read = readBillTo(formData, kind);
    if ("error" in read) return { success: false, error: read.error };

    const { billTo } = read;
    const text = (name: string, max = 200) => String(formData.get(name) ?? "").trim().slice(0, max) || null;

    if (kind === "recyclables") {
        const short = await checkSaleStock(supabase, sales);
        if (short) return { success: false, error: short };
    }

    // A double click or a retried request is the same invoice, not a second one.
    const { data: recent } = await supabase
        .from("payments")
        .select("id, bill_to")
        .is("customer_id", null)
        .eq("amount", amount)
        .gte("created_at", duplicateSince())
        .limit(5);

    const repeat = (recent ?? []).find((row) => (row.bill_to as { full_name?: string } | null)?.full_name === billTo.full_name);
    if (repeat) return { success: true, invoiceId: repeat.id as string };

    const { data, error } = await supabase
        .from("payments")
        .insert({
            customer_id: null,
            // The unit counts go with their details, so the invoice lists them as it does for a customer.
            bill_to: { ...billTo, facility_details: propertyDetails },
            covered_months: coveredMonths.length > 0 ? coveredMonths : null,
            ...(kind !== "service" ? { invoice_kind: kind } : {}),
            amount,
            arrears,
            units: items.reduce((sum, item) => sum + item.quantity, 0) || 1,
            line_items: items,
            description: text("description", 200) ?? invoiceDescription(kind, invoiceMonth),
            invoice_month: invoiceMonth,
            auto_generated: false,
        })
        .select("id")
        .single();

    if (error || !data) {
        console.error("createNonCustomerInvoice error:", error?.message);
        return { success: false, error: invoiceInsertError(error?.message) };
    }

    if (kind === "recyclables") {
        const failed = await logSaleMovements(supabase, actor.id, data.id as string, billTo.property_name ?? billTo.full_name, sales);

        if (failed) {
            await supabase.from("payments").delete().eq("id", data.id);
            console.error("createNonCustomerInvoice stock error:", failed);
            return { success: false, error: "Could not take the stock out for this sale. Run supabase/recyclables-trading-2026-10.sql in Supabase first." };
        }
    }

    await logActivity(
        supabase,
        actor,
        "invoice_created",
        `Created ${kind === "recyclables" ? "a recyclables sale invoice" : "an invoice"} for ${billTo.full_name} (not registered)`
    );
    if (kind === "recyclables") revalidatePath("/admin/recyclables");
    revalidatePath("/admin/payments");
    revalidatePath("/admin");

    return { success: true, invoiceId: data.id as string };
}

// Someone billed before they had an account has now registered: their
// invoices (with every payment and receipt on them) move onto that customer,
// so they show in the customer's record and in the customer's own dashboard.
// Their details stay on each invoice as a record of who it was first made out to.
export async function moveInvoicesToCustomer(invoiceIds: string[], customerId: string): Promise<TaskChangeResult> {
    const actor = await requireAdmin();
    const supabase = await createClient();

    const ids = [...new Set((invoiceIds ?? []).filter(Boolean))].slice(0, 500);
    if (ids.length === 0 || !customerId) return { success: false, error: "Choose the customer to move these invoices to." };

    const { data: customer } = await supabase.from("profiles").select("id, full_name, role, status").eq("id", customerId).maybeSingle();
    if (!customer || customer.role !== "customer" || customer.status !== "approved") {
        return { success: false, error: "Choose an approved customer." };
    }

    // Only invoices that still belong to nobody, so one already moved is never taken from someone else.
    const { data, error } = await supabase.from("payments").update({ customer_id: customerId }).in("id", ids).is("customer_id", null).select("id");

    if (error) {
        console.error("moveInvoicesToCustomer error:", error.message);
        return { success: false, error: "Could not move the invoices. Please try again." };
    }

    const moved = data?.length ?? 0;
    if (moved === 0) return { success: false, error: "These invoices have already been moved." };

    await logActivity(supabase, actor, "invoices_moved", `Moved ${moved} invoice${moved === 1 ? "" : "s"} to ${customer.full_name ?? "a customer"}`, {
        type: "profile",
        id: customerId,
    });

    revalidatePath("/admin/payments");
    revalidatePath("/admin");
    revalidatePath("/admin/customers");
    revalidatePath(`/admin/customers/${customerId}`);
    revalidatePath("/customer");
    revalidatePath("/customer/payments");

    return { success: true, message: `${moved} invoice${moved === 1 ? "" : "s"} moved to ${customer.full_name ?? "the customer"}.` };
}

export async function createInvoice(_prevState: NewInvoiceState, formData: FormData): Promise<NewInvoiceState> {
    const actor = await requireAdmin();
    const supabase = await createClient();

    const customerId = String(formData.get("customerId") || "");
    if (!customerId) return { success: false, error: "Choose a customer." };

    const built = readBuiltInvoice(formData);
    if ("error" in built) return { success: false, error: built.error };

    const { kind, sales, items, amount, arrears, invoiceMonth, coveredMonths } = built;

    if (kind === "recyclables") {
        const short = await checkSaleStock(supabase, sales);
        if (short) return { success: false, error: short };
    }

    // A double click or a retried request is the same invoice, not a second one.
    const { data: duplicateInvoice } = await supabase
        .from("payments")
        .select("id")
        .eq("customer_id", customerId)
        .eq("amount", amount)
        .gte("created_at", duplicateSince())
        .limit(1);

    if (duplicateInvoice && duplicateInvoice.length > 0) return { success: true, invoiceId: duplicateInvoice[0].id as string };

    const { data, error } = await supabase
        .from("payments")
        .insert({
            customer_id: customerId,
            amount,
            arrears,
            units: items.reduce((sum, item) => sum + item.quantity, 0) || 1,
            line_items: items,
            description: String(formData.get("description") || "").trim().slice(0, 200) || invoiceDescription(kind, invoiceMonth),
            invoice_month: invoiceMonth,
            // The automatic monthly invoice skips these months, so they are never billed twice.
            covered_months: coveredMonths.length > 0 ? coveredMonths : null,
            ...(kind !== "service" ? { invoice_kind: kind } : {}),
            auto_generated: false,
        })
        .select("id")
        .single();

    if (error || !data) {
        console.error("createInvoice insert error:", error?.message);
        return { success: false, error: invoiceInsertError(error?.message) };
    }

    if (kind === "recyclables") {
        const { data: buyer } = await supabase.from("profiles").select("full_name").eq("id", customerId).maybeSingle();
        const failed = await logSaleMovements(supabase, actor.id, data.id as string, buyer?.full_name ?? null, sales);

        if (failed) {
            await supabase.from("payments").delete().eq("id", data.id);
            console.error("createInvoice stock error:", failed);
            return { success: false, error: "Could not take the stock out for this sale. Run supabase/recyclables-trading-2026-10.sql in Supabase first." };
        }
    }

    await logActivity(
        supabase,
        actor,
        "invoice_created",
        kind === "recyclables" ? "Created a recyclables sale invoice" : `Created an invoice${invoiceMonth ? ` for ${invoiceMonth}` : ""}`,
        { type: "profile", id: customerId }
    );
    if (kind === "recyclables") revalidatePath("/admin/recyclables");
    revalidatePath("/admin/payments");
    revalidatePath("/admin");
    revalidatePath(`/admin/customers/${customerId}`);
    revalidatePath("/customer");
    revalidatePath("/customer/payments");

    return { success: true, invoiceId: data.id as string };
}

const PAYMENT_METHODS = ["Bank transfer", "Cash", "POS", "Other"];

export type PaymentResult = { success: boolean; error?: string; message?: string };

// Records money received against an invoice. It can be the whole balance or
// part of it: every payment gets its own receipt, and the invoice becomes paid
// once nothing is left. The database refuses to take more than is owed.
export async function recordPayment(
    paymentId: string,
    amount: number,
    method: string,
    reference: string,
    note: string
): Promise<PaymentResult> {
    const actor = await requireAdmin();
    const supabase = await createClient();

    const value = round2(Number(amount));

    if (!paymentId) return { success: false, error: "Missing invoice." };
    if (!Number.isFinite(value) || value <= 0) return { success: false, error: "Enter an amount greater than zero." };

    const cleanMethod = PAYMENT_METHODS.includes(method) ? method : "Other";
    const cleanReference = reference.trim().slice(0, 120);

    const { data, error } = await supabase.rpc("record_installment", {
        p_payment_id: paymentId,
        p_amount: value,
        p_method: cleanMethod,
        p_reference: cleanReference,
        p_note: note.trim().slice(0, 300),
    });

    if (error) {
        // Before the part payments SQL has been run, only a full payment works.
        if (/could not find the function|schema cache/i.test(error.message)) {
            const { data: invoice } = await supabase.from("payments").select("*").eq("id", paymentId).maybeSingle();

            if (!invoice || invoice.status === "paid") return { success: false, error: "This invoice is already paid." };
            if (value < balanceOf(invoice)) {
                return { success: false, error: "Part payments are not switched on yet. Run supabase/billing-installments-2026-09.sql in Supabase first." };
            }

            const { error: legacyError } = await supabase
                .from("payments")
                .update({ status: "paid", paid_at: new Date().toISOString(), payment_method: cleanMethod, payment_reference: cleanReference || null })
                .eq("id", paymentId)
                .neq("status", "paid");

            if (legacyError) {
                console.error("recordPayment legacy error:", legacyError.message);
                return { success: false, error: "Could not record the payment. Please try again." };
            }
        } else {
            console.error("recordPayment error:", error.message);
            return {
                success: false,
                error: error.code === "P0001" ? error.message : "Could not record the payment. Please try again.",
            };
        }
    }

    const result = (data ?? {}) as { balance?: number; paid?: boolean };
    const settled = result.paid ?? true;

    await logActivity(
        supabase,
        actor,
        settled ? "invoice_paid" : "invoice_part_paid",
        `Recorded a ${naira(value)} payment (${cleanMethod})${settled ? ", invoice paid in full" : `, ${naira(result.balance ?? 0)} still owed`}`,
        { type: "payment", id: paymentId }
    );
    revalidatePath("/admin/payments");
    revalidatePath("/admin");
    revalidatePath("/customer");
    revalidatePath("/customer/payments");

    return {
        success: true,
        message: settled ? "Invoice paid in full. The customer can now see the receipt." : `Payment recorded. ${naira(result.balance ?? 0)} is still owed.`,
    };
}

// Takes back a payment that was entered by mistake. The invoice goes back to
// what it was before that payment.
export async function voidPayment(installmentId: string): Promise<PaymentResult> {
    const actor = await requireAdmin();
    const supabase = await createClient();

    if (!installmentId) return { success: false, error: "Missing payment." };

    const { error } = await supabase.rpc("void_installment", { p_installment_id: installmentId });

    if (error) {
        console.error("voidPayment error:", error.message);
        return { success: false, error: error.code === "P0001" ? error.message : "Could not remove that payment. Please try again." };
    }

    await logActivity(supabase, actor, "payment_voided", "Removed a recorded payment", { type: "installment", id: installmentId });
    revalidatePath("/admin/payments");
    revalidatePath("/admin");
    revalidatePath("/customer");
    revalidatePath("/customer/payments");

    return { success: true, message: "Payment removed." };
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

    const attachment = await saveMessageAttachment(supabase, profile.id, formData);
    if (attachment && "error" in attachment) return { success: false, error: attachment.error };

    const { error } = await supabase.from("messages").insert({
        from_profile_id: profile.id,
        to_profile_id: toProfileId,
        subject,
        body,
        ...(attachment ? { attachment_path: attachment.path, attachment_name: attachment.name } : {}),
    });

    if (error) {
        console.error("sendMessage insert error:", error.message);
        if (attachment) await removeUnreferencedAttachments(supabase, [attachment.path]);
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
        .select("id, full_name, email")
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

    // A copy in their inbox too, not just the in-app message. Best effort: an
    // email problem never undoes the broadcast that has already been sent.
    const emailed = await emailEachRecipient(recipients, subject, body).catch(() => 0);

    await logActivity(
        supabase,
        profile,
        "broadcast_sent",
        `Sent a broadcast announcement (emailed ${emailed} of ${recipients.length})`
    );
    revalidatePath("/admin/messages");
    revalidatePath("/employee/messages");
    revalidatePath("/customer/messages");

    return { success: true };
}

export type EmailResult = { success: boolean; error?: string; message?: string };

// A one-off email to a specific customer, sent from the site's own address
// through Resend, not the in-app messaging. Separate from sendMessage: this
// reaches their inbox even if they never open the app.
export async function emailCustomer(profileId: string, subject: string, body: string): Promise<EmailResult> {
    const actor = await requireAdmin();
    const supabase = await createClient();

    const cleanSubject = subject.trim().slice(0, 200);
    const cleanBody = body.trim().slice(0, 5000);

    if (!profileId || !cleanSubject || !cleanBody) {
        return { success: false, error: "Choose a customer, then add a subject and a message." };
    }

    const { data: target } = await supabase
        .from("profiles")
        .select("id, full_name, email, role")
        .eq("id", profileId)
        .eq("role", "customer")
        .maybeSingle();

    if (!target) return { success: false, error: "Could not find that customer." };
    if (!target.email) return { success: false, error: "This customer has no email address on file." };

    const sent = await sendEmail({
        to: [target.email],
        subject: cleanSubject,
        html: `
            <p>Hi ${escapeHtml(target.full_name?.trim() || "there")},</p>
            <p style="white-space:pre-wrap">${escapeHtml(cleanBody)}</p>
        `,
        replyTo: actor.email || undefined,
    });

    if (!sent) {
        return { success: false, error: "Could not send the email. Check that Resend is configured, and try again." };
    }

    await logActivity(
        supabase,
        actor,
        "customer_emailed",
        `Emailed ${target.full_name ?? target.email} directly: "${cleanSubject}"`,
        { type: "profile", id: profileId }
    );

    return { success: true, message: `Emailed ${target.email}.` };
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

export type UnitPricingResult = { success: boolean; error?: string; message?: string };

// The type and price of one estate unit, and how many identical units this
// row stands for (a block of duplexes can be one row, priced in one go,
// instead of one row each). Once every unit belonging to an estate has a
// type, that estate is billed from its units instead of the counts on its
// own property form, so this also reprices the estate's current open invoice
// straight away.
export async function setUnitPricing(
    unitId: string,
    propertyType: string | null,
    monthlyRate: number | null,
    isVacant: boolean,
    quantity: number = 1
): Promise<UnitPricingResult> {
    const actor = await requireAdmin();
    const supabase = await createClient();

    if (!unitId) return { success: false, error: "Missing unit." };

    if (propertyType && !DOMESTIC_FACILITIES.some((f) => f.key === propertyType)) {
        return { success: false, error: "Choose a valid property type." };
    }

    const rate = monthlyRate === null ? null : round2(Number(monthlyRate));
    if (rate !== null && (!Number.isFinite(rate) || rate <= 0)) {
        return { success: false, error: "Enter a price greater than zero, or leave it blank to use the standard price." };
    }

    const qty = Math.round(Number(quantity));
    if (!Number.isFinite(qty) || qty < 1) {
        return { success: false, error: "Enter a number of units of at least 1." };
    }

    const { data: before } = await supabase.from("units").select("label, estate_profile_id").eq("id", unitId).maybeSingle();
    if (!before) return { success: false, error: "Could not find that unit." };

    const fullUpdate = await supabase
        .from("units")
        .update({ property_type: propertyType, monthly_rate: rate, is_vacant: isVacant, quantity: qty })
        .eq("id", unitId);

    // quantity comes from estate-unit-quantity-2026-09.sql; save everything
    // else even if it has not been run yet, the same as before that column existed.
    const error =
        fullUpdate.error && /quantity/.test(fullUpdate.error.message)
            ? (await supabase.from("units").update({ property_type: propertyType, monthly_rate: rate, is_vacant: isVacant }).eq("id", unitId)).error
            : fullUpdate.error;

    if (error) {
        console.error("setUnitPricing error:", error.message);
        return {
            success: false,
            error: /property_type|monthly_rate|is_vacant/.test(error.message)
                ? "Not switched on yet. Run supabase/estate-unit-pricing-2026-09.sql in Supabase first."
                : "Could not save this unit. Please try again.",
        };
    }

    // The estate's current open invoice follows the change if it is still untouched.
    const billable = await loadBillable(supabase, before.estate_profile_id);
    const repriced = billable ? await recalculateOpenInvoice(supabase, billable) : false;

    const facility = propertyType ? DOMESTIC_FACILITIES.find((f) => f.key === propertyType) : null;
    const describe = isVacant
        ? `Marked the unit "${before.label}" vacant`
        : propertyType
            ? `Set "${before.label}" as ${qty > 1 ? `${qty} × ` : "a "}${facility?.unitLabel ?? propertyType}${
                  rate ? ` at ${naira(rate)}${qty > 1 ? " each" : ""}` : ""
              }`
            : `Cleared the type for "${before.label}"`;

    await logActivity(supabase, actor, "unit_price_changed", describe, { type: "profile", id: before.estate_profile_id });
    revalidatePath("/admin/estates");
    revalidatePath(`/admin/customers/${before.estate_profile_id}`);
    revalidatePath("/admin/payments");
    revalidatePath("/customer");
    revalidatePath("/customer/payments");

    return {
        success: true,
        message: "Saved." + (repriced ? " This month's open invoice was updated." : ""),
    };
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
                        registration_fee_reference: "Existing customer, fee waived",
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

export type PrepaymentResult = { success: boolean; error?: string; message?: string };

// A customer paid upfront for a run of months. The payment gets its own receipt,
// and no invoice is created for the months it covers. An invoice that already
// exists for a covered month is settled by it (unless you say otherwise), so the
// customer is not asked to pay twice.
export async function recordPrepayment(input: {
    profileId: string;
    months: number;
    // The first month covered, as YYYY-MM.
    firstMonth: string;
    amount: number;
    method: string;
    reference: string;
    note: string;
    settleExisting: boolean;
}): Promise<PrepaymentResult> {
    const actor = await requireAdmin();
    const supabase = await createClient();

    const months = Math.trunc(Number(input.months));
    const amount = round2(Number(input.amount));

    if (!input.profileId) return { success: false, error: "Missing customer." };
    if (!Number.isFinite(months) || months < 1 || months > 36) return { success: false, error: "Choose between 1 and 36 months." };
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(input.firstMonth)) return { success: false, error: "Choose the first month it covers." };
    if (!Number.isFinite(amount) || amount <= 0 || amount > 1_000_000_000) return { success: false, error: "Enter the amount received." };

    const { data: customer } = await supabase.from("customers").select("full_name").eq("profile_id", input.profileId).maybeSingle();
    if (!customer) return { success: false, error: "Customer not found." };

    const covered = coveredMonthsFrom(input.firstMonth, months);
    const existing = await loadPrepayments(supabase, input.profileId);
    const clash = covered.filter((month) => existing.some((p) => p.covered_months.includes(month)));

    if (clash.length > 0) {
        return { success: false, error: `Already paid in advance for ${clash.join(", ")}. Choose different months or remove the earlier payment.` };
    }

    const method = PAYMENT_METHODS.includes(input.method) ? input.method : "Other";

    const { data: created, error } = await supabase
        .from("prepayments")
        .insert({
            customer_id: input.profileId,
            months,
            amount,
            covered_months: covered,
            method,
            reference: input.reference.trim().slice(0, 120) || null,
            note: input.note.trim().slice(0, 300) || null,
            recorded_by: actor.id,
        })
        .select("id")
        .single();

    if (error || !created) {
        console.error("recordPrepayment error:", error?.message);
        return {
            success: false,
            error: /prepayments|schema cache/.test(error?.message ?? "")
                ? "Advance payments are not switched on yet. Run supabase/prepaid-2026-09.sql in Supabase first."
                : "Could not record the advance payment. Please try again.",
        };
    }

    const prepaymentId = created.id as string;
    const settled: string[] = [];

    if (input.settleExisting) {
        const { data: open } = await supabase
            .from("payments")
            .select("*")
            .eq("customer_id", input.profileId)
            .in("invoice_month", covered)
            .neq("status", "paid");

        for (const invoice of open ?? []) {
            const fields = {
                status: "paid",
                paid_at: new Date().toISOString(),
                payment_method: "Advance payment",
                payment_reference: `Prepaid ${receiptNumber(prepaymentId)}`,
            };

            // amount_paid and the transfer columns exist once their SQL has run.
            let { error: settleError } = await supabase
                .from("payments")
                .update({ ...fields, amount_paid: invoiceTotal(invoice), transfer_reported_at: null })
                .eq("id", invoice.id);

            if (settleError) ({ error: settleError } = await supabase.from("payments").update(fields).eq("id", invoice.id));

            if (!settleError) settled.push(invoice.id as string);
        }

        if (settled.length > 0) {
            await supabase.from("prepayments").update({ settled_payment_ids: settled }).eq("id", prepaymentId);
        }
    }

    await logActivity(
        supabase,
        actor,
        "prepayment_recorded",
        `Recorded a ${naira(amount)} advance payment from ${customer.full_name ?? "a customer"} covering ${months} month${months === 1 ? "" : "s"}`,
        { type: "profile", id: input.profileId }
    );
    revalidatePath(`/admin/customers/${input.profileId}`);
    revalidatePath("/admin/payments");
    revalidatePath("/admin");
    revalidatePath("/customer");
    revalidatePath("/customer/payments");

    return {
        success: true,
        message:
            `Recorded. ${covered[0]}${months > 1 ? ` to ${covered[months - 1]}` : ""} is covered, so no invoices are made for those months.` +
            (settled.length > 0 ? ` ${settled.length} existing invoice${settled.length === 1 ? " was" : "s were"} settled from it.` : ""),
    };
}

// Takes back an advance payment entered by mistake. Invoices it settled go back
// to what they were before.
export async function voidPrepayment(prepaymentId: string): Promise<PrepaymentResult> {
    const actor = await requireAdmin();
    const supabase = await createClient();

    if (!prepaymentId) return { success: false, error: "Missing payment." };

    const { data: found } = await supabase.from("prepayments").select("*").eq("id", prepaymentId).maybeSingle();

    if (!found) return { success: false, error: "Could not find that payment." };

    const settledIds = ((found.settled_payment_ids ?? []) as string[]).filter(Boolean);

    if (settledIds.length > 0) {
        const paid = groupInstallments(await loadInstallments(supabase, settledIds));

        for (const id of settledIds) {
            const received = round2((paid.get(id) ?? []).reduce((sum, item) => sum + Number(item.amount), 0));
            const base = { status: "pending", paid_at: null, payment_method: null, payment_reference: null };

            let { error: revertError } = await supabase.from("payments").update({ ...base, amount_paid: received }).eq("id", id);
            if (revertError) ({ error: revertError } = await supabase.from("payments").update(base).eq("id", id));
            if (revertError) console.error("voidPrepayment revert error:", revertError.message);
        }
    }

    const { error } = await supabase.from("prepayments").delete().eq("id", prepaymentId);

    if (error) {
        console.error("voidPrepayment error:", error.message);
        return { success: false, error: "Could not remove that payment. Please try again." };
    }

    await logActivity(supabase, actor, "prepayment_removed", "Removed an advance payment", { type: "profile", id: found.customer_id as string });
    revalidatePath(`/admin/customers/${found.customer_id}`);
    revalidatePath("/admin/payments");
    revalidatePath("/admin");
    revalidatePath("/customer");
    revalidatePath("/customer/payments");

    return { success: true, message: "Advance payment removed." };
}

export type GenerateResult = { success: boolean; message: string };

export type MonthlyRateResult = { success: boolean; error?: string; message?: string };

// The amount used for this customer's monthly invoices. Empty goes back to
// working it out from their property details.
export async function setMonthlyRate(profileId: string, amount: number | null): Promise<MonthlyRateResult> {
    const actor = await requireAdmin();
    const supabase = await createClient();

    if (!profileId) return { success: false, error: "Missing customer." };

    const value = amount === null ? null : round2(Number(amount));

    if (value !== null && (!Number.isFinite(value) || value <= 0 || value > 100_000_000)) {
        return { success: false, error: "Enter an amount greater than zero." };
    }

    const { data: before } = await supabase.from("customers").select("full_name").eq("profile_id", profileId).maybeSingle();
    if (!before) return { success: false, error: "Customer not found." };

    const { error } = await supabase.from("customers").update({ monthly_rate: value }).eq("profile_id", profileId);

    if (error) {
        console.error("setMonthlyRate error:", error.message);
        return {
            success: false,
            error: /monthly_rate/.test(error.message)
                ? "Not switched on yet. Run supabase/billing-installments-2026-09.sql in Supabase first."
                : "Could not save the monthly charge. Please try again.",
        };
    }

    // This month's invoice follows the new charge if it is still untouched.
    const billable = await loadBillable(supabase, profileId);
    const repriced = billable ? await recalculateOpenInvoice(supabase, billable) : false;

    await logActivity(
        supabase,
        actor,
        "monthly_rate_changed",
        value === null
            ? `Set ${before.full_name ?? "a customer"} back to the calculated monthly charge`
            : `Set the monthly charge for ${before.full_name ?? "a customer"} to ${naira(value)}`,
        { type: "profile", id: profileId }
    );
    revalidatePath(`/admin/customers/${profileId}`);
    revalidatePath("/admin/estates");
    revalidatePath("/admin/payments");
    revalidatePath("/customer");
    revalidatePath("/customer/payments");

    return {
        success: true,
        message:
            (value === null ? "Back to the calculated monthly charge." : `Monthly charge set to ${naira(value)}.`) +
            (repriced ? " This month's open invoice was updated." : ""),
    };
}

export type DiscountResult = { success: boolean; error?: string; message?: string };

// A discount for one customer: a percentage or a fixed amount off their
// monthly charge, shown as its own line on the invoice. type = null removes it.
export async function setCustomerDiscount(
    profileId: string,
    type: "percent" | "amount" | null,
    value: number | null,
    reason: string
): Promise<DiscountResult> {
    const actor = await requireAdmin();
    const supabase = await createClient();

    if (!profileId) return { success: false, error: "Missing customer." };

    const { data: before } = await supabase.from("customers").select("full_name").eq("profile_id", profileId).maybeSingle();
    if (!before) return { success: false, error: "Customer not found." };

    let update: { discount_type: "percent" | "amount" | null; discount_value: number | null; discount_reason: string | null; discount_set_by: string | null; discount_set_at: string | null };

    if (type === null) {
        update = { discount_type: null, discount_value: null, discount_reason: null, discount_set_by: null, discount_set_at: null };
    } else {
        const amount = round2(Number(value));

        if (!Number.isFinite(amount) || amount <= 0) {
            return { success: false, error: "Enter a discount greater than zero." };
        }
        if (type === "percent" && amount > 100) {
            return { success: false, error: "A percentage discount can't be over 100." };
        }
        if (type === "amount" && amount > 100_000_000) {
            return { success: false, error: "That amount looks too large. Please check it." };
        }

        update = {
            discount_type: type,
            discount_value: amount,
            discount_reason: reason.trim().slice(0, 200) || null,
            discount_set_by: actor.id,
            discount_set_at: new Date().toISOString(),
        };
    }

    const { error } = await supabase.from("customers").update(update).eq("profile_id", profileId);

    if (error) {
        console.error("setCustomerDiscount error:", error.message);
        return {
            success: false,
            error: /discount_/.test(error.message)
                ? "Not switched on yet. Run supabase/customer-discount-2026-09.sql in Supabase first."
                : "Could not save the discount. Please try again.",
        };
    }

    // This month's invoice follows the new discount if it is still untouched.
    const billable = await loadBillable(supabase, profileId);
    const repriced = billable ? await recalculateOpenInvoice(supabase, billable) : false;
    // Shown as a percentage either way, so it reads the same as the invoice line does.
    const estateUnits = billable?.is_estate ? await loadEstateUnits(supabase, profileId) : undefined;
    const percent = billable ? discountInfo(billable, estateUnits)?.percent : null;

    const describe =
        type === null
            ? `Removed the discount for ${before.full_name ?? "a customer"}`
            : `Set a ${percent ?? update.discount_value}% discount for ${before.full_name ?? "a customer"}${
                  type === "amount" ? ` (${naira(update.discount_value ?? 0)})` : ""
              }`;

    await logActivity(supabase, actor, "customer_discount_changed", describe, { type: "profile", id: profileId });
    revalidatePath(`/admin/customers/${profileId}`);
    revalidatePath("/admin/customers");
    revalidatePath("/admin/payments");
    revalidatePath("/customer");
    revalidatePath("/customer/payments");

    return {
        success: true,
        message:
            (type === null ? "Discount removed." : `Discount set: ${percent ?? update.discount_value}% off.`) +
            (repriced ? " This month's open invoice was updated." : ""),
    };
}

export async function generateAllSchedules(): Promise<GenerateResult> {
    const actor = await requireAdmin();
    const supabase = await createClient();

    const { customers, created, unrecognised } = await runScheduleGeneration(supabase);

    await logActivity(supabase, actor, "schedules_generated", `Generated schedules: ${created} pickups added`);
    revalidatePath("/admin/tasks");
    revalidatePath("/admin");

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

    await logActivity(supabase, actor, "invoices_generated", `Generated ${billingMonthLabel()} invoices: ${tally.created} created`);
    revalidatePath("/admin/payments");
    revalidatePath("/customer/payments");

    return {
        success: true,
        message:
            `${tally.created} invoices created for ${billingMonthLabel()}, ${tally.exists} already existed` +
            (tally["no-pricing"] > 0 ? `, ${tally["no-pricing"]} skipped (no priced property types, add manually)` : "") +
            (tally.prepaid > 0 ? `, ${tally.prepaid} skipped (paid in advance)` : "") +
            (tally.error > 0 ? `, ${tally.error} failed` : "") +
            ".",
    };
}

export type SchedulePreview = {
    success: boolean;
    error?: string;
    name?: string;
    // What the property details say, and how the app read it.
    source?: string;
    label?: string;
    recognised?: boolean;
    // The pickups that would be created (YYYY-MM-DD), and how many already exist.
    dates?: string[];
    alreadyScheduled?: number;
    // "the rest of September", "October 2026" or "the next 4 weeks".
    windowLabel?: string;
    // The weekdays the detected frequency comes to (Monday = 1), to fill the day picker.
    suggestedDays?: number[];
    // True when the customer already has days saved by an admin.
    savedDays?: boolean;
};

export type ScheduleRequest = {
    frequencyText?: string | null;
    days?: number[] | null;
    period?: "thisMonth" | "nextMonth" | null;
    // Keep the chosen days for this customer, so later schedules use them too.
    remember?: boolean;
};

// Shows what "Generate schedule" would create for a customer, without creating
// anything. Read from the frequency in their property details, or from a
// frequency the admin picks instead.
export async function previewCustomerSchedule(profileId: string, request: ScheduleRequest = {}): Promise<SchedulePreview> {
    const profile = await getUserProfile();

    if (profile.role !== "admin" || profile.status !== "approved") {
        return { success: false, error: "Not authorized" };
    }

    const supabase = await createClient();
    const billable = await loadBillable(supabase, profileId);

    if (!billable) return { success: false, error: "Customer not found." };

    const plan = await planSchedule(supabase, billable, request);
    // What the customer's own record comes to, ignoring anything picked in this request.
    const own = await planSchedule(supabase, billable, { period: null });

    return {
        success: true,
        name: billable.full_name ?? undefined,
        source: plan.source,
        label: plan.label,
        recognised: plan.recognised,
        dates: plan.fresh,
        alreadyScheduled: plan.alreadyScheduled,
        windowLabel: plan.windowLabel,
        suggestedDays: frequencyToDays(own.frequency),
        savedDays: (billable.pickup_days ?? []).length > 0,
    };
}

export async function generateCustomerBilling(
    profileId: string,
    what: "schedule" | "invoice",
    request: ScheduleRequest = {}
): Promise<GenerateResult> {
    const actor = await requireAdmin();
    const supabase = await createClient();

    const billable = await loadBillable(supabase, profileId);
    if (!billable) return { success: false, message: "Customer not found." };

    revalidatePath("/admin/tasks");
    revalidatePath("/admin");
    revalidatePath("/admin/payments");
    revalidatePath(`/admin/customers/${profileId}`);

    if (what === "schedule") {
        const result = await generateScheduleFor(supabase, billable, request);

        // Remember the days chosen for this customer, so the daily top-up and any
        // later schedule use the same pattern instead of guessing again.
        let remembered = "";
        const chosen = [...new Set((request.days ?? []).filter((d) => d >= 1 && d <= 6))].sort();

        if (request.remember && chosen.length > 0) {
            const { error: saveError } = await supabase.from("customers").update({ pickup_days: chosen }).eq("profile_id", profileId);
            remembered = saveError
                ? " The days could not be saved for next time. Run supabase/schedule-days-2026-09.sql in Supabase."
                : " These days are saved for this customer.";
        }

        if (result.created > 0) {
            await logActivity(supabase, actor, "schedule_generated", `Generated ${result.created} pickups for ${billable.full_name ?? "a customer"} (${result.frequency})`, { type: "profile", id: profileId });
            revalidatePath("/admin/tasks");
            revalidatePath("/admin");
        }

        return {
            success: true,
            message: (result.created > 0 ? `Added ${result.created} pickups (${result.frequency}).` : "Their schedule is already up to date.") + remembered,
        };
    }

    const outcome = await generateInvoiceFor(supabase, billable);
    const messages: Record<string, string> = {
        created: `Invoice created for ${billingMonthLabel()}.`,
        exists: `An invoice for ${billingMonthLabel()} already exists.`,
        prepaid: `${billingMonthLabel()} was paid in advance, so no invoice is needed.`,
        "no-pricing": "No priced property types are recorded for this customer. Add an invoice manually.",
        error: "Could not create the invoice.",
    };

    return { success: outcome === "created" || outcome === "exists" || outcome === "prepaid", message: messages[outcome] };
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

    const text = (name: string, max = 200) => String(formData.get(name) ?? "").trim().slice(0, max) || null;

    const fullName = text("fullName", 120);
    if (!fullName) return { success: false, error: "Enter the customer's name." };

    const propertyType = text("propertyType", 20);

    // The property name needs supabase/property-name-2026-10.sql; everything
    // else saves without it.
    const propertyName = { property_name: text("propertyName", 120) };

    const changes = {
        full_name: fullName,
        phone: text("phone", 40),
        whatsapp_number: text("whatsapp", 40),
        address: text("address", 300),
        landmark: text("landmark", 160),
        lga: text("lga", 80),
        state: text("state", 80),
        ...(propertyType === "residential" || propertyType === "commercial" ? { property_type: propertyType } : {}),
        account_code: String(formData.get("accountCode") || "").trim() || null,
        property_code: String(formData.get("propertyCode") || "").trim() || null,
        property_class: String(formData.get("propertyClass") || "").trim() || null,
        preferred_pickup_frequency: String(formData.get("pickupFrequency") || "").trim() || null,
        // Status is left alone: suspending and reactivating only happen through
        // setCustomerSuspended, so saving details can never undo either.
        facility_details,
    };

    let { error } = await supabase.from("customers").update({ ...changes, ...propertyName }).eq("profile_id", profileId);
    let note = "";

    if (error && /property_name/.test(error.message)) {
        ({ error } = await supabase.from("customers").update(changes).eq("profile_id", profileId));
        note = propertyName.property_name ? " The property name wasn't saved: run supabase/property-name-2026-10.sql in Supabase first." : "";
    }

    if (error) {
        console.error("updateCustomerDetails error:", error.message);
        return { success: false, error: "Could not save these details." };
    }

    // Their login shows the same name everywhere else in the app.
    await supabase.from("profiles").update({ full_name: fullName }).eq("id", profileId);

    await logActivity(supabase, actor, "customer_edited", "Edited a customer record", { type: "profile", id: profileId });
    revalidatePath(`/admin/customers/${profileId}`);
    revalidatePath("/admin/customers");
    revalidatePath("/customer");

    revalidatePath("/admin/payments");

    return { success: true, message: `Customer details saved.${note}` };
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

    const billable = await loadBillable(supabase, profileId);
    if (!billable) return { success: false, error: "Customer not found." };

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
    if (items.some((item) => item.quantity < 0)) {
        return { success: false, error: "Quantities can't be negative." };
    }
    // A discount line has a negative unit price on purpose, but the lines together
    // can't add up to less than zero.
    if (itemsTotal(items) < 0) {
        return { success: false, error: "These line items add up to less than zero. Make the discount smaller." };
    }

    const arrears = Number(formData.get("arrears") || 0);
    const cleanArrears = Number.isFinite(arrears) && arrears > 0 ? round2(arrears) : 0;
    const newTotal = round2(itemsTotal(items) + cleanArrears);

    // A month is only billed from the 25th, so an invoice can't be moved into it early either.
    const early = tooEarlyToBill(String(formData.get("invoiceMonth") || ""));
    if (early) return { success: false, error: early };

    // Money may already have been received on this invoice, with receipts
    // issued for it, so the total can never drop below what was paid.
    const { data: current } = await supabase.from("payments").select("*").eq("id", paymentId).maybeSingle();
    const alreadyPaid = current ? amountPaid(current) : 0;

    if (current?.status !== "paid" && newTotal < alreadyPaid) {
        return { success: false, error: `${naira(alreadyPaid)} has already been paid on this invoice, so the total can't be lower than that.` };
    }

    const { data, error } = await supabase
        .from("payments")
        .update({
            amount: itemsTotal(items),
            arrears: cleanArrears,
            // The new total exactly matches what was paid, so nothing is owed.
            ...(alreadyPaid > 0 && newTotal === alreadyPaid ? { status: "paid", paid_at: new Date().toISOString() } : {}),
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

    // Arrears put on an invoice by hand are owed there now, so anything still
    // waiting in the customer's Billing section is cleared rather than charged
    // again on their next invoice.
    if (current?.customer_id && cleanArrears > 0) {
        await supabase.from("customers").update({ arrears: 0 }).eq("profile_id", current.customer_id);
    }

    await logActivity(supabase, actor, "invoice_edited", "Edited an invoice");
    revalidatePath("/admin/payments");
    revalidatePath("/admin/customers");
    if (current?.customer_id) {
        revalidatePath(`/admin/customers/${current.customer_id}`);
        revalidatePath(`/admin/invoices/preview/${current.customer_id}`);
    }
    revalidatePath("/customer/payments");
    revalidatePath("/customer");

    return { success: true };
}

export type ArrearsResult = { success: boolean; error?: string; message?: string };

// Money a customer owed from before, charged once. It goes onto this month's
// invoice right away if that is still untouched and unpaid, otherwise it waits
// in customers.arrears for their next invoice. Either way, once it is on an
// invoice the waiting figure goes back to zero so it is never charged twice.
export async function setCustomerArrears(profileId: string, arrears: number): Promise<ArrearsResult> {
    const actor = await requireAdmin();
    const supabase = await createClient();

    if (!profileId) return { success: false, error: "Invalid request." };

    const clean = round2(Number(arrears));
    if (!Number.isFinite(clean) || clean < 0) return { success: false, error: "Enter an amount of zero or more." };

    const { data: customer } = await supabase.from("customers").select("full_name").eq("profile_id", profileId).maybeSingle();
    if (!customer) return { success: false, error: "Could not find that customer." };

    const { error } = await supabase.from("customers").update({ arrears: clean }).eq("profile_id", profileId);

    if (error) {
        console.error("setCustomerArrears error:", error.message);
        return {
            success: false,
            error: /arrears/.test(error.message)
                ? "Not switched on yet. Run supabase/customer-arrears-2026-09.sql in Supabase first."
                : "Could not save the arrears. Please try again.",
        };
    }

    const syncedToInvoice = clean > 0 && (await syncArrearsToOpenInvoice(supabase, profileId, clean));

    if (syncedToInvoice) await clearPendingArrears(supabase, profileId, clean);

    await logActivity(supabase, actor, "customer_arrears_changed", `Set arrears of ${naira(clean)} for ${customer.full_name ?? "a customer"}`, {
        type: "profile",
        id: profileId,
    });

    revalidatePath(`/admin/customers/${profileId}`);
    revalidatePath("/admin/customers");
    revalidatePath("/admin/payments");
    revalidatePath(`/admin/invoices/preview/${profileId}`);
    revalidatePath("/customer/payments");
    revalidatePath("/customer");

    return {
        success: true,
        message:
            clean === 0
                ? "Cleared. Nothing will be added to their next invoice."
                : syncedToInvoice
                    ? "Added to this month's open invoice."
                    : "Saved. It will be added to their next invoice, once.",
    };
}

// The current invoice (last month's until the 25th), if it is still untouched
// and unpaid, takes the arrears right away instead of waiting for the next one.
async function syncArrearsToOpenInvoice(supabase: Awaited<ReturnType<typeof createClient>>, profileId: string, amount: number) {
    const { data: open } = await supabase
        .from("payments")
        .select("id, amount, arrears, amount_paid, status")
        .eq("customer_id", profileId)
        .eq("invoice_month", billingMonthLabel())
        .eq("auto_generated", true)
        .neq("status", "paid");

    const untouched = (open ?? []).find((row) => amountPaid(row) === 0);
    if (!untouched) return false;

    const already = Number(untouched.arrears ?? 0);

    // Already on it: nothing to add, and it must not wait for the next invoice too.
    if (already === amount) return true;

    // Different arrears are already owed on it; those are not overwritten, so
    // the new amount waits for the next invoice instead.
    if (already > 0) return false;

    const { error } = await supabase.from("payments").update({ arrears: amount }).eq("id", untouched.id);
    return !error;
}

// ---------------------------------------------------------------------------
// Schedule management
// ---------------------------------------------------------------------------

export type TaskChangeResult = { success: boolean; error?: string; message?: string };

// Once a pickup has someone on it, it is locked: the date, area and people
// cannot be changed by accident. An admin can unlock it on purpose, and a
// pickup that has started or been serviced can never be changed.
export async function updateTask(
    taskId: string,
    employeeId: string | null,
    scheduledDate: string | null,
    zone: string,
    crewIds: string[] = [],
    unlock = false
): Promise<TaskChangeResult> {
    const actor = await requireAdmin();
    const supabase = await createClient();

    if (!taskId) return { success: false, error: "Missing task." };

    const { data: task } = await supabase.from("tasks").select("*").eq("id", taskId).maybeSingle();

    if (!task) return { success: false, error: "Could not find that task." };

    if (task.status !== "pending") {
        return { success: false, error: "This pickup has already started or been serviced, so it can't be changed." };
    }

    if (task.employee_id && !unlock) {
        return { success: false, error: "This pickup is assigned and locked. Unlock it first if you need to change it." };
    }

    const lead = employeeId || null;
    const date = scheduledDate || null;
    // A pickup an admin reopened is not marked serviced again just because its date has passed.
    const past = isPastDate(date) && !(task as { reopened_at?: string | null }).reopened_at;

    const { error } = await supabase
        .from("tasks")
        .update({
            employee_id: lead,
            scheduled_date: date,
            zone: zone.trim() || null,
            ...(past && date ? servicedTimes(date) : {}),
        })
        .eq("id", taskId);

    if (error) {
        console.error("updateTask error:", error.message);
        return { success: false, error: "Could not save this pickup. Please try again." };
    }

    const crewError = await setCrew(supabase, taskId, lead ? crewFrom(crewIds, lead) : []);
    if (crewError) return { success: false, error: crewError };

    await logActivity(
        supabase,
        actor,
        task.employee_id ? "task_reassigned" : "task_assigned",
        task.employee_id ? "Changed an assigned pickup" : lead ? "Assigned a pickup" : "Edited a pickup task",
        { type: "task", id: taskId }
    );
    revalidatePath("/admin/tasks");
    revalidatePath("/admin");
    revalidatePath("/employee");
    revalidatePath("/employee/tasks");
    revalidatePath("/customer");
    revalidatePath("/customer/schedule");

    return {
        success: true,
        message: past ? "Saved. The date has passed, so it is marked serviced." : lead ? "Assigned. The pickup is now locked." : "Pickup updated",
    };
}

// An admin marks a pickup serviced, for example when the employee did the job
// but did not tap End. A pickup dated in the future is not due yet, so it needs
// an explicit yes (the screen asks; this checks again).
export async function markTaskServiced(taskId: string, confirmEarly = false): Promise<TaskChangeResult> {
    const actor = await requireAdmin();
    const supabase = await createClient();

    if (!taskId) return { success: false, error: "Missing task." };

    const { data: task } = await supabase.from("tasks").select("*").eq("id", taskId).maybeSingle();

    if (!task) return { success: false, error: "Could not find that task." };
    if (task.status === "completed") return { success: false, error: "This pickup is already marked serviced." };
    if (task.status === "declined") return { success: false, error: "This pickup was declined, so it can't be marked serviced." };

    const date = (task.scheduled_date as string | null) ?? null;

    if (date && date > todayLagos() && !confirmEarly) {
        return { success: false, error: `This pickup is scheduled for ${date}, which has not come yet. Confirm to mark it serviced early.` };
    }

    // A pickup from an earlier day is recorded on its own day; anything else is recorded now.
    const past = isPastDate(date);
    const now = new Date().toISOString();

    const { data, error } = await supabase
        .from("tasks")
        .update({
            status: "completed",
            started_at: (task.started_at as string | null) ?? (past && date ? `${date}T08:00:00+01:00` : now),
            completed_at: past && date ? `${date}T17:00:00+01:00` : now,
        })
        .eq("id", taskId)
        .in("status", ["pending", "in progress"])
        .select("id");

    if (error) {
        console.error("markTaskServiced error:", error.message);
        return { success: false, error: "Could not mark it serviced. Please try again." };
    }

    if (!data || data.length === 0) return { success: false, error: "This pickup can't be marked serviced." };

    await logActivity(supabase, actor, "task_serviced", "Marked a pickup as serviced", { type: "task", id: taskId });
    revalidatePath("/admin/tasks");
    revalidatePath("/admin");
    revalidatePath("/employee");
    revalidatePath("/employee/tasks");
    revalidatePath("/customer");
    revalidatePath("/customer/tasks");
    revalidatePath("/customer/schedule");

    return { success: true, message: "Marked serviced. The customer has been told." };
}

// Puts a pickup that was marked serviced back to not done. It is flagged as
// reopened so the automatic "date has passed, so serviced" rule leaves it alone.
export async function reopenTask(taskId: string): Promise<TaskChangeResult> {
    const actor = await requireAdmin();
    const supabase = await createClient();

    if (!taskId) return { success: false, error: "Missing task." };

    const { data, error } = await supabase
        .from("tasks")
        .update({
            status: "pending",
            started_at: null,
            completed_at: null,
            reopened_at: new Date().toISOString(),
            reopened_by: actor.id,
        })
        .eq("id", taskId)
        .eq("status", "completed")
        .select("id");

    if (error) {
        console.error("reopenTask error:", error.message);
        return {
            success: false,
            error: /reopened_at|reopened_by/.test(error.message)
                ? "Not switched on yet. Run supabase/schedule-days-2026-09.sql in Supabase first."
                : "Could not revert this pickup. Please try again.",
        };
    }

    if (!data || data.length === 0) {
        return { success: false, error: "Only a pickup marked serviced can be reverted." };
    }

    await logActivity(supabase, actor, "task_reopened", "Reverted a serviced pickup to not done", { type: "task", id: taskId });
    revalidatePath("/admin/tasks");
    revalidatePath("/admin");
    revalidatePath("/employee");
    revalidatePath("/employee/tasks");
    revalidatePath("/customer");
    revalidatePath("/customer/schedule");

    return { success: true, message: "Back to not done. The crew and the customer have been told." };
}

// Pushes a pickup that has not started to the next day. An explicit, confirmed
// action, so it works on an assigned (locked) pickup without unlocking it.
export async function adminMoveTaskToNextDay(taskId: string): Promise<TaskChangeResult> {
    const actor = await requireAdmin();
    const supabase = await createClient();

    const result = await moveTaskToNextDay(supabase, taskId);

    if (result.success) {
        await logActivity(supabase, actor, "task_moved", "Moved a pickup to the next day", { type: "task", id: taskId });
        revalidatePath("/admin/tasks");
        revalidatePath("/admin");
        revalidatePath("/employee");
        revalidatePath("/employee/tasks");
        revalidatePath("/customer");
        revalidatePath("/customer/schedule");
    }

    return result;
}

export async function deleteTask(taskId: string, unlock = false): Promise<TaskChangeResult> {
    const actor = await requireAdmin();
    const supabase = await createClient();

    if (!taskId) return { success: false, error: "Missing task." };

    const { data: task } = await supabase.from("tasks").select("employee_id").eq("id", taskId).maybeSingle();

    if (task?.employee_id && !unlock) {
        return { success: false, error: "This pickup is assigned and locked. Unlock it first if you need to remove it." };
    }

    const { data, error } = await supabase.from("tasks").delete().eq("id", taskId).eq("status", "pending").select("id");

    if (error) {
        console.error("deleteTask error:", error.message);
        return { success: false, error: "Could not remove this pickup. Please try again." };
    }

    if (!data || data.length === 0) {
        return { success: false, error: "Only a pickup that has not started can be removed." };
    }

    await logActivity(supabase, actor, "task_deleted", "Deleted a pickup task", { type: "task", id: taskId });
    revalidatePath("/admin/tasks");
    revalidatePath("/admin");
    revalidatePath("/employee/tasks");
    revalidatePath("/customer/schedule");

    return { success: true, message: "Pickup removed" };
}

// ---------------------------------------------------------------------------
// Staff expenses
// ---------------------------------------------------------------------------

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

// Recyclable waste in (collected) or out (sold or dispatched), by weight.
export async function logRecyclable(formData: FormData): Promise<{ success: boolean; error?: string }> {
    const admin = await requireAdmin();
    const supabase = await createClient();

    const direction = String(formData.get("direction") ?? "");
    const material = String(formData.get("material") ?? "");
    const kg = Math.round(Number(String(formData.get("kg") ?? "").replace(/,/g, "")) * 100) / 100;
    const date = String(formData.get("date") ?? "");
    const clean = (name: string, max: number) => String(formData.get(name) ?? "").trim().slice(0, max) || null;

    if (direction !== "in" && direction !== "out") return { success: false, error: "Choose whether it came in or went out." };
    if (!["plastic", "metal", "paper", "glass", "electronics", "other"].includes(material)) return { success: false, error: "Choose the material." };
    if (!Number.isFinite(kg) || kg <= 0 || kg > 1_000_000) return { success: false, error: "Enter the weight in kilograms." };
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date > todayLagos()) return { success: false, error: "Choose a date that is not in the future." };

    // What was paid when buying; money from selling comes in through the sale invoice.
    const paidInput = String(formData.get("paid") ?? "").replace(/,/g, "").trim();
    const paid = direction === "in" && paidInput !== "" ? round2(Number(paidInput)) : null;
    if (paid !== null && (!Number.isFinite(paid) || paid < 0 || paid > 500_000_000)) return { success: false, error: "Enter what was paid in naira, or leave it empty." };

    const materialNote = clean("materialNote", 80);
    if (material === "other" && !materialNote) return { success: false, error: "Say what the other material is." };

    // Can't send out more than is in stock for that material.
    if (direction === "out") {
        const { data: rows } = await supabase.from("recyclable_movements").select("direction, kg").eq("material", material).limit(20000);
        const stock = (rows ?? []).reduce((sum, r) => sum + (r.direction === "in" ? Number(r.kg) : -Number(r.kg)), 0);

        if (kg > stock + 0.001) {
            return { success: false, error: `Only ${Math.max(0, Math.round(stock * 100) / 100)} kg of that material is in stock.` };
        }
    }

    const { error } = await supabase.from("recyclable_movements").insert({
        direction,
        material,
        material_note: material === "other" ? materialNote : null,
        kg,
        movement_date: date,
        party: clean("party", 120),
        note: clean("note", 300),
        recorded_by: admin.id,
        ...(paid !== null ? { amount: paid } : {}),
    });

    if (error) {
        console.error("logRecyclable error:", error.message);
        return {
            success: false,
            error: /amount/.test(error.message)
                ? "Not switched on yet. Run supabase/recyclables-trading-2026-10.sql in Supabase first."
                : /relation|does not exist|schema cache/i.test(error.message)
                    ? "Not switched on yet. Run supabase/admin-expenses-recyclables-2026-10.sql in Supabase first."
                    : "Could not save this. Please try again.",
        };
    }

    await logActivity(
        supabase,
        admin,
        "recyclable_logged",
        `Logged ${kg} kg of ${material} ${direction === "in" ? "in" : "out"}${paid !== null ? ` (paid ${naira(paid)})` : ""}`
    );
    revalidatePath("/admin/finance");
    revalidatePath("/admin/recyclables");
    revalidatePath("/admin");

    return { success: true };
}

export async function deleteRecyclable(id: string): Promise<{ success: boolean; error?: string }> {
    const admin = await requireAdmin();
    const supabase = await createClient();

    if (!id) return { success: false, error: "Missing entry." };

    const { data: existing } = await supabase.from("recyclable_movements").select("id, payment_id").eq("id", id).maybeSingle();
    if (existing?.payment_id) {
        return { success: false, error: "This came from a sale invoice. Remove or change the invoice instead, and the stock follows." };
    }

    const { data, error } = await supabase.from("recyclable_movements").delete().eq("id", id).select("id");

    if (error || !data || data.length === 0) return { success: false, error: "Could not remove that entry." };

    await logActivity(supabase, admin, "recyclable_removed", "Removed a recyclables entry");
    revalidatePath("/admin/recyclables");
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
