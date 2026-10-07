"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/utils/supabase/server";
import { logActivity } from "@/lib/activity";
import { billingMonthLabel, itemsTotal, normalizeLineItems, tooEarlyToBill, type LineItem } from "@/lib/billing/pricing";
import { amountPaid, round2 } from "@/lib/billing/balance";
import { naira } from "@/lib/customer/billing";
import { clearPendingArrears } from "@/lib/billing/generate";
import { requireAdmin, duplicateSince } from "./shared";
import { readBuiltInvoice, invoiceDescription, invoiceInsertError, checkSaleStock, logSaleMovements, readBillTo } from "@/lib/admin/invoice-input";
import type { CustomerActionState } from "./customers";
import type { TaskChangeResult } from "./tasks";
import { PAYMENT_RECEIPT_BUCKET } from "@/lib/bank-details";

export type InvoiceActionState = { success: boolean; error?: string } | null;

export type NewInvoiceState = { success: boolean; error?: string; invoiceId?: string } | null;

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

// Deletes an invoice that was made by mistake, such as one entered twice. Only
// an invoice with nothing paid against it can go, and one that carries arrears
// for a registered customer is refused, because deleting it would drop that
// debt. A paid or part-paid invoice stays: only the owner can delete those,
// from the tick boxes on the Payments page. The database checks the same rules.
export async function deleteUnpaidInvoice(paymentId: string): Promise<{ success: boolean; error?: string }> {
    const actor = await requireAdmin();
    const supabase = await createClient();

    if (!paymentId) return { success: false, error: "Missing invoice." };

    const { data: invoice } = await supabase
        .from("payments")
        .select("id, status, amount_paid, arrears, customer_id, transfer_receipt_path, invoice_month")
        .eq("id", paymentId)
        .maybeSingle();

    if (!invoice) return { success: false, error: "Could not find that invoice. It may already be deleted." };
    if (invoice.status === "paid" || Number(invoice.amount_paid ?? 0) > 0) {
        return { success: false, error: "This invoice has payments recorded, so it can't be deleted here. Void the payments first, or ask the owner." };
    }
    if (invoice.customer_id && Number(invoice.arrears ?? 0) > 0) {
        return { success: false, error: "This invoice carries arrears from before, and deleting it would lose them. Edit it instead." };
    }

    const { error } = await supabase.rpc("delete_unpaid_invoice", { p_payment_id: paymentId });

    if (error) {
        console.error("deleteUnpaidInvoice error:", error.message);
        return {
            success: false,
            error: /function .*delete_unpaid_invoice|schema cache/i.test(error.message)
                ? "Not switched on yet. Run supabase/delete-unpaid-invoice-2026-10.sql in Supabase first."
                : /payments recorded/.test(error.message)
                    ? "This invoice has payments recorded, so it can't be deleted here."
                    : "Could not delete this invoice. Please try again.",
        };
    }

    if (invoice.transfer_receipt_path) await supabase.storage.from(PAYMENT_RECEIPT_BUCKET).remove([invoice.transfer_receipt_path]);

    await logActivity(supabase, actor, "invoice_deleted", `Deleted an unpaid invoice made by mistake${invoice.invoice_month ? ` (${invoice.invoice_month})` : ""}`, {
        type: "payment",
        id: paymentId,
    });
    revalidatePath("/admin/payments");
    revalidatePath("/admin/customers");
    revalidatePath("/admin/recyclables");
    revalidatePath("/customer/payments");
    revalidatePath("/customer");
    revalidatePath("/admin");

    return { success: true };
}
