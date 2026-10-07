import { describe, expect, it } from "vitest";
import { personKey, phoneKey } from "@/lib/billing/billTo";

describe("who an unregistered person is", () => {
    it("matches a phone number typed with or without the leading zero or country code", () => {
        expect(phoneKey("0803 123 4567")).toBe("8031234567");
        expect(phoneKey("+234 803 123 4567")).toBe("8031234567");
        expect(phoneKey(null)).toBe("");
    });

    it("uses the email first, then the phone, then the name", () => {
        expect(personKey({ email: " Ada@Example.com ", phone: "0803 123 4567", full_name: "Ada" })).toBe("ada@example.com");
        expect(personKey({ email: null, phone: "0803 123 4567", full_name: "Ada" })).toBe("8031234567");
        expect(personKey({ email: "", phone: "", full_name: "  Ada Obi " })).toBe("ada obi");
    });

    it("gives the same key to an invoice and an advance payment for the same person", () => {
        const invoice = { email: "ada@example.com", phone: null, full_name: "Ada Obi" };
        const advance = { email: "ADA@example.com", phone: "0803 123 4567", full_name: "Ada" };

        expect(personKey(invoice)).toBe(personKey(advance));
    });
});
