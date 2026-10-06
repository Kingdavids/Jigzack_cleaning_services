import { afterEach, describe, expect, it, vi } from "vitest";
import { checkSaleStock, invoiceDescription, invoiceInsertError, readBillTo, readBuiltInvoice } from "@/lib/admin/invoice-input";
import { fakeSupabase } from "./helpers/fakeSupabase";

afterEach(() => vi.useRealTimers());

const form = (fields: Record<string, string>) => {
    const data = new FormData();
    for (const [key, value] of Object.entries(fields)) data.set(key, value);
    return data;
};

const serviceForm = (extra: Record<string, string> = {}) =>
    form({
        invoiceKind: "service",
        lineItems: JSON.stringify([{ label: "Flat (3 months)", quantity: 2, unit_price: 15000 }]),
        invoiceMonth: "September – November 2026",
        coveredMonths: JSON.stringify(["September 2026", "October 2026", "November 2026"]),
        propertyDetails: JSON.stringify({ flatsCount: 2 }),
        arrears: "2500",
        ...extra,
    });

describe("reading a property service invoice", () => {
    it("keeps the months, the unit counts and the arrears", () => {
        const read = readBuiltInvoice(serviceForm());

        expect(read).toMatchObject({
            kind: "service",
            amount: 30000,
            arrears: 2500,
            invoiceMonth: "September – November 2026",
            coveredMonths: ["September 2026", "October 2026", "November 2026"],
            propertyDetails: { flatsCount: "2" },
        });
    });

    it("refuses a single month before its invoices start", () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date("2026-10-05T10:00:00Z"));

        expect(readBuiltInvoice(serviceForm({ invoiceMonth: "October 2026", coveredMonths: JSON.stringify(["October 2026"]) }))).toEqual({
            error: expect.stringMatching(/start on 25 October/),
        });
    });

    it("asks for something to bill", () => {
        expect(readBuiltInvoice(serviceForm({ lineItems: "[]" }))).toEqual({ error: expect.stringMatching(/units/) });
        expect(readBuiltInvoice(serviceForm({ lineItems: JSON.stringify([{ label: "Free", quantity: 1, unit_price: 0 }]) }))).toEqual({
            error: expect.stringMatching(/more than zero/),
        });
    });

    it("says when the details could not be read", () => {
        expect(readBuiltInvoice(serviceForm({ lineItems: "{not json" }))).toEqual({ error: expect.stringMatching(/couldn't be read/) });
    });
});

describe("reading a sale of recyclables", () => {
    const sale = (lines: unknown[], extra: Record<string, string> = {}) =>
        form({
            invoiceKind: "recyclables",
            lineItems: JSON.stringify([{ label: "Plastic (per kg)", quantity: 250.5, unit_price: 180 }]),
            recyclableLines: JSON.stringify(lines),
            invoiceMonth: "October 2026",
            coveredMonths: JSON.stringify(["October 2026"]),
            arrears: "9000",
            ...extra,
        });

    it("is not a month of service, so it has no month, covers no months and carries no arrears", () => {
        const read = readBuiltInvoice(sale([{ material: "plastic", kg: 250.5, price: 180 }]));

        expect(read).toMatchObject({ kind: "recyclables", invoiceMonth: null, coveredMonths: [], amount: 45090 });
        // the early-billing rule is about months of service; a sale is never blocked by it
        expect("error" in read).toBe(false);
    });

    it("takes the weight and price of each material", () => {
        const read = readBuiltInvoice(sale([{ material: "plastic", kg: "250.5", price: "180" }, { material: "metal", kg: 10, price: 400 }]));

        expect(read).toMatchObject({
            sales: [
                { material: "plastic", materialNote: null, kg: 250.5, price: 180 },
                { material: "metal", materialNote: null, kg: 10, price: 400 },
            ],
        });
    });

    it("drops lines with no weight or an unknown material", () => {
        const read = readBuiltInvoice(sale([{ material: "plastic", kg: 0, price: 180 }, { material: "gold", kg: 5, price: 1 }, { material: "glass", kg: 5, price: 20 }]));

        expect(read).toMatchObject({ sales: [{ material: "glass", kg: 5, price: 20 }] });
    });

    it("needs a name for an other material", () => {
        expect(readBuiltInvoice(sale([{ material: "other", materialNote: "  ", kg: 5, price: 20 }]))).toEqual({ error: expect.stringMatching(/other/) });
        expect(readBuiltInvoice(sale([{ material: "other", materialNote: "Used tyres", kg: 5, price: 20 }]))).toMatchObject({
            sales: [{ material: "other", materialNote: "Used tyres" }],
        });
    });

    it("asks for a material when there are none", () => {
        expect(readBuiltInvoice(form({ invoiceKind: "recyclables", lineItems: "[]", recyclableLines: "[]" }))).toEqual({
            error: expect.stringMatching(/material/),
        });
    });
});

describe("reading another service or item", () => {
    it("has no month and no property", () => {
        const read = readBuiltInvoice(form({ invoiceKind: "other", lineItems: JSON.stringify([{ label: "Skip hire", quantity: 2.5, unit_price: 12000 }]), arrears: "500" }));

        expect(read).toMatchObject({ kind: "other", amount: 30000, invoiceMonth: null, coveredMonths: [], propertyDetails: {} });
    });

    it("treats an unknown type as a normal service", () => {
        expect(readBuiltInvoice(serviceForm({ invoiceKind: "mystery" }))).toMatchObject({ kind: "service" });
    });
});

describe("who an invoice is for", () => {
    const person = (extra: Record<string, string> = {}) =>
        form({ fullName: "Ade Bello", phone: "08030000000", address: "12 Marina", propertyName: "Grace Hotel", ...extra });

    it("keeps the property name, which prints alone as the account holder", () => {
        expect(readBillTo(person())).toMatchObject({ billTo: { full_name: "Ade Bello", property_name: "Grace Hotel", address: "12 Marina" } });
    });

    it("needs a name, and a phone or an email", () => {
        expect(readBillTo(person({ fullName: " " }))).toEqual({ error: expect.stringMatching(/name/) });
        expect(readBillTo(person({ phone: "" }))).toEqual({ error: expect.stringMatching(/phone number or an email/) });
        expect(readBillTo(person({ phone: "", email: "ade@example.com" }))).toHaveProperty("billTo");
    });

    it("checks the email looks right", () => {
        expect(readBillTo(person({ email: "not-an-email" }))).toEqual({ error: expect.stringMatching(/email/) });
    });

    it("needs an address for a property service, but not for a sale or another item", () => {
        expect(readBillTo(person({ address: "" }))).toEqual({ error: expect.stringMatching(/address/) });
        expect(readBillTo(person({ address: "" }), "recyclables")).toHaveProperty("billTo");
        expect(readBillTo(person({ address: "" }), "other")).toHaveProperty("billTo");
    });
});

describe("what an invoice says it is for", () => {
    it("describes each kind", () => {
        expect(invoiceDescription("service", "October 2026")).toBe("Waste management service, October 2026");
        expect(invoiceDescription("service", null)).toBe("Waste management service");
        expect(invoiceDescription("recyclables", null)).toBe("Sale of recyclables");
        expect(invoiceDescription("other", null)).toBe("Services and items");
    });

    it("points to the SQL file that is missing", () => {
        expect(invoiceInsertError('column "invoice_kind" does not exist')).toMatch(/recyclables-trading/);
        expect(invoiceInsertError('column "covered_months" does not exist')).toMatch(/invoice-months/);
        expect(invoiceInsertError('column "bill_to" does not exist')).toMatch(/non-customer-invoices/);
        expect(invoiceInsertError("something else")).toMatch(/try again/i);
    });
});

describe("selling no more than is in stock", () => {
    const stock = () =>
        fakeSupabase({
            recyclable_movements: [
                { direction: "in", material: "plastic", kg: 300 },
                { direction: "in", material: "plastic", kg: 100 },
                { direction: "out", material: "plastic", kg: 50 },
                { direction: "in", material: "metal", kg: 20 },
            ],
        }).client;

    it("allows a sale within stock", async () => {
        expect(await checkSaleStock(stock(), [{ material: "plastic", materialNote: null, kg: 350, price: 100 }])).toBeNull();
    });

    it("refuses a sale of more than is in stock, naming how much there is", async () => {
        expect(await checkSaleStock(stock(), [{ material: "plastic", materialNote: null, kg: 351, price: 100 }])).toMatch(/Only 350 kg of plastic/);
    });

    it("adds up several lines of the same material", async () => {
        const lines = [
            { material: "plastic", materialNote: null, kg: 200, price: 100 },
            { material: "plastic", materialNote: null, kg: 200, price: 100 },
        ];

        expect(await checkSaleStock(stock(), lines)).toMatch(/Only 350 kg of plastic/);
    });

    it("refuses a material that has never been in stock", async () => {
        expect(await checkSaleStock(stock(), [{ material: "glass", materialNote: null, kg: 1, price: 10 }])).toMatch(/Only 0 kg of glass/);
    });

    it("says tracking is not switched on when the table is missing", async () => {
        const none = fakeSupabase({}).client;

        expect(await checkSaleStock(none, [{ material: "plastic", materialNote: null, kg: 1, price: 10 }])).toMatch(/switched on/);
    });
});
