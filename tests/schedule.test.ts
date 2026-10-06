import { describe, expect, it } from "vitest";
import { addDays, customerFrequency, describeFrequency, frequencyToDays, generateDates, monthWindow, parseFrequency } from "@/lib/billing/schedule";

const dayName = (key: string) => ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][new Date(`${key}T00:00:00Z`).getUTCDay()];

describe("reading how often a customer wants pickups", () => {
    it("understands the sign-up choices", () => {
        expect(parseFrequency("Weekly")).toEqual({ kind: "perWeek", times: 1 });
        expect(parseFrequency("Bi-weekly")).toEqual({ kind: "everyNDays", days: 14 });
        expect(parseFrequency("Monthly")).toEqual({ kind: "monthly" });
        expect(parseFrequency("Daily")).toEqual({ kind: "daily" });
    });

    it("understands counts and named days in the customer's own words", () => {
        expect(parseFrequency("twice a week")).toEqual({ kind: "perWeek", times: 2 });
        expect(parseFrequency("3 times a week")).toEqual({ kind: "perWeek", times: 3 });
        expect(parseFrequency("Monday, Wednesday and Friday")).toEqual({ kind: "weekdays", days: [1, 3, 5] });
        expect(parseFrequency("Monday to Friday")).toEqual({ kind: "weekdays", days: [1, 2, 3, 4, 5] });
        expect(parseFrequency("twice a week, Tuesday and Friday")).toEqual({ kind: "weekdays", days: [2, 5] });
    });

    it("keeps the day when fortnightly or monthly pickups name one", () => {
        expect(parseFrequency("Bi-weekly on Wednesday")).toEqual({ kind: "everyNDays", days: 14, weekday: 3 });
        expect(parseFrequency("Monthly on Friday")).toEqual({ kind: "monthly", weekday: 5 });
    });

    it("says it did not understand rather than guessing", () => {
        expect(parseFrequency("whenever you can")).toEqual({ kind: "unknown" });
        expect(parseFrequency("")).toEqual({ kind: "unknown" });
        expect(parseFrequency(null)).toEqual({ kind: "unknown" });
    });

    it("lets days an admin chose win over what the customer wrote", () => {
        expect(customerFrequency({ preferred_pickup_frequency: "Monthly", pickup_days: [4, 1] })).toEqual({ kind: "weekdays", days: [1, 4] });
        expect(customerFrequency({ preferred_pickup_frequency: "Weekly", pickup_days: [] })).toEqual({ kind: "perWeek", times: 1 });
        // Sundays are never a pickup day
        expect(customerFrequency({ pickup_days: [0, 2] })).toEqual({ kind: "weekdays", days: [2] });
    });

    it("describes a pattern in words", () => {
        expect(describeFrequency({ kind: "everyNDays", days: 14, weekday: 3 })).toBe("Every 2 weeks on Wednesday");
        expect(describeFrequency({ kind: "monthly", weekday: 5 })).toBe("First Friday of each month");
        expect(describeFrequency({ kind: "unknown" })).toMatch(/not recognised/i);
    });
});

describe("generating pickup dates", () => {
    it("puts weekly pickups on the days named, never on a Sunday", () => {
        const dates = generateDates({ kind: "weekdays", days: [0, 2] }, "2026-10-01", 30);

        expect(dates).toEqual(["2026-10-06", "2026-10-13", "2026-10-20", "2026-10-27"]);
        expect(dates.every((d) => dayName(d) === "Tue")).toBe(true);
    });

    it("keeps a weekly customer on the same weekday as their last pickup", () => {
        const dates = generateDates({ kind: "perWeek", times: 1 }, "2026-11-01", 29, "2026-10-27");

        expect(dates).toEqual(["2026-11-03", "2026-11-10", "2026-11-17", "2026-11-24"]);
    });

    it("starts a weekly customer with no history on the first non-Sunday", () => {
        expect(generateDates({ kind: "perWeek", times: 1 }, "2026-11-01", 14)[0]).toBe("2026-11-02");
    });

    it("keeps fortnightly pickups on their named day, and carries on from the last one", () => {
        expect(generateDates({ kind: "everyNDays", days: 14, weekday: 3 }, "2026-10-01", 45)).toEqual(["2026-10-07", "2026-10-21", "2026-11-04"]);
        expect(generateDates({ kind: "everyNDays", days: 14, weekday: 3 }, "2026-11-01", 29, "2026-10-28")).toEqual(["2026-11-11", "2026-11-25"]);
    });

    it("puts a monthly pickup on the first of the named day each month", () => {
        expect(generateDates({ kind: "monthly", weekday: 5 }, "2026-10-01", 90)).toEqual(["2026-10-02", "2026-11-06", "2026-12-04"]);
    });

    it("keeps a monthly pickup on the same date, and moves a Sunday forward", () => {
        // 31 October -> 30 November (no 31st), then 31 December. Neither is a Sunday here.
        expect(generateDates({ kind: "monthly" }, "2026-11-01", 60, "2026-10-31")).toEqual(["2026-11-30", "2026-12-31"]);
        // 15 November 2026 is a Sunday, so it moves to the Monday.
        expect(generateDates({ kind: "monthly" }, "2026-11-01", 20, "2026-10-15")).toEqual(["2026-11-16"]);
    });

    it("treats an unrecognised frequency as weekly", () => {
        expect(generateDates({ kind: "unknown" }, "2026-10-01", 14)).toEqual(generateDates({ kind: "perWeek", times: 1 }, "2026-10-01", 14));
    });

    it("skips Sundays for daily pickups", () => {
        const dates = generateDates({ kind: "daily" }, "2026-10-01", 13);

        expect(dates).toHaveLength(12);
        expect(dates.some((d) => dayName(d) === "Sun")).toBe(false);
    });
});

describe("dates and windows", () => {
    it("adds days across month ends", () => {
        expect(addDays("2026-10-31", 1)).toBe("2026-11-01");
        expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    });

    it("covers the whole of next month", () => {
        const window = monthWindow("nextMonth", "2026-10-15");

        expect(window.startKey).toBe("2026-11-01");
        expect(window.horizonDays).toBe(29);
        expect(window.label).toBe("November 2026");
    });

    it("turns a pattern into the weekdays it comes to", () => {
        expect(frequencyToDays({ kind: "perWeek", times: 3 })).toEqual([1, 3, 5]);
        expect(frequencyToDays({ kind: "weekdays", days: [0, 2] })).toEqual([2]);
        expect(frequencyToDays({ kind: "monthly" })).toEqual([]);
    });
});
