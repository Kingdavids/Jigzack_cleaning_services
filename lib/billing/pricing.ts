import { DOMESTIC_FACILITIES, facilityCount, type FacilityDetails } from "@/lib/customer/facilities";

export type LineItem = { label: string; quantity: number; unit_price: number; note?: string };

// Monthly service charge per unit. Only these property types are priced;
// anything else (commercial facilities, etc.) is left for the admin to add
// by hand when editing the invoice.
export const UNIT_PRICES: Record<string, number> = {
    flatsCount: 5000,
    miniFlatsCount: 5000,
    shopsCount: 2000,
    duplexCount: 8000,
    bungalowCount: 7000,
    terraceCount: 10000,
};

// Vacant units (the landlord tells the company a tenant has moved out, the
// admin records it) aren't billed.
export function buildLineItems(facilityDetails: FacilityDetails, vacancies: FacilityDetails): LineItem[] {
    const items: LineItem[] = [];

    for (const facility of DOMESTIC_FACILITIES) {
        const price = UNIT_PRICES[facility.key];
        if (price === undefined) continue;

        const registered = facilityCount(facilityDetails, facility.key);
        if (registered === 0) continue;

        const vacant = Math.min(facilityCount(vacancies, facility.key), registered);

        items.push({
            label: facility.unitLabel,
            quantity: registered - vacant,
            unit_price: price,
            note: vacant > 0 ? `${registered} registered, ${vacant} vacant` : undefined,
        });
    }

    return items;
}

export const lineTotal = (item: LineItem) => item.quantity * item.unit_price;

export const itemsTotal = (items: LineItem[]) => items.reduce((sum, item) => sum + lineTotal(item), 0);

export function monthLabel(date: Date = new Date()) {
    return date.toLocaleString("en-US", { month: "long", year: "numeric" });
}

export function normalizeLineItems(raw: unknown): LineItem[] {
    if (!Array.isArray(raw)) return [];

    return raw
        .map((item) => ({
            label: String((item as LineItem)?.label ?? "").trim(),
            quantity: Number((item as LineItem)?.quantity ?? 0),
            unit_price: Number((item as LineItem)?.unit_price ?? 0),
            note: String((item as LineItem)?.note ?? "").trim() || undefined,
        }))
        .filter((item) => item.label && Number.isFinite(item.quantity) && Number.isFinite(item.unit_price));
}
