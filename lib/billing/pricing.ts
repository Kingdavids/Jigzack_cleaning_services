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

// One unit inside an estate: its own type, and an optional price that
// overrides the standard rate for that type.
export type EstateUnit = {
    id: string;
    label: string;
    property_type: string | null;
    monthly_rate: number | string | null;
    is_vacant: boolean;
};

// An estate switches to per-unit pricing only once every one of its units has
// a type. Below that, its old count-based total keeps being used, so a
// half-set-up estate is never under-billed.
export function unitsCoverBilling(units: EstateUnit[]): boolean {
    return units.length > 0 && units.every((u) => Boolean(u.property_type));
}

// Units billed by type and price, not one line per unit, so an estate where
// most units share the standard price still reads as a short invoice. A unit
// with no recognised type, or marked vacant, is left off, the same as a vacant
// count used to be.
export function unitLineItems(units: EstateUnit[]): LineItem[] {
    const groups = new Map<string, { label: string; rate: number; count: number; custom: boolean }>();

    for (const unit of units) {
        if (unit.is_vacant || !unit.property_type) continue;

        const standard = UNIT_PRICES[unit.property_type];
        if (standard === undefined) continue;

        const customRate = Number(unit.monthly_rate ?? 0);
        const rate = customRate > 0 ? customRate : standard;
        const facility = DOMESTIC_FACILITIES.find((f) => f.key === unit.property_type);
        const key = `${unit.property_type}:${rate}`;
        const existing = groups.get(key);

        if (existing) existing.count += 1;
        else groups.set(key, { label: facility?.unitLabel ?? "Unit", rate, count: 1, custom: rate !== standard });
    }

    return [...groups.values()].map((g) => ({
        label: g.label,
        quantity: g.count,
        unit_price: g.rate,
        note: g.custom ? "custom price" : undefined,
    }));
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
