import { describe, expect, it } from "vitest";
import { isWaivedFee, WAIVED_REFERENCE } from "@/lib/finance/registration";

describe("waived registration fees", () => {
    it("recognise the waived note, however it was worded", () => {
        expect(isWaivedFee(WAIVED_REFERENCE)).toBe(true);
        expect(isWaivedFee("Existing customer, fee waived")).toBe(true);
        expect(isWaivedFee("Fee WAIVED by owner")).toBe(true);
    });

    it("count anything else as money received", () => {
        expect(isWaivedFee("Confirmed by admin")).toBe(false);
        expect(isWaivedFee("Paid in cash on 12 March")).toBe(false);
        expect(isWaivedFee(null)).toBe(false);
        expect(isWaivedFee(undefined)).toBe(false);
    });
});
