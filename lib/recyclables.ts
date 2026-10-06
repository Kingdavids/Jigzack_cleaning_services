import type { SupabaseClient } from "@supabase/supabase-js";

// Recyclable waste is tracked by weight: kilograms collected in and sold or
// dispatched out, per material. Stock on hand is in minus out.

export const MATERIALS = [
    { value: "plastic", label: "Plastic" },
    { value: "metal", label: "Metal" },
    { value: "paper", label: "Paper and cardboard" },
    { value: "glass", label: "Glass" },
    { value: "electronics", label: "Electronics" },
    { value: "other", label: "Other" },
] as const;

export type Material = (typeof MATERIALS)[number]["value"];

export const materialLabel = (value: string) => MATERIALS.find((m) => m.value === value)?.label ?? value;

export type Movement = {
    id: string;
    direction: "in" | "out";
    material: Material;
    material_note: string | null;
    kg: number | string;
    movement_date: string;
    party: string | null;
    note: string | null;
    created_at: string;
    // What was paid when buying, or the value of a sale. From the trading SQL.
    amount?: number | string | null;
    // The sale invoice this came from, if any.
    payment_id?: string | null;
};

export const kgText = (value: number) => `${value.toLocaleString("en-NG", { maximumFractionDigits: 1 })} kg`;

// Totals per material, and overall. `table` is false before the recyclables
// SQL has been run, so pages can say so instead of showing zeros.
export type Stock = {
    table: boolean;
    byMaterial: Record<string, { inKg: number; outKg: number; stock: number }>;
    inKg: number;
    outKg: number;
    stock: number;
};

export function summarise(movements: Pick<Movement, "direction" | "material" | "kg">[], table = true): Stock {
    const byMaterial: Stock["byMaterial"] = Object.fromEntries(MATERIALS.map((m) => [m.value, { inKg: 0, outKg: 0, stock: 0 }]));
    let inKg = 0;
    let outKg = 0;

    for (const m of movements) {
        const kg = Number(m.kg);
        const row = (byMaterial[m.material] ??= { inKg: 0, outKg: 0, stock: 0 });

        if (m.direction === "in") {
            row.inKg += kg;
            inKg += kg;
        } else {
            row.outKg += kg;
            outKg += kg;
        }

        row.stock = row.inKg - row.outKg;
    }

    return { table, byMaterial, inKg, outKg, stock: inKg - outKg };
}

// All-time stock on hand. Quiet (table: false) when the table doesn't exist yet.
export async function loadStock(supabase: SupabaseClient): Promise<Stock> {
    const { data, error } = await supabase.from("recyclable_movements").select("direction, material, kg").limit(20000);

    return error ? summarise([], false) : summarise((data ?? []) as Pick<Movement, "direction" | "material" | "kg">[]);
}
