import { describe, expect, it } from "vitest";
import {
    billingMonthKey,
    billingMonthLabel,
    buildLineItems,
    firstMonthKeyOf,
    itemsTotal,
    monthRangeLabel,
    monthsFrom,
    normalizeLineItems,
    tooEarlyToBill,
} from "@/lib/billing/pricing";

// Lagos is UTC+1, so 23:30 UTC on the 24th is already the 25th there.
describe("billing month (invoices switch over on the 25th, Lagos time)", () => {
    it("is last month until the 25th", () => {
        expect(billingMonthLabel(new Date("2026-10-05T12:00:00Z"))).toBe("September 2026");
        expect(billingMonthLabel(new Date("2026-10-24T22:30:00Z"))).toBe("September 2026");
        expect(billingMonthKey(new Date("2026-10-24T22:30:00Z"))).toBe("2026-09");
    });

    it("becomes the current month from the 25th in Lagos, not UTC", () => {
        expect(billingMonthLabel(new Date("2026-10-24T23:30:00Z"))).toBe("October 2026");
        expect(billingMonthLabel(new Date("2026-10-31T12:00:00Z"))).toBe("October 2026");
        expect(billingMonthKey(new Date("2026-10-25T08:00:00Z"))).toBe("2026-10");
    });

    it("crosses the year boundary", () => {
        expect(billingMonthLabel(new Date("2027-01-10T12:00:00Z"))).toBe("December 2026");
        expect(billingMonthLabel(new Date("2027-01-26T12:00:00Z"))).toBe("January 2027");
    });
});

describe("month labels", () => {
    it("reads the first month out of a label", () => {
        expect(firstMonthKeyOf("October 2026")).toBe("2026-10");
        expect(firstMonthKeyOf("October – December 2026")).toBe("2026-10");
        expect(firstMonthKeyOf("December 2026 – February 2027")).toBe("2026-12");
        expect(firstMonthKeyOf("Waste charge")).toBeNull();
        expect(firstMonthKeyOf(null)).toBeNull();
    });

    it("lists and labels a run of months", () => {
        expect(monthsFrom("2026-12", 3)).toEqual(["December 2026", "January 2027", "February 2027"]);
        expect(monthRangeLabel(["October 2026"])).toBe("October 2026");
        expect(monthRangeLabel(monthsFrom("2026-10", 3))).toBe("October – December 2026");
        expect(monthRangeLabel(monthsFrom("2026-11", 3))).toBe("November 2026 – January 2027");
    });
});

describe("too early to bill", () => {
    const oct10 = new Date("2026-10-10T12:00:00Z");

    it("blocks a single month that has not started billing", () => {
        expect(tooEarlyToBill("October 2026", oct10)).toMatch(/start on 25 October/);
        expect(tooEarlyToBill("November 2026", oct10)).toMatch(/start on 25 November/);
    });

    it("allows the billing month, earlier months, and any month from the 25th", () => {
        expect(tooEarlyToBill("September 2026", oct10)).toBeNull();
        expect(tooEarlyToBill("August 2026", oct10)).toBeNull();
        expect(tooEarlyToBill("October 2026", new Date("2026-10-25T08:00:00Z"))).toBeNull();
    });

    it("allows a range, because that is paying ahead", () => {
        expect(tooEarlyToBill("October – December 2026", oct10)).toBeNull();
        expect(tooEarlyToBill("October to December 2026", oct10)).toBeNull();
        expect(tooEarlyToBill("October 2026 - January 2027", oct10)).toBeNull();
    });
});

describe("monthly charge from property units", () => {
    it("prices residential units at the standard rates, minus vacant ones", () => {
        const items = buildLineItems({ flatsCount: "2", studioCount: "3" }, { studioCount: "1" });

        expect(items).toEqual([
            { label: "Flat", quantity: 2, unit_price: 5000, note: undefined },
            { label: "Studio apartment", quantity: 2, unit_price: 5000, note: "3 registered, 1 vacant" },
        ]);
        expect(itemsTotal(items)).toBe(20000);
    });

    it("leaves commercial types unpriced, for an admin to price", () => {
        expect(buildLineItems({ hotelsCount: "1", schoolsCount: "2" }, {})).toEqual([]);
    });

    it("leaves a type off the invoice when every unit of it is vacant, so there is no zero-naira line", () => {
        expect(buildLineItems({ flatsCount: "1" }, { flatsCount: "5" })).toEqual([]);
        expect(buildLineItems({ flatsCount: "2", shopsCount: "1" }, { flatsCount: "2" }).map((i) => i.label)).toEqual(["Shop"]);
    });
});

describe("line items", () => {
    it("keeps decimal weights and drops lines with no label", () => {
        const items = normalizeLineItems([
            { label: "Plastic (per kg)", quantity: 250.5, unit_price: 180 },
            { label: "   ", quantity: 1, unit_price: 100 },
            { label: "Fee", quantity: "2", unit_price: "1500", note: "  once " },
        ]);

        expect(items).toEqual([
            { label: "Plastic (per kg)", quantity: 250.5, unit_price: 180, note: undefined },
            { label: "Fee", quantity: 2, unit_price: 1500, note: "once" },
        ]);
        expect(itemsTotal(items)).toBe(250.5 * 180 + 3000);
    });

    it("treats anything that is not a list as empty", () => {
        expect(normalizeLineItems(null)).toEqual([]);
        expect(normalizeLineItems("nope")).toEqual([]);
    });
});
