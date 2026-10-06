"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/utils/supabase/server";
import { logActivity } from "@/lib/activity";
import { DOMESTIC_FACILITIES } from "@/lib/customer/facilities";
import { round2 } from "@/lib/billing/balance";
import { naira } from "@/lib/customer/billing";
import { loadBillable, recalculateOpenInvoice } from "@/lib/billing/generate";
import { requireAdmin } from "./shared";

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
