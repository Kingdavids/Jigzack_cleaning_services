"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/utils/supabase/server";
import { logActivity } from "@/lib/activity";
import { round2 } from "@/lib/billing/balance";
import { todayLagos } from "@/lib/tasks";
import { naira } from "@/lib/customer/billing";
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
