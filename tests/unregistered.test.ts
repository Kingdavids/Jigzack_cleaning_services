import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
    generateInvoiceForUnregistered,
    identityKeys,
    invoicedForMonth,
    outcomeMessage,
    sameAccount,
    monthlyChargeOf,
    sameIdentity,
    suggestFromInvoices,
    unregisteredLineItems,
    type UnregisteredCustomer,
} from "@/lib/billing/unregistered";

const person = (overrides: Partial<UnregisteredCustomer> = {}): UnregisteredCustomer => ({
    id: "u1",
    full_name: "Ada Obi",
    property_name: null,
    phone: "0803 123 4567",
    whatsapp_number: null,
    email: "ada@example.com",
    address: "12 Palm Street",
    landmark: null,
    lga: "Eti-Osa",
    state: "Lagos",
    property_type: "residential",
    monthly_rate: 15000,
    paused: false,
    note: null,
    created_at: "2026-10-01T00:00:00Z",
    ...overrides,
});

// Just enough of the Supabase query builder: every filter returns the builder,
// awaiting it gives the rows for that table, and inserts are recorded.
function fakeSupabase(rows: Record<string, unknown[]>, insertError: string | null = null) {
    const inserted: Record<string, unknown>[] = [];

    const builder = (table: string) => {
        const chain: Record<string, unknown> = {};
        for (const method of ["select", "is", "not", "or", "eq", "contains", "limit"]) chain[method] = () => chain;
        chain.insert = (row: Record<string, unknown>) => {
            inserted.push(row);
            return Promise.resolve({ error: insertError ? { message: insertError } : null });
        };
        chain.then = (resolve: (value: unknown) => void) => resolve({ data: rows[table] ?? [], error: null });
        return chain;
    };

    return { client: { from: builder } as unknown as SupabaseClient, inserted };
}

describe("unregistered customers", () => {
    it("bills the saved monthly charge on a single line", () => {
        expect(unregisteredLineItems(person({ monthly_rate: "15000.50" }))).toEqual([
            { label: "Monthly waste management service", quantity: 1, unit_price: 15000.5 },
        ]);
        expect(unregisteredLineItems(person({ monthly_rate: 0 }))).toEqual([]);
        expect(monthlyChargeOf(person({ monthly_rate: "abc" }))).toBe(0);
    });

    it("recognises the same person by email, phone or name", () => {
        const me = identityKeys(person());

        expect(sameIdentity(me, identityKeys({ email: " ADA@example.com ", full_name: "Someone Else" }))).toBe(true);
        expect(sameIdentity(me, identityKeys({ phone: "+234 803 123 4567", full_name: "Someone Else" }))).toBe(true);
        expect(sameIdentity(me, identityKeys({ full_name: "ada obi" }))).toBe(true);
        expect(sameIdentity(me, identityKeys({ email: "bola@example.com", phone: "0701 000 0000", full_name: "Bola" }))).toBe(false);
    });

    it("creates the month's invoice with the saved charge and no customer", async () => {
        const { client, inserted } = fakeSupabase({});

        expect(await generateInvoiceForUnregistered(client, person(), new Set(), "November 2026")).toBe("created");
        expect(inserted).toHaveLength(1);
        expect(inserted[0]).toMatchObject({
            customer_id: null,
            amount: 15000,
            invoice_month: "November 2026",
            auto_generated: true,
            bill_to: { full_name: "Ada Obi", email: "ada@example.com" },
        });
    });

    it("leaves out paused people, people with a login, and people with no charge", async () => {
        const { client, inserted } = fakeSupabase({});

        expect(await generateInvoiceForUnregistered(client, person({ paused: true }), new Set(), "November 2026")).toBe("paused");
        expect(await generateInvoiceForUnregistered(client, person(), new Set(["ada@example.com"]), "November 2026")).toBe("registered");
        expect(await generateInvoiceForUnregistered(client, person({ monthly_rate: 0 }), new Set(), "November 2026")).toBe("no-pricing");
        expect(inserted).toHaveLength(0);
    });

    it("does not bill a month that already has an invoice for them", async () => {
        const { client, inserted } = fakeSupabase({ payments: [{ bill_to: { full_name: "Ada Obi", phone: "08031234567" } }] });

        expect(await generateInvoiceForUnregistered(client, person(), new Set(), "November 2026")).toBe("exists");
        expect(inserted).toHaveLength(0);
    });

    it("bills a month when the invoice found belongs to somebody else", async () => {
        const { client, inserted } = fakeSupabase({ payments: [{ bill_to: { full_name: "Bola Ade", phone: "0701 000 0000" } }] });

        expect(await generateInvoiceForUnregistered(client, person(), new Set(), "November 2026")).toBe("created");
        expect(inserted).toHaveLength(1);
    });

    it("skips a month they paid for in advance", async () => {
        const { client, inserted } = fakeSupabase({ prepayments: [{ bill_to: { full_name: "Ada Obi", email: "ada@example.com" } }] });

        expect(await generateInvoiceForUnregistered(client, person(), new Set(), "November 2026")).toBe("prepaid");
        expect(inserted).toHaveLength(0);
    });

    it("reports a failed insert", async () => {
        const { client } = fakeSupabase({}, "boom");

        expect(await generateInvoiceForUnregistered(client, person(), new Set(), "November 2026")).toBe("error");
    });

    describe("suggesting from past invoices", () => {
        const invoice = (name: string, amount: number, created_at: string, extra: Record<string, unknown> = {}) => ({
            bill_to: { full_name: name, phone: name === "Ada Obi" ? "08031234567" : "07010000000" },
            amount,
            created_at,
            invoice_month: "September 2026",
            ...extra,
        });

        it("suggests one month from the latest service invoice and flags differing amounts", () => {
            const [ada] = suggestFromInvoices(
                [invoice("Ada Obi", 12000, "2026-08-25"), invoice("Ada Obi", 15000, "2026-09-25"), invoice("Ada Obi", 90000, "2026-10-01", { invoice_kind: "recyclables" })],
                [],
                new Set()
            );

            expect(ada).toMatchObject({ suggested: 15000, varies: true, invoiceCount: 3 });
        });

        it("shares a multi-month invoice out per month", () => {
            const [ada] = suggestFromInvoices([invoice("Ada Obi", 45000, "2026-09-25", { covered_months: ["October 2026", "November 2026", "December 2026"] })], [], new Set());

            expect(ada).toMatchObject({ suggested: 15000, varies: false });
        });

        it("has no suggestion when there is no service invoice", () => {
            const [buyer] = suggestFromInvoices([invoice("Ada Obi", 90000, "2026-10-01", { invoice_kind: "recyclables" })], [], new Set());

            expect(buyer.suggested).toBe(0);
        });

        it("leaves out people already on the list or with a login", () => {
            const rows = [
                invoice("Ada Obi", 15000, "2026-09-25"),
                invoice("Bola Ade", 8000, "2026-09-25"),
                { ...invoice("Chi Eze", 5000, "2026-09-25"), bill_to: { full_name: "Chi Eze", email: "chi@example.com" } },
            ];

            const left = suggestFromInvoices(rows, [person()], new Set(["chi@example.com"]));

            expect(left.map((entry) => entry.billTo.full_name)).toEqual(["Bola Ade"]);
        });
    });

    describe("this month's invoice", () => {
        const row = (name: string, extra: Record<string, unknown> = {}) => ({
            bill_to: { full_name: name, phone: name === "Ada Obi" ? "08031234567" : "07010000000" },
            amount: 15000,
            created_at: "2026-10-25",
            invoice_month: "October 2026",
            ...extra,
        });

        it("knows who already has the month's invoice, including multi-month ones", () => {
            expect(invoicedForMonth([row("Ada Obi")], person(), "October 2026")).toBe(true);
            expect(invoicedForMonth([row("Ada Obi")], person(), "November 2026")).toBe(false);
            expect(
                invoicedForMonth([row("Ada Obi", { invoice_month: "October – December 2026", covered_months: ["October 2026", "November 2026", "December 2026"] })], person(), "November 2026")
            ).toBe(true);
            expect(invoicedForMonth([row("Bola Ade")], person(), "October 2026")).toBe(false);
        });

        it("explains each outcome", () => {
            expect(outcomeMessage("created", "Ada", "November 2026")).toBe("November 2026 invoice created for Ada.");
            expect(outcomeMessage("exists", "Ada", "November 2026")).toMatch(/already has an invoice/);
            expect(outcomeMessage("paused", "Ada", "November 2026")).toMatch(/paused/);
            expect(outcomeMessage("error", "Ada", "November 2026")).toMatch(/Could not/);
        });
    });

    describe("one person with two properties", () => {
        const first = person({ property_name: "Palm Court", address: "12 Palm Street" });
        const second = person({ id: "u2", property_name: "Lake View", address: "4 Lake Road" });

        it("tells the two properties apart even though phone, email and name match", () => {
            expect(sameAccount(first, second)).toBe(false);
            expect(sameAccount(first, { ...first })).toBe(true);
            expect(sameAccount(first, { ...first, address: "12 palm street", property_name: null })).toBe(true);
        });

        it("bills the second property when only the first has the month's invoice", async () => {
            const { client, inserted } = fakeSupabase({ payments: [{ bill_to: { full_name: "Ada Obi", phone: first.phone, email: first.email, property_name: "Palm Court", address: "12 Palm Street" } }] });

            expect(await generateInvoiceForUnregistered(client, first, new Set(), "November 2026")).toBe("exists");
            expect(await generateInvoiceForUnregistered(client, second, new Set(), "November 2026")).toBe("created");
            expect(inserted).toHaveLength(1);
            expect(inserted[0]).toMatchObject({ bill_to: { property_name: "Lake View" } });
        });

        it("does not let an advance payment for one property cover the other", async () => {
            const { client } = fakeSupabase({ prepayments: [{ bill_to: { full_name: "Ada Obi", phone: first.phone, property_name: "Palm Court", address: "12 Palm Street" } }] });

            expect(await generateInvoiceForUnregistered(client, first, new Set(), "November 2026")).toBe("prepaid");
            expect(await generateInvoiceForUnregistered(client, second, new Set(), "November 2026")).toBe("created");
        });

        it("suggests each property on its own", () => {
            const row = (property: string, address: string, amount: number) => ({
                bill_to: { full_name: "Ada Obi", phone: "08031234567", email: "ada@example.com", property_name: property, address },
                amount,
                created_at: "2026-09-25",
                invoice_month: "September 2026",
            });

            const found = suggestFromInvoices([row("Palm Court", "12 Palm Street", 15000), row("Lake View", "4 Lake Road", 22000)], [], new Set());

            expect(found.map((entry) => [entry.billTo.property_name, entry.suggested])).toEqual([
                ["Lake View", 22000],
                ["Palm Court", 15000],
            ]);

            const left = suggestFromInvoices([row("Palm Court", "12 Palm Street", 15000), row("Lake View", "4 Lake Road", 22000)], [first], new Set());
            expect(left.map((entry) => entry.billTo.property_name)).toEqual(["Lake View"]);
        });
    });
});
