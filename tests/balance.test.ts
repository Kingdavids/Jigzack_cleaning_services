import { describe, expect, it } from "vitest";
import { amountPaid, balanceOf, invoiceTotal, round2 } from "@/lib/billing/balance";

describe("invoice balances", () => {
    it("adds arrears to the charges", () => {
        expect(invoiceTotal({ amount: 10000, arrears: 2500 })).toBe(12500);
        expect(invoiceTotal({ amount: "10000.50", arrears: null })).toBe(10000.5);
    });

    it("counts a fully paid invoice as paid in full, even with no payment rows", () => {
        const legacy = { amount: 5000, arrears: 1000, status: "paid" };
        expect(amountPaid(legacy)).toBe(6000);
        expect(balanceOf(legacy)).toBe(0);
    });

    it("subtracts part payments from what is owed", () => {
        const part = { amount: 10000, arrears: 2000, status: "pending", amount_paid: 4500 };
        expect(amountPaid(part)).toBe(4500);
        expect(balanceOf(part)).toBe(7500);
    });

    it("never lets a payment exceed the total, or the balance go negative", () => {
        const over = { amount: 1000, arrears: 0, status: "pending", amount_paid: 5000 };
        expect(amountPaid(over)).toBe(1000);
        expect(balanceOf(over)).toBe(0);
    });

    it("owes everything when nothing is paid", () => {
        expect(balanceOf({ amount: 8000, arrears: 0, status: "pending" })).toBe(8000);
    });

    it("rounds to kobo without floating point drift", () => {
        expect(round2(0.1 + 0.2)).toBe(0.3);
        expect(invoiceTotal({ amount: 0.1, arrears: 0.2 })).toBe(0.3);
    });
});
