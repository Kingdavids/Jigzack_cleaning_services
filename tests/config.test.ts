import { afterEach, describe, expect, it, vi } from "vitest";
import { BUSINESS, REGISTRATION_FEE_NGN, TIMEZONE, TIMEZONE_OFFSET } from "@/lib/config/business";
import { contactFormRecipients } from "@/lib/config/private";
import { SITE } from "@/lib/seo";
import { BANK_ACCOUNT } from "@/lib/bank-details";
import { INVOICE_DAY, UNIT_PRICES } from "@/lib/billing/pricing";
import { DOMESTIC_FACILITIES } from "@/lib/customer/facilities";

afterEach(() => vi.unstubAllEnvs());

describe("business settings", () => {
    it("are the single source for the site, bank details, prices and invoice day", () => {
        expect(SITE.name).toBe(BUSINESS.name);
        expect(SITE.email).toBe(BUSINESS.contact.email);
        expect(SITE.phone).toBe(BUSINESS.contact.phone.international);
        expect(BANK_ACCOUNT.name).toBe(BUSINESS.bank.accountName);
        expect(BANK_ACCOUNT.banks).toEqual(BUSINESS.bank.banks);
        expect(UNIT_PRICES).toBe(BUSINESS.billing.unitPrices);
        expect(INVOICE_DAY).toBe(BUSINESS.billing.invoiceDay);
    });

    it("prints the business name in capitals on invoices", () => {
        expect(BUSINESS.invoiceName).toBe(BUSINESS.name.toUpperCase());
        expect(BUSINESS.bank.accountName).toBe(BUSINESS.invoiceName);
    });

    it("gives a phone number a link that dials the international form", () => {
        expect(BUSINESS.contact.phone.href).toBe(`tel:${BUSINESS.contact.phone.international}`);
        expect(BUSINESS.contact.phone.international).toMatch(/^\+\d{10,15}$/);
        expect(BUSINESS.contact.supportPhones).toContain(BUSINESS.contact.phone.display);
    });

    it("prices only property types that exist on the sign-up form", () => {
        const known = new Set(DOMESTIC_FACILITIES.map((f) => f.key));

        for (const [type, price] of Object.entries(BUSINESS.billing.unitPrices)) {
            expect(known.has(type), `${type} is not a residential property type`).toBe(true);
            expect(price).toBeGreaterThan(0);
        }
    });

    it("has a valid invoice day that every month has", () => {
        expect(BUSINESS.billing.invoiceDay).toBeGreaterThanOrEqual(1);
        expect(BUSINESS.billing.invoiceDay).toBeLessThanOrEqual(28);
    });

    it("uses a UTC offset that matches its timezone all year", () => {
        const offsetIn = (iso: string) => {
            const date = new Date(iso);
            const parts = new Intl.DateTimeFormat("en-GB", { timeZone: TIMEZONE, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(date);
            const hours = Number(parts.slice(0, 2)) - date.getUTCHours();
            const signed = hours > 12 ? hours - 24 : hours < -12 ? hours + 24 : hours;
            return `${signed >= 0 ? "+" : "-"}${String(Math.abs(signed)).padStart(2, "0")}:00`;
        };

        expect(offsetIn("2026-01-15T12:00:00Z")).toBe(TIMEZONE_OFFSET);
        expect(offsetIn("2026-07-15T12:00:00Z")).toBe(TIMEZONE_OFFSET);
    });

    it("charges a registration fee", () => {
        expect(REGISTRATION_FEE_NGN).toBeGreaterThan(0);
    });
});

// The contact form's inboxes were kept out of the pages on purpose. The public
// settings are bundled into the browser, so they must never hold them.
describe("private settings stay private", () => {
    it("keeps the contact form inboxes out of the public settings", () => {
        const publicText = JSON.stringify(BUSINESS);

        for (const address of contactFormRecipients().filter((a) => a !== BUSINESS.contact.email)) {
            expect(publicText).not.toContain(address);
        }
        expect(publicText).not.toMatch(/gmail\.com/i);
    });

    it("sends the contact form to the inboxes in private.ts, unless the environment says otherwise", () => {
        expect(contactFormRecipients().length).toBeGreaterThan(0);

        vi.stubEnv("CONTACT_RECIPIENTS", " a@example.com , b@example.com ,, ");
        expect(contactFormRecipients()).toEqual(["a@example.com", "b@example.com"]);

        vi.stubEnv("CONTACT_RECIPIENTS", "");
        expect(contactFormRecipients().length).toBeGreaterThan(0);
    });
});
