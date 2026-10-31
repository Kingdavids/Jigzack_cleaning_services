import { describe, expect, it } from "vitest";
import { accountKey, accountKeyer, personKey, phoneKey } from "@/lib/billing/billTo";

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

    it("keeps one person's two properties apart", () => {
        const base = { email: "ada@example.com", phone: "0803 123 4567", full_name: "Ada Obi" };
        const palm = { ...base, property_name: "Palm Court", address: "12 Palm Street" };
        const lake = { ...base, property_name: "Lake View", address: "4 Lake Road" };

        expect(accountKey(palm)).not.toBe(accountKey(lake));
        expect(accountKey(palm)).toBe(accountKey({ ...palm, property_name: " palm  court! " }));
    });

    it("puts an invoice that names no property with the person's only property", () => {
        const base = { email: "ada@example.com", full_name: "Ada Obi" };
        const palm = { ...base, address: "12 Palm Street" };
        const sale = { ...base };

        const one = accountKeyer([palm, sale]);
        expect(one(sale)).toBe(one(palm));

        const lake = { ...base, address: "4 Lake Road" };
        const two = accountKeyer([palm, lake, sale]);
        expect(two(sale)).not.toBe(two(palm));
        expect(two(sale)).not.toBe(two(lake));
    });
});
