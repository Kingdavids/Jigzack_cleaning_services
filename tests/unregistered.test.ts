import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
    generateInvoiceForUnregistered,
    identityKeys,
    monthlyChargeOf,
    sameIdentity,
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
});
