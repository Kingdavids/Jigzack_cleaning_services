import { lineTotal, type LineItem } from "@/lib/billing/pricing";

// A discount typed into an invoice form: a percentage or a fixed amount off
// the charges, with an optional reason printed on the invoice.
export type DiscountInput = { kind: "none" | "percent" | "amount"; value: number; reason: string };

export const NO_DISCOUNT: DiscountInput = { kind: "none", value: 0, reason: "" };

// Saved as its own line with a negative price, labelled the same way
// automatic invoices label one: "Discount (10%)" or "Discount (10%): reason".
export const isDiscountLine = (item: LineItem) => /^discount\b/i.test(item.label.trim()) && item.unit_price < 0;

// Lifts an existing discount line back into the form's discount fields.
export function readDiscount(items: LineItem[]): DiscountInput {
    const line = items.find(isDiscountLine);
    if (!line) return NO_DISCOUNT;

    const match = line.label.match(/^discount\s*(?:\(([\d.]+)%\))?\s*:?\s*(.*)$/i);
    const percent = match?.[1] ? Number(match[1]) : NaN;
    const reason = (match?.[2] ?? "").trim();

    return Number.isFinite(percent) && percent > 0
        ? { kind: "percent", value: percent, reason }
        : { kind: "amount", value: Math.abs(lineTotal(line)), reason };
}

// How much comes off the charges (never more than them, so an invoice can't
// go below zero), as an amount and a percentage, and the line to save.
export function applyDiscount(charges: number, discount: DiscountInput) {
    const amount =
        discount.kind === "percent"
            ? Math.round(Math.min(charges, (charges * Math.min(discount.value, 100)) / 100) * 100) / 100
            : discount.kind === "amount"
                ? Math.min(Math.max(discount.value, 0), Math.max(charges, 0))
                : 0;

    const percent = charges > 0 ? Math.round((amount / charges) * 1000) / 10 : 0;
    const reason = discount.reason.trim();

    const line: LineItem | null =
        amount > 0 ? { label: `Discount (${percent}%)${reason ? `: ${reason}` : ""}`, quantity: 1, unit_price: -amount } : null;

    return { amount, percent, line };
}
