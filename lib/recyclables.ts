import type { SupabaseClient } from "@supabase/supabase-js";

// Recyclable waste is tracked by weight: kilograms collected in and sold or
// dispatched out, per material. Stock on hand is in minus out.

export const MATERIALS = [
    { value: "plastic", label: "Plastic" },
    { value: "pet_bottles", label: "PET bottles" },
    { value: "cans", label: "Cans" },
    { value: "metal", label: "Metal (iron)" },
    { value: "paper", label: "Paper and cardboard" },
    { value: "glass", label: "Glass" },
    { value: "electronics", label: "Electronics" },
    { value: "other", label: "Other" },
] as const;

// The materials people deal with day to day. These are the ones the forms and
// tables show; the rest stay in the database but are kept out of sight, and a
// table row for one appears only if something has been logged under it.
export const COMMON_MATERIALS = MATERIALS.filter((m) => ["plastic", "pet_bottles", "cans", "metal"].includes(m.value));

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

// What the business pays a seller per kilogram, in naira. These start each
// material off; admins change them on the recyclables page, and the changed
// prices (in recyclable_prices) win. A material with no price is bought at 0
// until one is set.
export const DEFAULT_BUY_PRICES: Record<string, number> = {
    plastic: 200,
    pet_bottles: 200,
    metal: 300,
    cans: 1000,
    paper: 100,
};

export type BuyPrices = Record<string, number>;

// The price per kilogram for every material. Quiet (defaults only) before the
// prices SQL has been run.
export async function loadBuyPrices(supabase: SupabaseClient): Promise<BuyPrices> {
    const prices: BuyPrices = Object.fromEntries(MATERIALS.map((m) => [m.value, DEFAULT_BUY_PRICES[m.value] ?? 0]));
    const { data, error } = await supabase.from("recyclable_prices").select("material, buy_price_per_kg");

    if (error) return prices;

    for (const row of (data ?? []) as { material: string; buy_price_per_kg: number | string }[]) {
        if (row.material in prices) prices[row.material] = Number(row.buy_price_per_kg);
    }

    return prices;
}
