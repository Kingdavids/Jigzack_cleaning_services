import { describe, expect, it } from "vitest";
import { signInText, stuckReason } from "@/lib/admin/emailStatus";

describe("email status", () => {
    it("says whether someone has ever signed in", () => {
        expect(signInText({ lastSignIn: null })).toBe("Never signed in");
        expect(signInText({ lastSignIn: "2026-10-03T09:00:00Z" })).toBe("Last signed in 3 Oct 2026");
    });

    it("explains why someone may be stuck", () => {
        expect(stuckReason({ confirmed: false, confirmedAt: null, lastSignIn: null })).toMatch(/not confirmed/);
        expect(stuckReason({ confirmed: true, confirmedAt: "2026-10-01T00:00:00Z", lastSignIn: null })).toMatch(/never signed in/);
        expect(stuckReason({ confirmed: true, confirmedAt: "2026-10-01T00:00:00Z", lastSignIn: "2026-10-02T00:00:00Z" })).toBeNull();
        expect(stuckReason(undefined)).toBeNull();
    });
});
