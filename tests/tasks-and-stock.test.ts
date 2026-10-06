import { afterEach, describe, expect, it, vi } from "vitest";
import { nextPickupDay, taskDisplayStatus } from "@/lib/tasks";
import { DEFAULT_BUY_PRICES, loadBuyPrices, MATERIALS, summarise } from "@/lib/recyclables";
import { fakeSupabase } from "./helpers/fakeSupabase";
import { canMoveExpense } from "@/lib/expenses";

afterEach(() => vi.useRealTimers());

describe("moving a pickup to the next day", () => {
    it("moves it one day later", () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date("2026-10-05T10:00:00Z"));

        expect(nextPickupDay("2026-10-08")).toBe("2026-10-09");
        expect(nextPickupDay("2026-10-31")).toBe("2026-11-01");
        expect(nextPickupDay("2026-12-31")).toBe("2027-01-01");
    });

    it("moves a pickup whose date has passed to tomorrow, not to the day after that date", () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date("2026-10-05T10:00:00Z"));

        expect(nextPickupDay("2026-10-01")).toBe("2026-10-06");
    });

    it("uses Lagos time for today", () => {
        vi.useFakeTimers();
        // 23:30 UTC on the 5th is already the 6th in Lagos
        vi.setSystemTime(new Date("2026-10-05T23:30:00Z"));

        expect(nextPickupDay("2026-10-01")).toBe("2026-10-07");
    });
});

describe("how a task's state is named", () => {
    it("calls a pending task with someone on it assigned", () => {
        expect(taskDisplayStatus("pending", true)).toBe("assigned");
        expect(taskDisplayStatus("pending", false)).toBe("pending");
        expect(taskDisplayStatus(null, false)).toBe("pending");
    });

    it("calls a finished pickup serviced and keeps the rest readable", () => {
        expect(taskDisplayStatus("completed", true)).toBe("serviced");
        expect(taskDisplayStatus("in progress", true)).toBe("in_progress");
    });
});

describe("recyclables stock", () => {
    it("is what came in minus what went out, per material and overall", () => {
        const stock = summarise([
            { direction: "in", material: "plastic", kg: "500" },
            { direction: "in", material: "plastic", kg: 250 },
            { direction: "out", material: "plastic", kg: "600" },
            { direction: "in", material: "metal", kg: 120.5 },
            { direction: "out", material: "metal", kg: 20 },
        ]);

        expect(stock.byMaterial.plastic).toEqual({ inKg: 750, outKg: 600, stock: 150 });
        expect(stock.byMaterial.metal).toEqual({ inKg: 120.5, outKg: 20, stock: 100.5 });
        expect(stock.inKg).toBe(870.5);
        expect(stock.outKg).toBe(620);
        expect(stock.stock).toBe(250.5);
    });

    it("starts at zero for every material", () => {
        const stock = summarise([]);

        expect(stock.stock).toBe(0);
        expect(Object.values(stock.byMaterial).every((m) => m.stock === 0)).toBe(true);
    });

    it("can say the table doesn't exist yet", () => {
        expect(summarise([], false).table).toBe(false);
    });
});

describe("expense review order", () => {
    it("lets a waiting claim be approved or rejected, not paid back", () => {
        expect(canMoveExpense("submitted", "approved")).toBe(true);
        expect(canMoveExpense("submitted", "rejected")).toBe(true);
        expect(canMoveExpense("submitted", "reimbursed")).toBe(false);
    });

    it("lets an approved claim be paid back or rejected", () => {
        expect(canMoveExpense("approved", "reimbursed")).toBe(true);
        expect(canMoveExpense("approved", "rejected")).toBe(true);
    });

    it("lets a rejected claim be reconsidered but not paid back directly", () => {
        expect(canMoveExpense("rejected", "approved")).toBe(true);
        expect(canMoveExpense("rejected", "reimbursed")).toBe(false);
    });

    it("treats paid back as final", () => {
        expect(canMoveExpense("reimbursed", "approved")).toBe(false);
        expect(canMoveExpense("reimbursed", "rejected")).toBe(false);
    });
});

describe("recyclable buying prices", () => {
    it("start at the agreed rates and only for real materials", () => {
        expect(DEFAULT_BUY_PRICES).toMatchObject({ pet_bottles: 200, plastic: 200, metal: 300, cans: 1000, paper: 100 });

        const known = new Set<string>(MATERIALS.map((m) => m.value));
        for (const material of Object.keys(DEFAULT_BUY_PRICES)) expect(known.has(material)).toBe(true);
    });

    it("use the saved price over the starting one, and 0 for a material with no price", async () => {
        const prices = await loadBuyPrices(fakeSupabase({ recyclable_prices: [{ material: "cans", buy_price_per_kg: "1200" }] }).client);

        expect(prices.cans).toBe(1200);
        expect(prices.plastic).toBe(200);
        expect(prices.glass).toBe(0);
    });
});
