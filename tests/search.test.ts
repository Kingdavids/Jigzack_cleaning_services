import { describe, expect, it } from "vitest";
import { billToFilter, cleanTerm, customerFilter, invoiceCode, invoiceIdRange, phoneDigits } from "@/lib/admin/search";

describe("search terms", () => {
    it("removes characters that would break a database filter", () => {
        expect(cleanTerm(" Ada, (Ikeja) %* ")).toBe("Ada Ikeja");
        expect(cleanTerm("x".repeat(100))).toHaveLength(60);
    });

    it("reads an invoice number however it is typed", () => {
        expect(invoiceCode("INV-1A2B3C4D")).toBe("1a2b3c4d");
        expect(invoiceCode("inv 1a2b")).toBe("1a2b");
        expect(invoiceCode("1a2b3c")).toBe("1a2b3c");
        expect(invoiceCode("ada")).toBeNull();
        expect(invoiceCode("12")).toBeNull();
    });

    it("turns an invoice number into the range of ids that start with it", () => {
        expect(invoiceIdRange("1a2b")).toEqual({
            from: "1a2b0000-0000-0000-0000-000000000000",
            to: "1a2bffff-ffff-ffff-ffff-ffffffffffff",
        });
        expect(invoiceIdRange("1a2b3c4d").from).toBe("1a2b3c4d-0000-0000-0000-000000000000");
    });

    it("finds a phone number typed with or without the leading zero or country code", () => {
        expect(phoneDigits("0803 123 4567")).toBe("8031234567");
        expect(phoneDigits("+234 803 123 4567")).toBe("8031234567");
        expect(phoneDigits("08031")).toBeNull();
        expect(phoneDigits("Ada 0803123")).toBeNull();
    });

    it("searches every customer column, plus the phone digits", () => {
        const filter = customerFilter("0803 123 4567") ?? "";

        for (const column of ["full_name", "email", "phone", "whatsapp_number", "address", "account_code"]) expect(filter).toContain(`${column}.ilike`);
        expect(filter).toContain("phone.ilike.%8031234567%");
        expect(customerFilter("  ")).toBeNull();
    });

    it("searches the details kept on an invoice for someone who is not registered", () => {
        const filter = billToFilter("Grace") ?? "";

        expect(filter).toContain("bill_to->>full_name.ilike.%Grace%");
        expect(filter).toContain("bill_to->>property_name.ilike.%Grace%");
        expect(filter).toContain("bill_to->>email.ilike.%Grace%");
    });
});
