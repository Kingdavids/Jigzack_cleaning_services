import { describe, expect, it } from "vitest";
import { applyDiscount, isDiscountLine, NO_DISCOUNT, readDiscount } from "@/lib/billing/discount-line";

describe("invoice discounts", () => {
    it("takes a percentage off the charges", () => {
        const { amount, percent, line } = applyDiscount(54000, { kind: "percent", value: 10, reason: "Loyal customer" });

        expect(amount).toBe(5400);
        expect(percent).toBe(10);
        expect(line).toEqual({ label: "Discount (10%): Loyal customer", quantity: 1, unit_price: -5400 });
    });

    it("shows a fixed amount as the percentage it comes to", () => {
        const { amount, percent, line } = applyDiscount(20000, { kind: "amount", value: 1500, reason: "" });

        expect(amount).toBe(1500);
        expect(percent).toBe(7.5);
        expect(line?.label).toBe("Discount (7.5%)");
    });

    it("never takes off more than the charges", () => {
        expect(applyDiscount(5000, { kind: "amount", value: 9000, reason: "" }).amount).toBe(5000);
        expect(applyDiscount(5000, { kind: "percent", value: 250, reason: "" }).amount).toBe(5000);
    });

    it("makes no line when there is no discount or nothing to discount", () => {
        expect(applyDiscount(5000, NO_DISCOUNT).line).toBeNull();
        expect(applyDiscount(0, { kind: "percent", value: 10, reason: "" }).line).toBeNull();
    });

    it("recognises a saved discount line and reads it back", () => {
        const { line } = applyDiscount(10000, { kind: "percent", value: 15, reason: "Festive" });

        expect(isDiscountLine(line!)).toBe(true);
        expect(isDiscountLine({ label: "Flat", quantity: 1, unit_price: 5000 })).toBe(false);
        expect(readDiscount([{ label: "Flat", quantity: 2, unit_price: 5000 }, line!])).toEqual({ kind: "percent", value: 15, reason: "Festive" });
    });

    it("reads the discount lines that automatic invoices write", () => {
        expect(readDiscount([{ label: "Discount (12.5%)", quantity: 1, unit_price: -625 }])).toEqual({ kind: "percent", value: 12.5, reason: "" });
        expect(readDiscount([{ label: "Discount: festive", quantity: 1, unit_price: -300 }])).toEqual({ kind: "amount", value: 300, reason: "festive" });
    });
});
