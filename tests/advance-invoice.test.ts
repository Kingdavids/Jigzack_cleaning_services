import { describe, expect, it } from "vitest";
import { advanceInvoiceItems, advanceShortfall, itemsTotal, type LineItem } from "@/lib/billing/pricing";

const month: LineItem[] = [
    { label: "Flat", quantity: 2, unit_price: 5000 },
    { label: "Discount (10%)", quantity: 1, unit_price: -1000 },
];

describe("advance invoices", () => {
    it("charges every line for all of the months", () => {
        const items = advanceInvoiceItems(month, 3);

        expect(itemsTotal(items)).toBe(itemsTotal(month) * 3);
        expect(items[0]).toMatchObject({ label: "Flat (3 months)", quantity: 6, unit_price: 5000 });
        expect(items[1]).toMatchObject({ quantity: 3, unit_price: -1000 });
    });

    it("leaves a single month as it is", () => {
        expect(advanceInvoiceItems(month, 1)).toEqual(month);
    });

    it("works out how far short a payment is", () => {
        expect(advanceShortfall(8000, 9000, 2)).toBe(10000);
        expect(advanceShortfall(18000, 9000, 2)).toBe(0);
        expect(advanceShortfall(20000, 9000, 2)).toBe(0);
    });

    it("says nothing when there is no monthly charge to compare with", () => {
        expect(advanceShortfall(1000, 0, 3)).toBe(0);
        expect(advanceShortfall(0, 9000, 3)).toBe(0);
    });
});
