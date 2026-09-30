"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/utils/supabase/server";
import { getUserProfile } from "@/lib/auth/getUserProfile";
import { ALL_FACILITIES, FACILITY_TEXT_LABELS } from "@/lib/customer/facilities";

export type PropertyDetailsResult = { success: boolean; error?: string; message?: string };

// Fills in a linked property's real details, replacing the placeholder made
// when it was invited. Only works on a property genuinely linked to the
// signed-in customer's own login.
export async function updateLinkedPropertyDetails(linkedProfileId: string, formData: FormData): Promise<PropertyDetailsResult> {
    const profile = await getUserProfile();

    if (profile.role !== "customer" || profile.status !== "approved") {
        return { success: false, error: "Only approved customers can do this." };
    }

    if (!linkedProfileId) return { success: false, error: "Invalid request." };

    const supabase = await createClient();

    const fullName = String(formData.get("fullName") ?? "").trim().slice(0, 200);
    const address = String(formData.get("address") ?? "").trim().slice(0, 300);
    const lga = String(formData.get("lga") ?? "").trim().slice(0, 100);
    const state = String(formData.get("state") ?? "").trim().slice(0, 100);
    const landmark = String(formData.get("landmark") ?? "").trim().slice(0, 200);
    const propertyType = String(formData.get("propertyType") ?? "residential").trim();
    const pickupFrequency = String(formData.get("pickupFrequency") ?? "").trim().slice(0, 100);

    if (!fullName || !address || !lga || !state) {
        return { success: false, error: "Please fill in the name, address, area and state." };
    }

    const facilityDetails: Record<string, string> = {};
    for (const facility of ALL_FACILITIES) {
        const raw = String(formData.get(facility.key) ?? "").trim();
        if (raw) facilityDetails[facility.key] = raw;
    }
    for (const key of Object.keys(FACILITY_TEXT_LABELS)) {
        const raw = String(formData.get(key) ?? "").trim();
        if (raw) facilityDetails[key] = raw;
    }

    const { error } = await supabase.rpc("update_linked_property_details", {
        p_linked_profile_id: linkedProfileId,
        p_full_name: fullName,
        p_address: address,
        p_lga: lga,
        p_state: state,
        p_landmark: landmark || null,
        p_property_type: propertyType === "commercial" ? "commercial" : "residential",
        p_pickup_frequency: pickupFrequency || null,
        p_facility_details: facilityDetails,
    });

    if (error) {
        console.error("updateLinkedPropertyDetails error:", error.message);
        return {
            success: false,
            error: /schema cache|could not find the function/i.test(error.message)
                ? "Not switched on yet. Run supabase/property-links-2026-09.sql in Supabase first."
                : error.code === "P0001"
                    ? error.message
                    : "Could not save these details. Please try again.",
        };
    }

    revalidatePath("/customer");
    revalidatePath("/customer/payments");
    revalidatePath("/customer/schedule");

    return { success: true, message: "Saved. This property's details are set." };
}
