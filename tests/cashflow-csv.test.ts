import { describe, expect, it } from "vitest";
import { loadCashflow, monthsEndingAt } from "@/lib/finance/cashflow";
import { cashflowCsv } from "@/lib/finance/cashflow-csv";
import { fakeSupabase } from "./helpers/fakeSupabase";

const data = () => ({
    payment_installments: [
        { payment_id: "sale", amount: 9000, method: "=Bank transfer", paid_at: "2026-10-07T10:00:00Z" },
        { payment_id: "auto", amount: 10000, method: "Cash, in hand", paid_at: "2026-10-03T10:00:00Z" },
    ],
    payments: [
        { id: "sale", customer_id: "c5", auto_generated: false, bill_to: null, payment_method: null, invoice_kind: "recyclables" },
        { id: "auto", customer_id: "c1", auto_generated: true, bill_to: null, payment_method: null },
    ],
    expenses: [{ amount: 3000, category: "fuel", status: "approved", expense_date: "2026-10-02" }],
    recyclable_movements: [{ direction: "in", amount: 12000, movement_date: "2026-10-08" }],
});

describe("money in & out CSV", () => {
    it("includes the totals and the recyclables profit as plain numbers", async () => {
        const { client } = fakeSupabase(data());
        const flows = await loadCashflow(client, monthsEndingAt("2026-10", 2));
        const csv = cashflowCsv(flows, "2026-10");
        const rows = csv.replace("﻿", "").split("\r\n");

        expect(rows[0]).toBe("Money in & out,October 2026");
        expect(rows).toContain("Money in,19000");
        expect(rows).toContain("Money out,15000");
        expect(rows).toContain("Net,4000");
        expect(rows).toContain("Recyclables sold (received),9000");
        expect(rows).toContain("Recyclables bought,12000");
        expect(rows).toContain("Recyclables profit,-3000");
        expect(rows).toContain("October 2026,19000,15000,4000,9000,12000,-3000");
    });

    it("quotes commas and neutralises formulas typed into a payment method", async () => {
        const { client } = fakeSupabase(data());
        const flows = await loadCashflow(client, monthsEndingAt("2026-10", 2));
        const csv = cashflowCsv(flows, "2026-10");

        expect(csv).toContain('"Cash, in hand",10000');
        expect(csv).toContain("'=Bank transfer,9000");
    });
});
