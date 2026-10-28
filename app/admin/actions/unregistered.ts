"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/utils/supabase/server";
import { logActivity } from "@/lib/activity";
import { naira } from "@/lib/customer/billing";
import { readBillTo } from "@/lib/admin/invoice-input";
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
