"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/utils/supabase/server";
import { logActivity } from "@/lib/activity";
import { naira } from "@/lib/customer/billing";
import { readBillTo } from "@/lib/admin/invoice-input";
import { billingMonthLabel } from "@/lib/billing/pricing";
import {
    UNREGISTERED_COLUMNS,
    generateInvoiceForUnregistered,
    monthlyChargeOf,
    outcomeMessage,
    registeredEmails,
    runUnregisteredInvoiceGeneration,
    type UnregisteredCustomer,
} from "@/lib/billing/unregistered";
import { requireAdmin } from "./shared";

export type UnregisteredState = { success: boolean; error?: string } | null;

const NOT_SWITCHED_ON = "Not switched on yet. Run supabase/unregistered-customers-2026-10.sql in Supabase first.";

const failure = (message: string | undefined, fallback: string) =>
    /relation|does not exist|schema cache/i.test(message ?? "") ? NOT_SWITCHED_ON : fallback;

function refresh() {
    revalidatePath("/admin/customers/unregistered");
    revalidatePath("/admin/customers");
}

// Adds a person to the list, or saves changes to one already on it (when the
// form carries their id). The monthly charge is what the 25th job bills them.
export async function saveUnregisteredCustomer(_prev: UnregisteredState, formData: FormData): Promise<UnregisteredState> {
    const actor = await requireAdmin();
    const supabase = await createClient();

    const read = readBillTo(formData, "service");
    if ("error" in read) return { success: false, error: read.error };

    const { billTo } = read;
    const id = String(formData.get("id") ?? "").trim();
    const rate = Math.round(Number(String(formData.get("monthlyRate") ?? "").replace(/,/g, "")) * 100) / 100;
    const note = String(formData.get("note") ?? "").trim().slice(0, 500) || null;

    if (!Number.isFinite(rate) || rate <= 0 || rate > 1_000_000_000) return { success: false, error: "Enter their monthly charge in naira." };

    // The same person twice would be billed twice.
    const email = billTo.email?.toLowerCase();
    if (email) {
        const { data: sameEmail } = await supabase.from("unregistered_customers").select("id, full_name").ilike("email", email).limit(2);
        const clash = (sameEmail ?? []).find((row) => row.id !== id);
        if (clash) return { success: false, error: `${clash.full_name} is already on the list with that email address.` };
    }

    const row = {
        full_name: billTo.full_name,
        property_name: billTo.property_name,
        phone: billTo.phone,
        whatsapp_number: billTo.whatsapp_number,
        email: billTo.email,
        address: billTo.address,
        landmark: billTo.landmark,
        lga: billTo.lga,
        state: billTo.state,
        property_type: billTo.property_type,
        monthly_rate: rate,
        note,
        updated_at: new Date().toISOString(),
    };

    const { error } = id
        ? await supabase.from("unregistered_customers").update(row).eq("id", id)
        : await supabase.from("unregistered_customers").insert({ ...row, created_by: actor.id });

    if (error) {
        console.error("saveUnregisteredCustomer error:", error.message);
        return { success: false, error: failure(error.message, "Could not save this. Please try again.") };
    }

    await logActivity(
        supabase,
        actor,
        id ? "unregistered_customer_updated" : "unregistered_customer_added",
        `${id ? "Updated" : "Added"} ${billTo.full_name} on the unregistered customers list (${naira(rate)} a month)`
    );
    refresh();

    return { success: true };
}

export async function setUnregisteredPaused(id: string, paused: boolean): Promise<{ success: boolean; error?: string }> {
    const actor = await requireAdmin();
    const supabase = await createClient();

    const { data, error } = await supabase
        .from("unregistered_customers")
        .update({ paused, updated_at: new Date().toISOString() })
        .eq("id", id)
        .select("full_name")
        .maybeSingle();

    if (error || !data) {
        console.error("setUnregisteredPaused error:", error?.message);
        return { success: false, error: failure(error?.message, "Could not change this. Please try again.") };
    }

    await logActivity(supabase, actor, "unregistered_customer_paused", `${paused ? "Paused" : "Resumed"} monthly billing for ${data.full_name}`);
    refresh();

    return { success: true };
}

// Removes them from the list. Invoices already made for them stay where they are.
export async function deleteUnregisteredCustomer(id: string): Promise<{ success: boolean; error?: string }> {
    const actor = await requireAdmin();
    const supabase = await createClient();

    const { data, error } = await supabase.from("unregistered_customers").delete().eq("id", id).select("full_name").maybeSingle();

    if (error || !data) {
        console.error("deleteUnregisteredCustomer error:", error?.message);
        return { success: false, error: failure(error?.message, "Could not remove them. Please try again.") };
    }

    await logActivity(supabase, actor, "unregistered_customer_removed", `Removed ${data.full_name} from the unregistered customers list`);
    refresh();

    return { success: true };
}

// The month's invoices are normally made by the job on the 25th. This makes
// them on request, for a month the job has already run for or for someone added
// after it did. Anyone who already has the month's invoice is skipped, so it is
// safe to press more than once.
function refreshInvoices() {
    for (const path of ["/admin/payments", "/admin", "/admin/finance", "/admin/customers", "/admin/customers/unregistered"]) revalidatePath(path);
}

export async function generateUnregisteredInvoice(id: string): Promise<{ success: boolean; error?: string; message?: string }> {
    const actor = await requireAdmin();
    const supabase = await createClient();
    const month = billingMonthLabel();

    const { data, error } = await supabase.from("unregistered_customers").select(UNREGISTERED_COLUMNS).eq("id", id).maybeSingle();

    if (error || !data) return { success: false, error: failure(error?.message, "Could not find them on the list.") };

    const person = data as unknown as UnregisteredCustomer;
    const outcome = await generateInvoiceForUnregistered(supabase, person, await registeredEmails(supabase), month);
    const message = outcomeMessage(outcome, person.full_name, month);

    if (outcome === "error") return { success: false, error: message };

    if (outcome === "created") {
        await logActivity(supabase, actor, "unregistered_invoice_generated", `Generated the ${month} invoice for ${person.full_name} (${naira(monthlyChargeOf(person))})`);
        refreshInvoices();
        return { success: true, message };
    }

    // Nothing was made, which an admin should hear about rather than see a success.
    return { success: false, error: message };
}

export async function generateUnregisteredInvoices(): Promise<{ success: boolean; error?: string; message?: string }> {
    const actor = await requireAdmin();
    const supabase = await createClient();
    const month = billingMonthLabel();

    const tally = await runUnregisteredInvoiceGeneration(supabase, month);

    if (tally.people === 0) return { success: false, error: "Nobody is on the list yet." };

    if (tally.created > 0) {
        await logActivity(supabase, actor, "unregistered_invoices_generated", `Generated ${tally.created} ${month} invoices for unregistered customers`);
        refreshInvoices();
    }

    const message =
        `${tally.created} ${month} invoice${tally.created === 1 ? "" : "s"} created, ${tally.exists} already had one` +
        (tally.prepaid > 0 ? `, ${tally.prepaid} paid in advance` : "") +
        (tally.paused > 0 ? `, ${tally.paused} paused` : "") +
        (tally.registered > 0 ? `, ${tally.registered} now have a login` : "") +
        (tally["no-pricing"] > 0 ? `, ${tally["no-pricing"]} have no monthly charge` : "") +
        (tally.error > 0 ? `, ${tally.error} failed` : "") +
        ".";

    return tally.error > 0 && tally.created === 0 ? { success: false, error: message } : { success: true, message };
}
