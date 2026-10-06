import { describe, expect, it } from "vitest";
import { loadCashflow, monthsEndingAt } from "@/lib/finance/cashflow";
import { fakeSupabase } from "./helpers/fakeSupabase";

const base = () => ({
    payment_installments: [
        { payment_id: "auto1", amount: 10000, method: "Bank transfer", paid_at: "2026-10-03T10:00:00Z" },
        { payment_id: "oneoff", amount: 4000, method: "Cash", paid_at: "2026-10-04T10:00:00Z" },
        { payment_id: "unreg", amount: 15000, method: "POS", paid_at: "2026-10-05T10:00:00Z" },
        { payment_id: "sale", amount: 9000, method: "Bank transfer", paid_at: "2026-10-07T10:00:00Z" },
        // 23:30 UTC on 30 September is already 1 October in Lagos
        { payment_id: "auto1", amount: 2000, method: "Bank transfer", paid_at: "2026-09-30T23:30:00Z" },
        { payment_id: "auto2", amount: 7000, method: "Bank transfer", paid_at: "2026-09-12T10:00:00Z" },
    ],
    payments: [
        { id: "auto1", customer_id: "c1", auto_generated: true, bill_to: null, payment_method: null },
        { id: "auto2", customer_id: "c2", auto_generated: true, bill_to: null, payment_method: null },
        { id: "oneoff", customer_id: "c1", auto_generated: false, bill_to: null, payment_method: null },
        { id: "unreg", customer_id: null, auto_generated: false, bill_to: { full_name: "Grace Hotel" }, payment_method: null },
        { id: "sale", customer_id: "c5", auto_generated: false, bill_to: null, payment_method: null, invoice_kind: "recyclables" },
        // settled in one go, before part payments existed
        { id: "legacy", customer_id: "c3", auto_generated: true, bill_to: null, amount: 5000, arrears: 1000, status: "paid", paid_at: "2026-10-02T10:00:00Z", payment_method: "Cash" },
        // settled from an advance payment: not new money
        { id: "fromAdvance", customer_id: "c4", auto_generated: true, bill_to: null, amount: 5000, arrears: 0, status: "paid", paid_at: "2026-10-02T10:00:00Z", payment_method: "Advance payment" },
    ],
    prepayments: [{ amount: 30000, method: "Bank transfer", paid_at: "2026-10-06T10:00:00Z" }],
    customers: [
        { registration_fee_paid: true, registration_fee_paid_at: "2026-10-01T10:00:00Z", registration_fee_reference: "Confirmed by admin" },
        { registration_fee_paid: true, registration_fee_paid_at: "2026-10-01T11:00:00Z", registration_fee_reference: "Existing customer, fee waived" },
    ],
    expenses: [
        { amount: 3000, category: "fuel", status: "approved", expense_date: "2026-10-02" },
        { amount: 1500, category: "fuel", status: "reimbursed", expense_date: "2026-10-03" },
        { amount: 800, category: "meals", status: "submitted", expense_date: "2026-10-04" },
        { amount: 9999, category: "repairs", status: "rejected", expense_date: "2026-10-04" },
        { amount: 2500, category: "repairs", status: "approved", expense_date: "2026-09-20" },
    ],
    recyclable_movements: [
        { direction: "in", amount: 12000, movement_date: "2026-10-08" },
        { direction: "in", amount: null, movement_date: "2026-10-08" },
        { direction: "out", amount: 9000, movement_date: "2026-10-07" },
    ],
});

async function october() {
    const { client } = fakeSupabase(base());
    const [september, october] = await loadCashflow(client, monthsEndingAt("2026-10", 2));
    return { september, october };
}

describe("months", () => {
    it("lists the months ending at a month, oldest first", () => {
        expect(monthsEndingAt("2026-10", 3)).toEqual(["2026-08", "2026-09", "2026-10"]);
        expect(monthsEndingAt("2027-01", 3)).toEqual(["2026-11", "2026-12", "2027-01"]);
    });
});

describe("money in", () => {
    it("sorts payments by what they were for", async () => {
        const { october: o } = await october();

        expect(o.inBySource.monthly).toEqual({ amount: 18000, count: 3 }); // 10,000 + 2,000 (1 Oct, Lagos) + legacy 6,000
        expect(o.inBySource.manual).toEqual({ amount: 4000, count: 1 });
        expect(o.inBySource.unregistered).toEqual({ amount: 15000, count: 1 });
        expect(o.inBySource.recyclables).toEqual({ amount: 9000, count: 1 });
        expect(o.inBySource.advance).toEqual({ amount: 30000, count: 1 });
    });

    it("counts a payment on the day it was received in Lagos, not UTC", async () => {
        const { september, october: o } = await october();

        expect(september.inBySource.monthly.amount).toBe(7000);
        expect(o.inBySource.monthly.amount).toBeGreaterThanOrEqual(12000);
    });

    it("does not count an invoice settled from an advance payment a second time", async () => {
        const { october: o } = await october();

        expect(o.inTotal).toBe(18000 + 4000 + 15000 + 9000 + 30000 + 5000);
    });

    it("counts registration fees, but not waived ones", async () => {
        const { october: o } = await october();

        expect(o.inBySource.registration).toEqual({ amount: 5000, count: 1 });
    });

    it("splits money in by method", async () => {
        const { october: o } = await october();

        expect(o.inByMethod).toEqual({ "Bank transfer": 10000 + 2000 + 9000 + 30000 + 5000, Cash: 4000 + 6000, POS: 15000 });
    });
});

describe("money out", () => {
    it("counts only approved and paid-back expenses, by category", async () => {
        const { october: o } = await october();

        expect(o.outByCategory.fuel).toEqual({ amount: 4500, count: 2 });
        expect(o.outByCategory.meals.amount).toBe(0);
        expect(o.outByCategory.repairs.amount).toBe(0);
    });

    it("keeps waiting claims apart and ignores rejected ones", async () => {
        const { october: o } = await october();

        expect(o.waiting).toEqual({ amount: 800, count: 1 });
    });

    it("counts recyclables bought, and ignores entries with no price", async () => {
        const { october: o } = await october();

        expect(o.outByCategory.recyclables).toEqual({ amount: 12000, count: 1 });
        expect(o.outTotal).toBe(4500 + 12000);
    });

    it("counts an expense in the month it was spent", async () => {
        const { september } = await october();

        expect(september.outByCategory.repairs).toEqual({ amount: 2500, count: 1 });
    });
});

describe("before the newer SQL has been run", () => {
    it("still works with only the original tables", async () => {
        const { client } = fakeSupabase({
            payment_installments: [{ payment_id: "a", amount: 1000, method: "Cash", paid_at: "2026-10-03T10:00:00Z" }],
            payments: [{ id: "a", customer_id: "c1", auto_generated: true, bill_to: null, payment_method: null }],
            customers: [],
            expenses: [],
        });

        const [flow] = await loadCashflow(client, ["2026-10"]);

        expect(flow.inTotal).toBe(1000);
        expect(flow.outTotal).toBe(0);
    });
});
