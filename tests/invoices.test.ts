import { describe, expect, it } from "vitest";
import { chargeItems, clearPendingArrears, discountInfo, generateInvoiceFor, type BillableCustomer } from "@/lib/billing/generate";
import { itemsTotal } from "@/lib/billing/pricing";
import { fakeSupabase } from "./helpers/fakeSupabase";

const customer = (extra: Partial<BillableCustomer> = {}): BillableCustomer => ({
    profile_id: "c1",
    full_name: "Ada Okoye",
    lga: "Ikeja",
    preferred_pickup_frequency: "Weekly",
    facility_details: { flatsCount: "2" },
    vacancies: {},
    ...extra,
});

describe("what a month costs a customer", () => {
    it("is their units at the standard prices", () => {
        const items = chargeItems(customer());

        expect(items).toEqual([{ label: "Flat", quantity: 2, unit_price: 5000, note: undefined }]);
        expect(itemsTotal(items)).toBe(10000);
    });

    it("uses the monthly charge an admin set instead", () => {
        const items = chargeItems(customer({ monthly_rate: 20000 }));

        expect(items).toEqual([{ label: "Monthly waste management service", quantity: 1, unit_price: 20000 }]);
    });

    it("takes a standing discount off as its own line", () => {
        const items = chargeItems(customer({ discount_type: "percent", discount_value: 10, discount_reason: "Loyal" }));

        expect(items.map((i) => i.label)).toEqual(["Flat", "Discount (10%): Loyal"]);
        expect(itemsTotal(items)).toBe(9000);
    });

    it("describes the discount as a percentage even when it was a fixed amount", () => {
        const info = discountInfo({ ...customer(), discount_type: "amount", discount_value: 1000, discount_reason: null });

        expect(info?.percent).toBe("10");
    });

    it("has nothing to bill when every unit is vacant", () => {
        expect(chargeItems(customer({ vacancies: { flatsCount: "2" } }))).toEqual([]);
    });
});

describe("creating the monthly invoice", () => {
    it("creates one invoice per customer per month", async () => {
        const { client, tables } = fakeSupabase({ payments: [], customers: [{ profile_id: "c1", arrears: 0 }] });

        expect(await generateInvoiceFor(client, customer(), "September 2026")).toBe("created");
        expect(await generateInvoiceFor(client, customer(), "September 2026")).toBe("exists");
        expect(tables.payments).toHaveLength(1);
        expect(tables.payments[0]).toMatchObject({ customer_id: "c1", amount: 10000, invoice_month: "September 2026", auto_generated: true });
    });

    it("never touches an invoice that already exists for the month, even one made by hand", async () => {
        const { client, tables } = fakeSupabase({
            payments: [{ id: "manual", customer_id: "c1", invoice_month: "September 2026", amount: 123, auto_generated: false }],
            customers: [{ profile_id: "c1", arrears: 0 }],
        });

        expect(await generateInvoiceFor(client, customer(), "September 2026")).toBe("exists");
        expect(tables.payments).toHaveLength(1);
    });

    it("bills a different customer separately", async () => {
        const { client, tables } = fakeSupabase({ payments: [], customers: [] });

        await generateInvoiceFor(client, customer(), "September 2026");
        await generateInvoiceFor(client, customer({ profile_id: "c2" }), "September 2026");

        expect(tables.payments).toHaveLength(2);
    });

    it("skips a customer with nothing priced", async () => {
        const { client } = fakeSupabase({ payments: [], customers: [] });

        expect(await generateInvoiceFor(client, customer({ facility_details: { hotelsCount: "1" } }), "September 2026")).toBe("no-pricing");
    });
});

// Arrears were being copied onto every new invoice, so a customer owing
// money from before was charged for it again each month.
describe("arrears are charged once", () => {
    it("puts arrears on the next invoice and then clears them", async () => {
        const { client, tables } = fakeSupabase({ payments: [], customers: [{ profile_id: "c1", arrears: 10000 }] });

        expect(await generateInvoiceFor(client, customer({ arrears: 10000 }), "September 2026")).toBe("created");
        expect(tables.payments[0]).toMatchObject({ amount: 10000, arrears: 10000 });
        expect(tables.customers[0].arrears).toBe(0);
    });

    it("does not charge them again the following month", async () => {
        const { client, tables } = fakeSupabase({ payments: [], customers: [{ profile_id: "c1", arrears: 10000 }] });

        await generateInvoiceFor(client, customer({ arrears: 10000 }), "September 2026");
        // The next month's run reads the customer again, now with nothing waiting.
        await generateInvoiceFor(client, customer({ arrears: tables.customers[0].arrears as number }), "October 2026");

        expect(tables.payments.map((p) => p.arrears)).toEqual([10000, 0]);
    });

    it("leaves a figure alone if it changed after it was read", async () => {
        const { client, tables } = fakeSupabase({ payments: [], customers: [{ profile_id: "c1", arrears: 4000 }] });

        await clearPendingArrears(client, "c1", 10000);

        expect(tables.customers[0].arrears).toBe(4000);
    });
});
