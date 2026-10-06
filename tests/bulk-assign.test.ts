import { describe, expect, it } from "vitest";
import { splitAssignable } from "@/lib/tasks";

const task = (over: Partial<{ id: string; status: string | null; employee_id: string | null; scheduled_date: string | null }>) => ({
    id: "t",
    status: "pending",
    employee_id: null,
    scheduled_date: "2026-10-10",
    ...over,
});

describe("bulk assigning pickups", () => {
    it("takes pickups with nobody on them that are dated today or later, or not dated", () => {
        const { ids, skipped } = splitAssignable(
            [task({ id: "a" }), task({ id: "b", scheduled_date: "2026-10-06" }), task({ id: "c", scheduled_date: null })],
            "2026-10-06"
        );

        expect(ids).toEqual(["a", "b", "c"]);
        expect(skipped).toEqual({ assigned: 0, started: 0, past: 0 });
    });

    it("leaves alone anything already assigned, started, serviced or in the past, and says why", () => {
        const { ids, skipped } = splitAssignable(
            [
                task({ id: "ok" }),
                task({ id: "has-driver", employee_id: "e1" }),
                task({ id: "running", status: "in progress" }),
                task({ id: "done", status: "completed" }),
                task({ id: "old", scheduled_date: "2026-10-05" }),
            ],
            "2026-10-06"
        );

        expect(ids).toEqual(["ok"]);
        expect(skipped).toEqual({ assigned: 1, started: 2, past: 1 });
    });

    it("treats a missing status as pending", () => {
        expect(splitAssignable([task({ id: "x", status: null })], "2026-10-06").ids).toEqual(["x"]);
    });
});
