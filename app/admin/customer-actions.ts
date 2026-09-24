"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/utils/supabase/server";
import { getUserProfile } from "@/lib/auth/getUserProfile";
import { isFullAdmin } from "@/lib/auth/roles";
import { logActivity } from "@/lib/activity";

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

        return { success: false, error: error.message.startsWith("This estate") ? error.message : "Could not delete this customer." };
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
