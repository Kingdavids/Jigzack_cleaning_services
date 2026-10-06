"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/utils/supabase/server";
import { logActivity } from "@/lib/activity";
import { ALL_FACILITIES, DOMESTIC_FACILITIES, facilityCount } from "@/lib/customer/facilities";
import { loadBillable, recalculateOpenInvoice } from "@/lib/billing/generate";
import { requireAdmin } from "./shared";

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
