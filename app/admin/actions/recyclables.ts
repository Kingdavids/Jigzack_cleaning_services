"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/utils/supabase/server";
import { logActivity } from "@/lib/activity";
import { round2 } from "@/lib/billing/balance";
import { todayLagos } from "@/lib/tasks";
import { naira } from "@/lib/customer/billing";
import { MATERIAL_VALUES } from "@/lib/admin/invoice-input";
import { materialLabel } from "@/lib/recyclables";
import { requireAdmin } from "./shared";

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
    if (!MATERIAL_VALUES.includes(material)) return { success: false, error: "Choose the material." };
    if (!Number.isFinite(kg) || kg <= 0 || kg > 1_000_000) return { success: false, error: "Enter the weight in kilograms." };
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date > todayLagos()) return { success: false, error: "Choose a date that is not in the future." };

    // When buying, what was paid is the weight times the price per kilogram.
    // The price starts from the material's buying price and can be changed per entry.
    const priceInput = String(formData.get("pricePerKg") ?? "").replace(/,/g, "").trim();
    const price = direction === "in" && priceInput !== "" ? Number(priceInput) : 0;
    if (!Number.isFinite(price) || price < 0 || price > 10_000_000) return { success: false, error: "Enter the price per kilogram in naira, or leave it empty." };
    const paid = price > 0 ? round2(kg * price) : null;
    if (paid !== null && paid > 500_000_000) return { success: false, error: "That comes to too much. Check the weight and the price." };

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

// Changes what we pay per kilogram for each material. Only a price that was
// filled in is saved; a blank means no change.
export async function setBuyPrices(formData: FormData): Promise<{ success: boolean; error?: string }> {
    const admin = await requireAdmin();
    const supabase = await createClient();

    const rows: { material: string; buy_price_per_kg: number; updated_at: string }[] = [];

    for (const material of MATERIAL_VALUES) {
        const raw = String(formData.get(`price_${material}`) ?? "").replace(/,/g, "").trim();
        if (raw === "") continue;

        const price = round2(Number(raw));
        if (!Number.isFinite(price) || price < 0 || price > 10_000_000) return { success: false, error: "Each price must be a number of naira, 0 or more." };

        rows.push({ material, buy_price_per_kg: price, updated_at: new Date().toISOString() });
    }

    if (rows.length === 0) return { success: false, error: "Enter at least one price." };

    const { error } = await supabase.from("recyclable_prices").upsert(rows, { onConflict: "material" });

    if (error) {
        console.error("setBuyPrices error:", error.message);
        return {
            success: false,
            error: /relation|does not exist|schema cache/i.test(error.message)
                ? "Not switched on yet. Run supabase/pet-bottles-cans-2026-10.sql in Supabase first."
                : "Could not save the prices. Please try again.",
        };
    }

    await logActivity(supabase, admin, "recyclable_prices_changed", "Changed the recyclable buying prices");
    revalidatePath("/admin/recyclables");

    return { success: true };
}

// Corrects an entry that was logged wrongly. The stock balance follows, so a
// change can't leave any material with less than nothing in stock. An entry
// that came from a sale invoice is changed through that invoice instead.
export async function editRecyclable(id: string, formData: FormData): Promise<{ success: boolean; error?: string }> {
    const admin = await requireAdmin();
    const supabase = await createClient();

    if (!id) return { success: false, error: "Missing entry." };

    const material = String(formData.get("material") ?? "");
    const kg = Math.round(Number(String(formData.get("kg") ?? "").replace(/,/g, "")) * 100) / 100;
    const date = String(formData.get("date") ?? "");
    const clean = (name: string, max: number) => String(formData.get(name) ?? "").trim().slice(0, max) || null;

    if (!MATERIAL_VALUES.includes(material)) return { success: false, error: "Choose the material." };
    if (!Number.isFinite(kg) || kg <= 0 || kg > 1_000_000) return { success: false, error: "Enter the weight in kilograms." };
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date > todayLagos()) return { success: false, error: "Choose a date that is not in the future." };

    const { data: existing } = await supabase.from("recyclable_movements").select("id, direction, material, kg, payment_id").eq("id", id).maybeSingle();

    if (!existing) return { success: false, error: "Could not find that entry." };
    if (existing.payment_id) return { success: false, error: "This came from a sale invoice. Change the invoice instead, and the stock follows." };

    const materialNote = clean("materialNote", 80);
    if (material === "other" && !materialNote) return { success: false, error: "Say what the other material is." };

    // What was paid when buying, or the value when it went out.
    const amountInput = String(formData.get("amount") ?? "").replace(/,/g, "").trim();
    const amount = amountInput === "" ? null : round2(Number(amountInput));
    if (amount !== null && (!Number.isFinite(amount) || amount < 0 || amount > 500_000_000)) return { success: false, error: "Enter the amount in naira, or leave it empty." };

    // Stock of the old and the new material, with this entry taken out and put back as edited.
    const affected = [...new Set([existing.material as string, material])];
    const { data: rows } = await supabase.from("recyclable_movements").select("id, direction, material, kg").in("material", affected).limit(20000);

    for (const m of affected) {
        const stock = (rows ?? [])
            .filter((r) => r.material === m && r.id !== id)
            .reduce((sum, r) => sum + (r.direction === "in" ? Number(r.kg) : -Number(r.kg)), 0);
        const after = stock + (m === material ? (existing.direction === "in" ? kg : -kg) : 0);

        if (after < -0.001) {
            return { success: false, error: `That would leave ${materialLabel(m).toLowerCase()} with less than nothing in stock. Change the other entries first.` };
        }
    }

    const { error } = await supabase
        .from("recyclable_movements")
        .update({
            material,
            material_note: material === "other" ? materialNote : null,
            kg,
            movement_date: date,
            party: clean("party", 120),
            note: clean("note", 300),
            amount,
        })
        .eq("id", id);

    if (error) {
        console.error("editRecyclable error:", error.message);
        return { success: false, error: "Could not save the changes. Please try again." };
    }

    await logActivity(supabase, admin, "recyclable_edited", `Edited a recyclables entry: ${kg} kg of ${material} ${existing.direction}`);
    revalidatePath("/admin/finance");
    revalidatePath("/admin/recyclables");
    revalidatePath("/admin");

    return { success: true };
}
