"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/utils/supabase/server";
import { logActivity } from "@/lib/activity";
import { balanceOf, groupInstallments, invoiceTotal, loadInstallments, round2 } from "@/lib/billing/balance";
import { coveredMonthsFrom, loadPrepayments, loadUnregisteredPrepayments, type PrepaymentPerson } from "@/lib/billing/prepaid";
import { naira, receiptNumber } from "@/lib/customer/billing";
import { requireAdmin } from "./shared";
import { chargeItems, loadBillable, loadEstateUnits } from "@/lib/billing/generate";
import { advanceInvoiceItems, itemsTotal, monthRangeLabel, monthsFrom, tooEarlyToBill } from "@/lib/billing/pricing";
import { invoiceInsertError } from "@/lib/admin/invoice-input";
import { billToOf, personKey } from "@/lib/billing/billTo";

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

export type PrepaymentResult = { success: boolean; error?: string; message?: string };

// A customer paid upfront for a run of months. The payment gets its own receipt,
// and no invoice is created for the months it covers. An invoice that already
// exists for a covered month is settled by it (unless you say otherwise), so the
// customer is not asked to pay twice.
export async function recordPrepayment(input: {
    // A registered customer's profile, or leave it out and give "person" for someone who is not registered.
    profileId?: string;
    person?: PrepaymentPerson;
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

    const cleanText = (value: string | null | undefined, max: number) => String(value ?? "").trim().slice(0, max) || null;
    const person = input.person
        ? {
              full_name: cleanText(input.person.full_name, 120) ?? "",
              property_name: cleanText(input.person.property_name, 120),
              phone: cleanText(input.person.phone, 40),
              whatsapp_number: cleanText(input.person.whatsapp_number, 40),
              email: cleanText(input.person.email, 120),
              address: cleanText(input.person.address, 200),
              landmark: null,
              lga: null,
              state: null,
              property_type: null,
              facility_details: null,
          }
        : null;

    if (!input.profileId && !person) return { success: false, error: "Choose who paid." };
    if (!input.profileId && !person?.full_name) return { success: false, error: "Enter the name of the person who paid." };
    if (!Number.isFinite(months) || months < 1 || months > 36) return { success: false, error: "Choose between 1 and 36 months." };
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(input.firstMonth)) return { success: false, error: "Choose the first month it covers." };
    if (!Number.isFinite(amount) || amount <= 0 || amount > 1_000_000_000) return { success: false, error: "Enter the amount received." };

    // Who paid: a registered customer, or someone whose details are kept on the payment.
    let payerName = "a customer";
    if (input.profileId) {
        const { data: customer } = await supabase.from("customers").select("full_name").eq("profile_id", input.profileId).maybeSingle();
        if (!customer) return { success: false, error: "Customer not found." };
        payerName = customer.full_name ?? payerName;
    } else if (person) {
        payerName = person.full_name;
    }
    const personId = person ? personKey(person) : null;

    const covered = coveredMonthsFrom(input.firstMonth, months);
    const existing = input.profileId
        ? await loadPrepayments(supabase, input.profileId)
        : (await loadUnregisteredPrepayments(supabase)).filter((p) => {
              const to = billToOf(p);
              return to && personKey(to) === personId;
          });
    const clash = covered.filter((month) => existing.some((p) => p.covered_months.includes(month)));

    if (clash.length > 0) {
        return { success: false, error: `Already paid in advance for ${clash.join(", ")}. Choose different months or remove the earlier payment.` };
    }

    const method = PAYMENT_METHODS.includes(input.method) ? input.method : "Other";

    const { data: created, error } = await supabase
        .from("prepayments")
        .insert({
            customer_id: input.profileId || null,
            ...(person ? { bill_to: person } : {}),
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
            error: /bill_to|customer_id/.test(error?.message ?? "")
                ? "Advance payments for people who are not registered are not switched on yet. Run supabase/prepayments-unregistered-2026-10.sql in Supabase first."
                : /prepayments|schema cache/.test(error?.message ?? "")
                    ? "Advance payments are not switched on yet. Run supabase/prepaid-2026-09.sql in Supabase first."
                    : "Could not record the advance payment. Please try again.",
        };
    }

    const prepaymentId = created.id as string;
    const settled: string[] = [];

    if (input.settleExisting) {
        const { data: open } = input.profileId
            ? await supabase.from("payments").select("*").eq("customer_id", input.profileId).in("invoice_month", covered).neq("status", "paid")
            : await supabase.from("payments").select("*").is("customer_id", null).not("bill_to", "is", null).in("invoice_month", covered).neq("status", "paid");

        for (const invoice of (open ?? []).filter((row) => {
            if (input.profileId) return true;
            const to = billToOf(row);
            return Boolean(to && personKey(to) === personId);
        })) {
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
        `Recorded a ${naira(amount)} advance payment from ${payerName}${input.profileId ? "" : " (not registered)"} covering ${months} month${months === 1 ? "" : "s"}`,
        input.profileId ? { type: "profile", id: input.profileId } : undefined
    );
    if (input.profileId) revalidatePath(`/admin/customers/${input.profileId}`);
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

    await logActivity(supabase, actor, "prepayment_removed", "Removed an advance payment", found.customer_id ? { type: "profile", id: found.customer_id as string } : undefined);
    if (found.customer_id) revalidatePath(`/admin/customers/${found.customer_id}`);
    revalidatePath("/admin/payments");
    revalidatePath("/admin");
    revalidatePath("/customer");
    revalidatePath("/customer/payments");

    return { success: true, message: "Advance payment removed." };
}

// What a registered customer is charged for one month, after any discount, so
// the advance payment form can tell when an amount falls short.
export async function getMonthlyCharge(profileId: string): Promise<number> {
    await requireAdmin();
    const supabase = await createClient();

    if (!profileId) return 0;

    const customer = await loadBillable(supabase, profileId);
    if (!customer) return 0;

    const units = customer.is_estate ? await loadEstateUnits(supabase, profileId) : undefined;

    return itemsTotal(chargeItems(customer, units));
}

// For a customer who paid only part of what the months they are paying ahead
// cost. An advance payment marks every month it covers as fully paid, so this
// makes an invoice for those months instead, at their usual charge, and records
// what they paid as a part payment on it. The rest is then owed and tracked, and
// the months are covered so no monthly invoice is made for them.
export async function createAdvanceInvoiceWithPayment(input: {
    profileId: string;
    months: number;
    firstMonth: string;
    amount: number;
    method: string;
    reference: string;
    note: string;
}): Promise<PrepaymentResult & { invoiceId?: string }> {
    const actor = await requireAdmin();
    const supabase = await createClient();

    const months = Math.trunc(Number(input.months));
    const amount = round2(Number(input.amount));

    if (!input.profileId) return { success: false, error: "Missing customer." };
    if (!Number.isFinite(months) || months < 1 || months > 24) return { success: false, error: "Choose between 1 and 24 months." };
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(input.firstMonth)) return { success: false, error: "Choose the first month it covers." };
    if (!Number.isFinite(amount) || amount <= 0) return { success: false, error: "Enter the amount received." };

    const customer = await loadBillable(supabase, input.profileId);
    if (!customer) return { success: false, error: "Customer not found." };

    const units = customer.is_estate ? await loadEstateUnits(supabase, input.profileId) : undefined;
    const base = chargeItems(customer, units);
    if (base.length === 0) return { success: false, error: "This customer has no monthly charge set yet, so there is nothing to invoice." };

    const items = advanceInvoiceItems(base, months);
    const total = round2(itemsTotal(items));

    if (amount >= total) return { success: false, error: "That covers the full price, so record it as an advance payment instead." };

    const covered = monthsFrom(input.firstMonth, months);
    const label = monthRangeLabel(covered);

    // A single month ahead can't be billed yet; several months paid at once can.
    const early = tooEarlyToBill(label);
    if (early) return { success: false, error: early };

    // None of these months may already be paid or invoiced.
    const prepaid = (await loadPrepayments(supabase, input.profileId)).flatMap((p) => p.covered_months).filter((month) => covered.includes(month));
    if (prepaid.length > 0) return { success: false, error: `Already paid in advance for ${prepaid.join(", ")}.` };

    for (const month of covered) {
        const byMonth = supabase.from("payments").select("id").eq("customer_id", input.profileId);
        const found = await byMonth.or(`invoice_month.eq."${month}",covered_months.cs.{"${month}"}`).limit(1);
        const { data: existing } = found.error
            ? await supabase.from("payments").select("id").eq("customer_id", input.profileId).eq("invoice_month", month).limit(1)
            : found;

        if (existing && existing.length > 0) return { success: false, error: `There is already an invoice covering ${month}. Record the payment on that invoice instead.` };
    }

    const { data: created, error } = await supabase
        .from("payments")
        .insert({
            customer_id: input.profileId,
            amount: total,
            arrears: 0,
            units: items.reduce((sum, item) => sum + item.quantity, 0) || 1,
            line_items: items,
            description: `Waste management service, ${label}`,
            invoice_month: label,
            covered_months: covered,
            auto_generated: false,
        })
        .select("id")
        .single();

    if (error || !created) {
        console.error("createAdvanceInvoiceWithPayment error:", error?.message);
        return { success: false, error: invoiceInsertError(error?.message) };
    }

    const invoiceId = created.id as string;
    const paid = await recordPayment(invoiceId, amount, input.method, input.reference, input.note);

    if (!paid.success) {
        // Nothing paid is left behind: take the invoice back out.
        await supabase.from("payments").delete().eq("id", invoiceId);
        return { success: false, error: paid.error ?? "Could not record the payment." };
    }

    await logActivity(
        supabase,
        actor,
        "invoice_created",
        `Created an advance invoice for ${label} (${naira(total)}) with ${naira(amount)} paid so far`,
        { type: "profile", id: input.profileId }
    );
    revalidatePath(`/admin/customers/${input.profileId}`);
    revalidatePath("/admin/payments");
    revalidatePath("/admin");
    revalidatePath("/customer");
    revalidatePath("/customer/payments");

    return {
        success: true,
        invoiceId,
        message: `Invoice made for ${label} (${naira(total)}). ${naira(amount)} is recorded as paid, and ${naira(round2(total - amount))} is still owed.`,
    };
}
