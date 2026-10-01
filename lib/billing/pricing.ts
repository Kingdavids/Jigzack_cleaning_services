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
// overrides the standard rate for that type. quantity lets one row stand for
// several identical units (a block of duplexes, say) so pricing them doesn't
// need one row each; it defaults to 1, exactly one unit, before that column
// exists.
export type EstateUnit = {
    id: string;
    label: string;
    property_type: string | null;
    monthly_rate: number | string | null;
    is_vacant: boolean;
    quantity?: number | string | null;
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
    const groups = new Map<string, { label: string; rate: number; count: number }>();

    for (const unit of units) {
        if (unit.is_vacant || !unit.property_type) continue;

        const standard = UNIT_PRICES[unit.property_type];
        if (standard === undefined) continue;

        const customRate = Number(unit.monthly_rate ?? 0);
        const rate = customRate > 0 ? customRate : standard;
        const quantity = Number(unit.quantity ?? 1);
        const count = Number.isFinite(quantity) && quantity > 0 ? quantity : 1;
        const facility = DOMESTIC_FACILITIES.find((f) => f.key === unit.property_type);
        const key = `${unit.property_type}:${rate}`;
        const existing = groups.get(key);

        if (existing) existing.count += count;
        else groups.set(key, { label: facility?.unitLabel ?? "Unit", rate, count });
    }

    return [...groups.values()].map((g) => ({
        label: g.label,
        quantity: g.count,
        unit_price: g.rate,
    }));
}

export const lineTotal = (item: LineItem) => item.quantity * item.unit_price;

export const itemsTotal = (items: LineItem[]) => items.reduce((sum, item) => sum + lineTotal(item), 0);

export function monthLabel(date: Date = new Date()) {
    return date.toLocaleString("en-US", { month: "long", year: "numeric" });
}

// The day of the month (Lagos time) each month's invoice is created. Until
// then the current invoice is still last month's: on 5 October it is
// September's, and from 20 October it is October's.
export const INVOICE_DAY = 20;

// The month whose invoice is the current one right now (see INVOICE_DAY).
export function billingMonthLabel(now: Date = new Date()) {
    const [y, m, d] = now.toLocaleDateString("en-CA", { timeZone: "Africa/Lagos" }).split("-").map(Number);
    const monthIndex = d < INVOICE_DAY ? m - 2 : m - 1;

    return new Date(Date.UTC(y, monthIndex, 15)).toLocaleString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
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
