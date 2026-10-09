import { DOMESTIC_FACILITIES, facilityCount, type FacilityDetails } from "@/lib/customer/facilities";
import { BUSINESS } from "@/lib/config/business";
import { TIMEZONE } from "@/lib/config/business";

export type LineItem = { label: string; quantity: number; unit_price: number; note?: string };

// Monthly service charge per unit. Only these property types are priced;
// anything else (commercial facilities, etc.) is left for the admin to add
// by hand when editing the invoice.
export const UNIT_PRICES: Record<string, number> = BUSINESS.billing.unitPrices;

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

        // Every unit of this type is vacant, so there is nothing to bill for it.
        if (registered - vacant <= 0) continue;

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

// The months from a "YYYY-MM" start: monthsFrom("2026-10", 3) is
// ["October 2026", "November 2026", "December 2026"].
export function monthsFrom(start: string, count: number): string[] {
    const [y, m] = start.split("-").map(Number);
    if (!y || !m || count < 1) return [];

    return Array.from({ length: Math.min(count, 24) }, (_, i) =>
        new Date(Date.UTC(y, m - 1 + i, 15)).toLocaleString("en-US", { month: "long", year: "numeric", timeZone: "UTC" })
    );
}

// "October 2026", "October – December 2026" or "December 2026 – February 2027".
export function monthRangeLabel(months: string[]): string {
    if (months.length === 0) return "";
    if (months.length === 1) return months[0];

    const first = months[0];
    const last = months[months.length - 1];
    const [firstName, firstYear] = first.split(" ");

    return firstYear === last.split(" ")[1] ? `${firstName} – ${last}` : `${first} – ${last}`;
}

// The day of the month (Lagos time) each month's invoice is created. Until
// then the current invoice is still last month's: on 5 October it is
// September's, and from 25 October it is October's.
export const INVOICE_DAY = BUSINESS.billing.invoiceDay;

// The billing month as "YYYY-MM" (see INVOICE_DAY): on 5 October it is
// "2026-09", from 25 October "2026-10".
export function billingMonthKey(now: Date = new Date()) {
    const [y, m, d] = now.toLocaleDateString("en-CA", { timeZone: TIMEZONE }).split("-").map(Number);
    const first = new Date(Date.UTC(y, d < INVOICE_DAY ? m - 2 : m - 1, 1));
    return first.toISOString().slice(0, 7);
}

const MONTH_WORDS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];

// The first month an invoice month label names, as "YYYY-MM": "October 2026",
// "October – December 2026" and "October 2026 – January 2027" all give
// "2026-10". Null when the label doesn't name a month and year.
export function firstMonthKeyOf(label: string | null | undefined): string | null {
    const text = (label ?? "").toLowerCase();

    // The month name that comes first in the label.
    let month = -1;
    let at = Infinity;
    MONTH_WORDS.forEach((name, i) => {
        const found = text.match(new RegExp(`\\b${name}\\b`));
        if (found?.index !== undefined && found.index < at) {
            at = found.index;
            month = i;
        }
    });

    const year = text.match(/\b(20\d{2})\b/)?.[1];

    return month >= 0 && year ? `${year}-${String(month + 1).padStart(2, "0")}` : null;
}

// Why an invoice for this month can't be made yet, or null when it can. A
// month's invoices start on INVOICE_DAY, so before then a single-month invoice
// can't be for it or any later month. An invoice covering several months
// ("October – December 2026") is someone paying ahead, so it is always allowed.
export function tooEarlyToBill(label: string | null | undefined, now: Date = new Date()): string | null {
    if (/–|\s-\s|\bto\b/i.test(label ?? "")) return null;

    const first = firstMonthKeyOf(label);
    const latest = billingMonthKey(now);
    if (!first || first <= latest) return null;

    const [y, m] = first.split("-").map(Number);
    const name = new Date(Date.UTC(y, m - 1, 15)).toLocaleString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
    return `${name} invoices start on ${INVOICE_DAY} ${name.split(" ")[0]}. Until then, start from ${billingMonthLabel(now)} or earlier.`;
}

// The month whose invoice is the current one right now (see INVOICE_DAY).
export function billingMonthLabel(now: Date = new Date()) {
    const [y, m, d] = now.toLocaleDateString("en-CA", { timeZone: TIMEZONE }).split("-").map(Number);
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

// A month's charges laid out for several months paid ahead: every line runs for
// all of them, so the total is the monthly charge times the months. Matches how
// the invoice builder words it.
export function advanceInvoiceItems(items: LineItem[], months: number): LineItem[] {
    if (months <= 1) return items;

    return items.map((item) => ({ ...item, label: `${item.label} (${months} months)`, quantity: item.quantity * months }));
}

// How far short of the full price for these months an advance payment is, or 0
// when it covers them (or when there is no monthly charge to compare with).
export function advanceShortfall(amount: number, monthlyCharge: number, months: number) {
    if (!(monthlyCharge > 0) || !(months >= 1) || !(amount > 0)) return 0;

    const shortfall = Math.round((monthlyCharge * months - amount) * 100) / 100;

    return shortfall > 0.005 ? shortfall : 0;
}
